import { assert, assertEquals } from "$std/assert/mod.ts";
import { nowPlayingEventStream } from "./nowPlayingSse.ts";
import { publicPlayerTrack } from "./preferredPlayer.ts";
import type { NowPlayingSnapshot } from "./nowPlayingFeed.ts";

const snapshot: NowPlayingSnapshot = {
  source: "orange-pi",
  track: publicPlayerTrack(
    { title: "Pi\ntrack", is_playing: true },
    "Orange Pi Zero 3W",
  ),
};
const decoder = new TextDecoder();

Deno.test("SSE sends named JSON snapshots, reconnect delay and cleans up on disconnect", async () => {
  let cleanups = 0;
  const stream = nowPlayingEventStream((listener) => {
    listener(snapshot);
    return () => {
      cleanups++;
    };
  }, new AbortController().signal);
  const reader = stream.getReader();
  assertEquals(decoder.decode((await reader.read()).value), "retry: 3000\n\n");
  const event = decoder.decode((await reader.read()).value);
  assert(event.startsWith("event: now-playing\ndata: "));
  assertEquals(
    JSON.parse(event.split("data: ")[1].trim()),
    JSON.parse(JSON.stringify(snapshot)),
  );
  assertEquals(event.split("\n\n").length, 2);
  await reader.cancel();
  assertEquals(cleanups, 1);
});

Deno.test("SSE coalesces slow-client updates to the newest snapshot", async () => {
  let push: (s: NowPlayingSnapshot) => void = () => {};
  const stream = nowPlayingEventStream((listener) => {
    push = listener;
    return () => {};
  }, new AbortController().signal);
  for (let i = 0; i < 1000; i++) {
    push({ ...snapshot, track: { ...snapshot.track!, title: `Track ${i}` } });
  }
  const reader = stream.getReader();
  await reader.read(); // Retry header occupied the single queued slot.
  const event = decoder.decode((await reader.read()).value);
  assertEquals(
    JSON.parse(event.split("data: ")[1].trim()).track.title,
    "Track 999",
  );
  await reader.cancel();
});

Deno.test("aborting an SSE request releases its subscription", async () => {
  const controller = new AbortController();
  let cleanups = 0;
  const stream = nowPlayingEventStream(() => () => {
    cleanups++;
  }, controller.signal);
  const reader = stream.getReader();
  await reader.read();
  controller.abort();
  assertEquals((await reader.read()).done, true);
  assertEquals(cleanups, 1);
});

Deno.test("SSE heartbeats are named events visible to the browser watchdog", async () => {
  const stream = nowPlayingEventStream(
    () => () => {},
    new AbortController().signal,
    5,
  );
  const reader = stream.getReader();
  try {
    await reader.read();
    const event = decoder.decode((await reader.read()).value);
    assert(event.includes("event: heartbeat\n"));
    assertEquals(
      typeof JSON.parse(event.split("data: ")[1].trim()).at,
      "number",
    );
  } finally {
    await reader.cancel();
  }
});

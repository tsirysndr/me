import { assert, assertEquals } from "$std/assert/mod.ts";
import { createNowPlayingFeed } from "./nowPlayingFeed.ts";
import type { NowPlayingSnapshot } from "./nowPlayingFeed.ts";
import { publicPlayerTrack } from "./preferredPlayer.ts";
import type { PublicPlayerTrack } from "./preferredPlayer.ts";

const pi = publicPlayerTrack(
  { title: "Pi", is_playing: true },
  "Orange Pi Zero 3W",
)!;
const fallback: NowPlayingSnapshot = {
  source: "rocksky",
  track: publicPlayerTrack({ title: "Mac", is_playing: true }, "Mac"),
};

Deno.test("SSE visitors share one Pi listener; Pi pushes bypass fallback requests", () => {
  let push: (track: PublicPlayerTrack | null) => void = () => {};
  let subscriptions = 0;
  let cleanups = 0;
  let requests = 0;
  const feed = createNowPlayingFeed((listener) => {
    subscriptions++;
    push = listener;
    listener(pi);
    return () => {
      cleanups++;
    };
  }, () => {
    requests++;
    return Promise.resolve(fallback);
  });
  const first: NowPlayingSnapshot[] = [];
  const second: NowPlayingSnapshot[] = [];
  const closeFirst = feed.subscribe((s) => first.push(s));
  const closeSecond = feed.subscribe((s) => second.push(s));
  try {
    push({ ...pi, title: "Pi next track" });
    assertEquals(first.at(-1)?.track?.title, "Pi next track");
    assertEquals(second.at(-1)?.track?.title, "Pi next track");
    assertEquals(subscriptions, 1);
    assertEquals(requests, 0);
    closeFirst();
    assertEquals(cleanups, 0);
  } finally {
    closeFirst();
    closeSecond();
  }
  assertEquals(cleanups, 1);
});

Deno.test("late fallback responses cannot replace Pi; paused Pi resumes fallback", async () => {
  let push: (track: PublicPlayerTrack | null) => void = () => {};
  const pending: {
    signal: AbortSignal;
    resolve: (s: NowPlayingSnapshot) => void;
  }[] = [];
  const feed = createNowPlayingFeed((listener) => {
    push = listener;
    listener(null);
    return () => {};
  }, (signal) => new Promise((resolve) => pending.push({ signal, resolve })));
  const events: NowPlayingSnapshot[] = [];
  const close = feed.subscribe((s) => events.push(s));
  try {
    assertEquals(pending.length, 1);
    push(pi);
    assert(pending[0].signal.aborted);
    pending[0].resolve(fallback);
    await Promise.resolve();
    assertEquals(events.at(-1)?.source, "orange-pi");
    push(null);
    assertEquals(events.at(-1)?.track, null);
    assertEquals(pending.length, 2);
    pending[1].resolve(fallback);
    await Promise.resolve();
    assertEquals(events.at(-1), fallback);
  } finally {
    close();
  }
});

Deno.test("last visitor cleanup cancels fallback and reconnect creates a fresh subscription", () => {
  let subscriptions = 0;
  let signal: AbortSignal | undefined;
  const feed = createNowPlayingFeed((listener) => {
    subscriptions++;
    listener(null);
    return () => {};
  }, (s) => {
    signal = s;
    return new Promise(() => {});
  });
  const close = feed.subscribe(() => {});
  close();
  assert(signal?.aborted);
  const closeAgain = feed.subscribe(() => {});
  closeAgain();
  assertEquals(subscriptions, 2);
  assert(signal?.aborted);
});

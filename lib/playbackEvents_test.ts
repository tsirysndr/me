import { assertEquals } from "$std/assert/mod.ts";
import { PlaybackEvents } from "./playbackEvents.ts";
import type { NowPlayingSnapshot } from "./nowPlayingFeed.ts";

class FakeEvents extends EventTarget {
  readyState = 1;
  closed = 0;
  close() {
    this.closed++;
  }
  update(title: string) {
    this.dispatchEvent(
      new MessageEvent("now-playing", {
        data: JSON.stringify({ source: "orange-pi", track: { title } }),
      }),
    );
  }
}

function setup() {
  let now = 0;
  const connections: FakeEvents[] = [];
  const snapshots: NowPlayingSnapshot[] = [];
  const feed = new PlaybackEvents((s) => snapshots.push(s), () => {
    const connection = new FakeEvents();
    connections.push(connection);
    return connection;
  }, () => now);
  return {
    feed,
    connections,
    snapshots,
    at: (time: number) => {
      now = time;
    },
  };
}

Deno.test("stalled OPEN SSE connection is replaced without reloading the page", () => {
  const { feed, connections, snapshots, at } = setup();
  feed.restart();
  connections[0].update("First");
  at(34999);
  feed.check();
  assertEquals(connections.length, 1);
  at(35000);
  feed.check();
  assertEquals(connections.length, 2);
  assertEquals(connections[0].closed, 1);
  connections[0].update("Old stale connection");
  connections[1].update("Recovered track");
  assertEquals(snapshots.map((s) => s.track?.title), [
    "First",
    "Recovered track",
  ]);
  feed.stop();
});

Deno.test("heartbeat events keep a healthy SSE connection alive", () => {
  const { feed, connections, at } = setup();
  feed.restart();
  for (const time of [15000, 30000, 45000]) {
    at(time);
    connections[0].dispatchEvent(new MessageEvent("heartbeat", { data: "{}" }));
    feed.check();
  }
  at(79000);
  feed.check();
  assertEquals(connections.length, 1);
  feed.stop();
});

Deno.test("closed SSE streams and page wake-ups receive fresh connections", () => {
  const { feed, connections, snapshots } = setup();
  feed.restart();
  connections[0].readyState = 2;
  feed.check();
  assertEquals(connections.length, 2);
  feed.stop(); // pagehide
  feed.check();
  assertEquals(connections.length, 2);
  feed.restart(); // pageshow / visible / online
  connections[2].update("Latest after waking");
  assertEquals(snapshots.at(-1)?.track?.title, "Latest after waking");
  feed.stop();
  feed.stop();
  assertEquals(connections[2].closed, 1);
});

Deno.test("failed EventSource creation can recover on the next health check", () => {
  let now = 0;
  let attempts = 0;
  const feed = new PlaybackEvents(() => {}, () => {
    attempts++;
    if (attempts === 1) throw new Error("Network unavailable");
    return new FakeEvents();
  }, () => now);
  feed.restart();
  now = 35000;
  feed.check();
  assertEquals(attempts, 2);
  feed.stop();
});

import { assertEquals } from "$std/assert/mod.ts";
import { TrackLabelState } from "./trackLabel.ts";
import type { NowPlayingSnapshot } from "./nowPlayingFeed.ts";
import { publicPlayerTrack } from "./preferredPlayer.ts";

function snapshot(
  title: string,
  elapsed: number,
  source: NowPlayingSnapshot["source"] = "orange-pi",
): NowPlayingSnapshot {
  return {
    source,
    track: publicPlayerTrack({
      title,
      artist: "Artist",
      length: 180000,
      elapsed,
      is_playing: true,
    }, "Orange Pi Zero 3W"),
  };
}
const clock = (positionMs: number, latencyMs = 6000) => ({
  positionMs,
  latencyMs,
});

Deno.test("early crossfade metadata is Up Next until the buffered outgoing tail ends", () => {
  const labels = new TrackLabelState();
  assertEquals(
    labels.observe(snapshot("Outgoing", 176000), clock(100000)),
    "Now Playing",
  );
  assertEquals(
    labels.observe(snapshot("Incoming", 0), clock(102000)),
    "Up Next",
  );
  // Previous track had 4 s left plus 6 s of HLS delay: end at playhead 110 s.
  assertEquals(labels.tick(clock(109999)), "Up Next");
  assertEquals(labels.tick(clock(110000)), "Now Playing");
});

Deno.test("repeated SSE frames do not clear Up Next before the audio catches up", () => {
  const labels = new TrackLabelState();
  labels.observe(snapshot("Outgoing", 178000), clock(100000));
  labels.observe(snapshot("Incoming", 0), clock(101000));
  assertEquals(
    labels.observe(snapshot("Incoming", 2000), clock(103000)),
    "Up Next",
  );
  assertEquals(
    labels.observe(snapshot("Incoming", 6000), clock(108000)),
    "Now Playing",
  );
});

Deno.test("buffering freezes the transition rather than using a wall-clock timeout", () => {
  const labels = new TrackLabelState();
  labels.observe(snapshot("Outgoing", 178000), clock(100000));
  labels.observe(snapshot("Incoming", 0), clock(101000));
  assertEquals(labels.tick(null), "Up Next");
  assertEquals(labels.observe(snapshot("Incoming", 25000), null), "Up Next");
  assertEquals(labels.tick(clock(107000)), "Up Next");
  assertEquals(labels.tick(clock(108000)), "Now Playing");
});

Deno.test("first render, mid-track skips and non-streaming playback stay Now Playing", () => {
  const labels = new TrackLabelState();
  assertEquals(
    labels.observe(snapshot("First", 100000), clock(100000)),
    "Now Playing",
  );
  assertEquals(
    labels.observe(snapshot("Manual skip", 0), clock(101000)),
    "Now Playing",
  );
  const noAudio = new TrackLabelState();
  noAudio.observe(snapshot("Outgoing", 179000), null);
  assertEquals(noAudio.observe(snapshot("Incoming", 0), null), "Now Playing");
});

Deno.test("fallback devices and last-played tracks retain their normal labels", () => {
  const labels = new TrackLabelState();
  labels.observe(snapshot("Outgoing", 179000), clock(100000));
  assertEquals(
    labels.observe(snapshot("Other device", 0, "rocksky"), clock(101000)),
    "Now Playing",
  );
  assertEquals(
    labels.observe(snapshot("History", 0, "last-played"), null),
    "Last Played",
  );
  assertEquals(
    labels.observe(snapshot("Pi returning", 0), clock(102000)),
    "Now Playing",
  );
});

Deno.test("a stream restart or seek past the boundary clears the upcoming label", () => {
  for (const position of [0, 200000]) {
    const labels = new TrackLabelState();
    labels.observe(snapshot("Outgoing", 178000), clock(100000));
    labels.observe(snapshot("Incoming", 0), clock(101000));
    assertEquals(labels.tick(clock(position)), "Now Playing");
  }
});

Deno.test("metadata received after the previous audio end is already Now Playing", () => {
  const labels = new TrackLabelState();
  labels.observe(snapshot("Outgoing", 179000), clock(100000, 1000));
  assertEquals(
    labels.observe(snapshot("Incoming", 3000), clock(104000, 1000)),
    "Now Playing",
  );
});

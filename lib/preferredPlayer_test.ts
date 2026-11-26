import { assert, assertEquals } from "$std/assert/mod.ts";
import { PreferredPlayerState } from "./preferredPlayer.ts";

const track = {
  title: "Pi track",
  artist: "Artist",
  is_playing: true,
  elapsed: 5000,
  duration_ms: 120000,
  codec: "flac",
  bitrate: 900,
  sample_rate: 44100,
};
const snapshot = {
  type: "devices",
  primary_device: "mac",
  devices: [
    {
      device_id: "mac",
      name: "Macbook",
      now_playing: { ...track, title: "Mac" },
    },
    { device_id: "pi", name: "Orange Pi Zero 3W", now_playing: track },
  ],
};

Deno.test("prefer playing Pi regardless of selected device and selection changes", () => {
  const state = new PreferredPlayerState();
  state.ingest(snapshot, 10000);
  assertEquals(state.playing(11000)?.title, "Pi track");
  assertEquals(state.playing(11000)?.elapsed, 6000);
  assertEquals(state.playing(11000)?.length, 120000);
  state.ingest({ type: "primary_changed", device_id: "mac" }, 12000);
  assertEquals(state.playing(12000)?.device_name, "Orange Pi Zero 3W");
  state.ingest({
    type: "message",
    device_id: "mac",
    device_name: "Macbook",
    data: { ...track, type: "track", title: "Different selected track" },
  }, 13000);
  assertEquals(state.playing(13000)?.title, "Pi track");
});

Deno.test("Pi pause, stop, disconnect, stale data and relay loss allow fallback", () => {
  for (const status of [0, 2]) {
    const state = new PreferredPlayerState();
    state.ingest(snapshot, 10000);
    state.ingest({
      type: "message",
      device_id: "pi",
      device_name: "Orange Pi Zero 3W",
      data: { type: "status", status },
    }, 11000);
    assertEquals(state.playing(11000), null);
  }
  const state = new PreferredPlayerState();
  state.ingest(snapshot, 10000);
  assertEquals(state.playing(22000), null);
  state.ingest({ type: "device_unregistered", device_id: "pi" }, 11000);
  assertEquals(state.playing(11000), null);
  state.ingest(snapshot, 12000);
  assert(state.playing(12000));
  state.clear();
  assertEquals(state.playing(12000), null);
});

Deno.test("Pi track pushes and resume recover without making Pi primary", () => {
  const state = new PreferredPlayerState();
  state.ingest({ ...snapshot, devices: [] }, 10000);
  assertEquals(state.playing(10000), null);
  state.ingest({
    type: "message",
    device_id: "pi-new",
    device_name: "Orange Pi Zero 3W",
    data: { ...track, type: "track", is_playing: false },
  }, 11000);
  assertEquals(state.playing(11000), null);
  state.ingest({
    type: "message",
    device_id: "pi-new",
    device_name: "Orange Pi Zero 3W",
    data: { type: "status", status: 1 },
  }, 12000);
  assertEquals(state.playing(13000)?.elapsed, 6000);
});

Deno.test("public Pi response includes audio metadata but excludes private fields", () => {
  const state = new PreferredPlayerState();
  state.ingest({
    ...snapshot,
    devices: [{
      device_id: "pi",
      name: "Orange Pi Zero 3W",
      queue: ["private queue"],
      now_playing: {
        ...track,
        url: "private URL",
        token: "secret",
        volume: 0.2,
      },
    }],
  }, 10000);
  const result = state.playing(10000)!;
  assertEquals(result.codec, "flac");
  assertEquals(result.bitrate, 900);
  assertEquals(result.sample_rate, 44100);
  for (const key of ["queue", "token", "url", "volume", "device_id"]) {
    assertEquals(key in result, false);
  }
});

import { assertEquals } from "$std/assert/mod.ts";
import { fetchNowPlayingSource } from "./nowPlayingSource.ts";

Deno.test("playing Pi does not depend on fetching the primary player", async () => {
  let requests = 0;
  const preferred = {
    title: "Pi track",
    device_name: "Orange Pi Zero 3W",
    is_playing: true,
  };
  const result = await fetchNowPlayingSource(
    "owner",
    (() => {
      requests++;
      if (requests > 1) throw new Error("Primary API must not be called");
      return Promise.resolve(Response.json(preferred));
    }) as typeof fetch,
  );
  assertEquals(result, preferred);
  assertEquals(requests, 1);
});

Deno.test("unavailable or paused Pi keeps default playback behavior", async () => {
  for (
    const preferred of [
      null,
      {},
      { device_name: "Orange Pi Zero 3W", is_playing: false },
      { device_name: "Another device", is_playing: true },
      "offline",
    ]
  ) {
    let requests = 0;
    const fallback = { title: "Selected player's track", device_name: "Mac" };
    const result = await fetchNowPlayingSource(
      "owner",
      (() => {
        requests++;
        if (requests === 1 && preferred === "offline") {
          return Promise.reject(new Error("Offline"));
        }
        return Promise.resolve(
          Response.json(requests === 1 ? preferred : fallback),
        );
      }) as typeof fetch,
    );
    assertEquals(result, fallback);
    assertEquals(requests, 2);
  }
});

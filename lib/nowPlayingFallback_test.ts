import { assertEquals } from "$std/assert/mod.ts";
import {
  loadNowPlayingFallback,
  normalizeFallback,
} from "./nowPlayingFallback.server.ts";

Deno.test("fallback normalizes Spotify and last-played data into public track snapshots", () => {
  const spotify = normalizeFallback("spotify", {
    item: {
      name: "Spotify track",
      artists: [{ name: "A" }, { name: "B" }],
      album: { images: [{ url: "https://example.com/cover.jpg" }] },
      duration_ms: 120000,
    },
    progress_ms: 2000,
    is_playing: true,
    token: "private",
  });
  assertEquals(spotify?.track?.artist, "A, B");
  assertEquals(spotify?.track?.length, 120000);
  assertEquals(spotify?.track?.elapsed, 2000);
  assertEquals(spotify?.track?.album_art, "https://example.com/cover.jpg");
  assertEquals("token" in spotify!.track!, false);
  const last = normalizeFallback("last-played", [{
    title: "Last",
    artist: "Artist",
    track_uri: "at://song",
  }]);
  assertEquals(last?.track?.is_playing, false);
  assertEquals(last?.track?.song_uri, "at://song");
  assertEquals(normalizeFallback("rocksky", {}), null);
});

Deno.test("shared server fallback preserves Rocksky then Spotify then scrobbles order", async () => {
  const calls: string[] = [];
  const request = ((url: string | URL | Request) => {
    calls.push(String(url));
    return Promise.resolve(
      Response.json(calls.length < 3 ? {} : [{ title: "Last", artist: "A" }]),
    );
  }) as typeof fetch;
  const result = await loadNowPlayingFallback(
    new AbortController().signal,
    request,
  );
  assertEquals(result.source, "last-played");
  assertEquals(calls.length, 3);
  assertEquals(calls[0].includes("/now-playing?"), true);
  assertEquals(calls[1].includes("/spotify/currently-playing?"), true);
  assertEquals(calls[2].includes("/scrobbles?"), true);
});

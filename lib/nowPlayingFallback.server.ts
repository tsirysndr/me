import { publicPlayerTrack, record } from "./preferredPlayer.ts";
import type { NowPlayingSnapshot } from "./nowPlayingFeed.ts";
import { EMPTY_PLAYBACK } from "./nowPlayingFeed.ts";

const DID = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";

export function normalizeFallback(
  source: "rocksky" | "spotify" | "last-played",
  value: unknown,
): NowPlayingSnapshot | null {
  if (source === "last-played") {
    const item = Array.isArray(value) ? value[0] : null;
    if (!record(item)) return null;
    const track = publicPlayerTrack({
      ...item,
      song_uri: item.track_uri,
      is_playing: false,
    });
    return track ? { source, track } : null;
  }
  if (!record(value)) return null;
  if (source === "rocksky") {
    const name = typeof value.device_name === "string"
      ? value.device_name.trim()
      : "";
    const track = publicPlayerTrack(value, name);
    return track ? { source, track } : null;
  }
  const item = value.item;
  if (!record(item)) return null;
  const artist = Array.isArray(item.artists)
    ? item.artists.filter(record).map((a) => a.name).filter((a) =>
      typeof a === "string"
    ).join(", ")
    : "";
  const images = record(item.album) && Array.isArray(item.album.images)
    ? item.album.images
    : [];
  const track = publicPlayerTrack({
    ...value,
    title: item.name,
    artist,
    album_art: record(images[0]) ? images[0].url : undefined,
    album_uri: value.albumUri,
    song_uri: value.songUri,
    artist_uri: value.artistUri,
    length: item.duration_ms,
    elapsed: value.progress_ms,
  });
  return track ? { source, track } : null;
}

export async function loadNowPlayingFallback(
  signal: AbortSignal,
  request = fetch,
): Promise<NowPlayingSnapshot> {
  const sources = [
    ["rocksky", `https://api.rocksky.app/now-playing?did=${DID}`],
    ["spotify", `https://api.rocksky.app/spotify/currently-playing?did=${DID}`],
    [
      "last-played",
      "https://api.rocksky.app/users/tsiry-sandratraina.com/scrobbles?size=1&offset=0",
    ],
  ] as const;
  for (const [source, url] of sources) {
    try {
      const response = await request(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) continue;
      const snapshot = normalizeFallback(source, await response.json());
      if (snapshot) return snapshot;
    } catch {
      if (signal.aborted) throw signal.reason;
    }
  }
  return EMPTY_PLAYBACK;
}

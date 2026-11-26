import { canStreamFromDevice } from "./liveAudio.ts";

export async function fetchNowPlayingSource(did: string, request = fetch) {
  try {
    const response = await request("/api/orange-pi", {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (response.ok) {
      const preferred = await response.json();
      if (
        preferred?.is_playing === true &&
        canStreamFromDevice(preferred.device_name)
      ) return preferred;
    }
  } catch {
    // Missing/offline Pi or relay: retain the existing public-player fallback.
  }
  const response = await request(
    `https://api.rocksky.app/now-playing?did=${did}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new Error("Now-playing request failed");
  return await response.json();
}

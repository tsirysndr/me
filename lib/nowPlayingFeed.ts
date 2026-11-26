import type { PublicPlayerTrack } from "./preferredPlayer.ts";

export interface NowPlayingSnapshot {
  source: "orange-pi" | "rocksky" | "spotify" | "last-played";
  track: PublicPlayerTrack | null;
}

type Listener = (snapshot: NowPlayingSnapshot) => void;
export const EMPTY_PLAYBACK: NowPlayingSnapshot = {
  source: "last-played",
  track: null,
};

// One shared fallback refresher for all SSE visitors. Pi changes are event-driven.
export function createNowPlayingFeed(
  subscribePreferred: (
    listener: (track: PublicPlayerTrack | null) => void,
  ) => () => void,
  loadFallback: (signal: AbortSignal) => Promise<NowPlayingSnapshot>,
) {
  const listeners = new Set<Listener>();
  let current = EMPTY_PLAYBACK;
  let preferred: PublicPlayerTrack | null = null;
  let pending: AbortController | undefined;
  let unsubscribePreferred: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  function publish(snapshot: NowPlayingSnapshot) {
    current = snapshot;
    for (const listener of listeners) listener(snapshot);
  }

  async function refreshFallback() {
    if (preferred || pending || !listeners.size) return;
    const controller = new AbortController();
    pending = controller;
    try {
      const snapshot = await loadFallback(controller.signal);
      if (pending === controller && !preferred && listeners.size) {
        publish(snapshot);
      }
    } catch {
      // Retain the last valid fallback during temporary upstream errors.
    } finally {
      if (pending === controller) pending = undefined;
    }
  }

  return {
    subscribe(listener: Listener) {
      let active = true;
      listeners.add(listener);
      listener(current);
      if (listeners.size === 1) {
        unsubscribePreferred = subscribePreferred((track) => {
          const wasPreferred = preferred !== null;
          preferred = track;
          if (track) {
            pending?.abort();
            pending = undefined;
            publish({ source: "orange-pi", track });
          } else {
            if (wasPreferred) publish(EMPTY_PLAYBACK);
            void refreshFallback();
          }
        });
        timer = setInterval(() => void refreshFallback(), 3000);
      }
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
        if (listeners.size) return;
        unsubscribePreferred?.();
        clearInterval(timer);
        pending?.abort();
        pending = undefined;
        preferred = null;
        current = EMPTY_PLAYBACK;
      };
    },
  };
}

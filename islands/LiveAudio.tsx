import type { RefObject } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";

import { MAX_DB, MIN_DB, STEP_DB, volumeDbToGain } from "../lib/liveAudio.ts";
import { liveVolume } from "../lib/liveVolume.ts";
import { useLiveVolume } from "../hooks/useLiveVolume.ts";

export default function LiveAudio(
  { audioRef, available, setAvailable }: {
    audioRef: RefObject<HTMLAudioElement>;
    available: boolean;
    setAvailable: (available: boolean) => void;
  },
) {
  const decibels = useLiveVolume();
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [status, setStatus] = useState(
    "Live audio is connecting.",
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let destroy: (() => void) | undefined;
    const initialGain = volumeDbToGain(liveVolume.get());
    audio.volume = initialGain;
    audio.muted = initialGain === 0;
    const markAvailable = () => {
      if (!disposed) setAvailable(true);
    };
    const markUnavailable = () => {
      if (!disposed) setAvailable(false);
    };
    audio.addEventListener("canplay", markAvailable);
    audio.addEventListener("error", markUnavailable);
    const play = () =>
      audio.play().catch((error) => {
        if (disposed) return;
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setNeedsInteraction(true);
          setStatus("Press play to listen at your saved volume.");
          // Keep the live stream running silently when audible autoplay is blocked.
          audio.muted = true;
          void audio.play().catch(() => {});
        } else {
          setStatus("Live audio is connecting.");
        }
      });

    const connect = async () => {
      if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        const reconnect = () => {
          if (disposed) return;
          setStatus("Live audio is reconnecting.");
          clearTimeout(retry);
          retry = setTimeout(() => {
            if (disposed) return;
            audio.load();
            void play();
          }, 3000);
        };
        audio.addEventListener("error", reconnect);
        destroy = () => audio.removeEventListener("error", reconnect);
        audio.src = "/live/stream.m3u8";
        await play();
        return;
      }
      try {
        const { default: Hls } = await import("hls.js");
        if (disposed) return;
        if (!Hls.isSupported()) {
          setStatus("Live audio is not supported by this browser.");
          return;
        }
        const hls = new Hls({ liveSyncDurationCount: 3, backBufferLength: 0 });
        destroy = () => hls.destroy();
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          markAvailable();
          void play();
        });
        hls.on(Hls.Events.FRAG_BUFFERED, markAvailable);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || disposed) return;
          markUnavailable();
          setStatus("Live audio is reconnecting.");
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            clearTimeout(retry);
            retry = setTimeout(() => {
              if (!disposed) hls.startLoad();
            }, 3000);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            hls.destroy();
          }
        });
        hls.loadSource("/live/stream.m3u8");
        hls.attachMedia(audio);
      } catch {
        if (!disposed) setStatus("Live audio is currently unavailable.");
      }
    };
    void connect();
    return () => {
      disposed = true;
      setAvailable(false);
      audio.removeEventListener("canplay", markAvailable);
      audio.removeEventListener("error", markUnavailable);
      clearTimeout(retry);
      destroy?.();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volumeDbToGain(decibels);
    audio.muted = decibels === MIN_DB || needsInteraction;
    setStatus(
      needsInteraction
        ? "Press play to listen at your saved volume."
        : decibels === MIN_DB
        ? "Live audio muted."
        : `Live audio volume ${decibels} dB.`,
    );
  }, [decibels, needsInteraction]);

  const playAtVolume = useCallback((next: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const muted = next === MIN_DB;
    setNeedsInteraction(false);
    audio.volume = volumeDbToGain(next);
    audio.muted = muted;
    if (!muted) {
      void audio.play().then(
        () => setStatus(`Live audio volume ${next} dB.`),
        () => {
          setNeedsInteraction(true);
          audio.muted = true;
          setStatus(
            "Press play to listen at your saved volume.",
          );
        },
      );
    } else {
      setStatus("Live audio muted.");
    }
  }, [audioRef]);

  const adjust = useCallback((step: number) => {
    playAtVolume(liveVolume.set((current) => current + step));
  }, [playAtVolume]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented || event.isComposing || event.ctrlKey ||
        event.metaKey || event.altKey
      ) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea, select"))
      ) return;
      if (event.key === "-") {
        event.preventDefault();
        adjust(-STEP_DB);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        adjust(STEP_DB);
      }
    };
    globalThis.addEventListener("keydown", shortcut);
    return () => globalThis.removeEventListener("keydown", shortcut);
  }, [adjust]);

  return (
    <div class="live-volume" role="group" aria-label="Live stream volume">
      <audio ref={audioRef} autoPlay muted playsInline preload="auto" />
      {available && (
        <span
          class="live-indicator"
          role="status"
          aria-label="Live stream available"
          title="Live stream available"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
            <path d="M7.76 7.76a6 6 0 0 0 0 8.48m8.48-8.48a6 6 0 0 1 0 8.48M4.93 4.93a10 10 0 0 0 0 14.14M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
          Live
        </span>
      )}
      {needsInteraction && decibels > MIN_DB && (
        <button
          type="button"
          class="live-resume"
          aria-label={`Play live audio at ${decibels} dB`}
          title="Play at saved volume"
          onClick={() => playAtVolume(liveVolume.get())}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 4v16l14-8z" />
          </svg>
        </button>
      )}
      <button
        type="button"
        aria-label="Decrease live volume by 3 dB"
        aria-keyshortcuts="-"
        title="Decrease volume (-)"
        disabled={decibels === MIN_DB}
        onClick={() => adjust(-STEP_DB)}
      >
        −
      </button>
      <output
        aria-label={`Live volume ${decibels} dB${
          decibels === MIN_DB
            ? ", muted"
            : needsInteraction
            ? ", press play to listen"
            : ""
        }`}
      >
        [{decibels} dB]
      </output>
      <button
        type="button"
        aria-label="Increase live volume by 3 dB"
        aria-keyshortcuts="+ ="
        title="Increase volume (+)"
        disabled={decibels === MAX_DB}
        onClick={() => adjust(STEP_DB)}
      >
        +
      </button>
      <span class="sr-only" role="status">{status}</span>
    </div>
  );
}

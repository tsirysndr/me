import type { RefObject } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";

import { MAX_DB, MIN_DB, STEP_DB, volumeDbToGain } from "../lib/liveAudio.ts";

export default function LiveAudio(
  { audioRef, available, setAvailable }: {
    audioRef: RefObject<HTMLAudioElement>;
    available: boolean;
    setAvailable: (available: boolean) => void;
  },
) {
  const [decibels, setDecibels] = useState(MIN_DB);
  const [status, setStatus] = useState(
    "Live audio starts muted. Increase volume to listen.",
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let destroy: (() => void) | undefined;
    audio.volume = 0;
    audio.muted = true;
    const markAvailable = () => {
      if (!disposed) setAvailable(true);
    };
    const markUnavailable = () => {
      if (!disposed) setAvailable(false);
    };
    audio.addEventListener("canplay", markAvailable);
    audio.addEventListener("error", markUnavailable);
    const play = () =>
      audio.play().catch(() => {
        if (!disposed) setStatus("Increase volume to start live audio.");
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

  const adjust = useCallback((step: number) => {
    const next = Math.max(MIN_DB, Math.min(MAX_DB, decibels + step));
    setDecibels(next);
    const audio = audioRef.current;
    if (!audio) return;
    const muted = next === MIN_DB;
    audio.volume = volumeDbToGain(next);
    audio.muted = muted;
    if (!muted) {
      void audio.play().then(
        () => setStatus(`Live audio volume ${next} dB.`),
        () =>
          setStatus(
            "Live audio is connecting. Try increasing volume again shortly.",
          ),
      );
    } else {
      setStatus("Live audio muted.");
    }
  }, [decibels]);

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
          decibels === MIN_DB ? ", muted" : ""
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

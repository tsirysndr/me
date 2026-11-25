import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { audioEqLevels } from "../lib/audioEq.ts";

type CapturableAudio = HTMLAudioElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export function AudioEqualizer(
  { audioRef }: { audioRef: RefObject<HTMLAudioElement> },
) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const audio = audioRef.current as CapturableAudio | null;
    const root = rootRef.current;
    const capture = audio?.captureStream ?? audio?.mozCaptureStream;
    if (!audio || !root || !capture || !globalThis.AudioContext) return;

    const bars = Array.from(root.children) as HTMLSpanElement[];
    let context: AudioContext | undefined;
    let analyser: AnalyserNode | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let stream: MediaStream | undefined;
    let track: MediaStreamTrack | undefined;
    let spectrum: Float32Array<ArrayBuffer> | undefined;
    let frame = 0;
    let disposed = false;
    const events = new AbortController();
    const options = { signal: events.signal };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      root.hidden = true;
      bars.forEach((bar) => bar.style.transform = "scaleY(0.1)");
    };

    const draw = () => {
      frame = 0;
      if (
        disposed || !context || !analyser || !spectrum || !source ||
        context.state !== "running" || audio.paused || audio.ended ||
        audio.readyState < 3 || track?.muted || track?.readyState !== "live"
      ) {
        stop();
        return;
      }
      analyser.getFloatFrequencyData(spectrum);
      const levels = audioEqLevels(
        spectrum,
        context.sampleRate,
        analyser.fftSize,
      );
      root.hidden = false;
      levels.forEach((level, index) => {
        bars[index].style.transform = `scaleY(${0.1 + 0.9 * level})`;
      });
      frame = requestAnimationFrame(draw);
    };

    const attach = () => {
      const next = stream?.getAudioTracks().find((t) =>
        t.readyState === "live"
      );
      if (!context || !analyser || !next || next === track) return;
      source?.disconnect();
      track = next;
      source = context.createMediaStreamSource(new MediaStream([next]));
      // Analysis only: never connect the captured copy to speakers. Capture
      // is independent of the media element's volume and muted properties.
      source.connect(analyser);
      next.addEventListener("mute", stop, options);
      next.addEventListener("unmute", start, options);
      next.addEventListener("ended", stop, options);
    };

    function start() {
      if (disposed || audio!.paused || audio!.readyState < 3) return;
      try {
        if (!context) {
          stream = capture!.call(audio);
          context = new AudioContext();
          analyser = context.createAnalyser();
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.65;
          spectrum = new Float32Array(analyser.frequencyBinCount);
          stream.addEventListener("addtrack", start, options);
          stream.addEventListener("removetrack", start, options);
          context.addEventListener("statechange", () => {
            if (context?.state === "running") start();
            else stop();
          }, options);
        }
        attach();
        if (context.state === "suspended") {
          // Browser autoplay policies may require a click/key before analysis.
          void context.resume().catch(() => {});
        }
        if (!frame) draw();
      } catch {
        // Unsupported analysis must never interrupt the original audio.
        stop();
      }
    }

    audio.addEventListener("playing", start, options);
    audio.addEventListener("canplay", start, options);
    for (const event of ["pause", "waiting", "ended", "emptied", "error"]) {
      audio.addEventListener(event, stop, options);
    }
    globalThis.addEventListener("pointerdown", start, options);
    globalThis.addEventListener("keydown", start, options);
    start();

    return () => {
      disposed = true;
      events.abort();
      stop();
      source?.disconnect();
      analyser?.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      void context?.close().catch(() => {});
    };
  }, [audioRef]);

  return (
    <span ref={rootRef} class="live-eq" hidden aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

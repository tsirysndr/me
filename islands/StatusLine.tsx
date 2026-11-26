import { useEffect, useState } from "preact/hooks";

export default function StatusLine() {
  const [position, setPosition] = useState("Top");
  const [clock, setClock] = useState({
    text: "--:--:--",
    dateTime: undefined as string | undefined,
  });

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Indian/Antananarivo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const update = () => {
      const now = new Date();
      setClock({ text: formatter.format(now), dateTime: now.toISOString() });
    };
    const visible = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    const timer = setInterval(update, 1000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = document.documentElement.scrollHeight -
        globalThis.innerHeight;
      const scroll = Math.max(0, globalThis.scrollY);
      setPosition(
        height <= 1
          ? "All"
          : scroll <= 1
          ? "Top"
          : scroll >= height - 1
          ? "Bot"
          : `${Math.min(99, Math.max(1, Math.round(scroll / height * 100)))}%`,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    globalThis.addEventListener("scroll", schedule, { passive: true });
    globalThis.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      globalThis.removeEventListener("scroll", schedule);
      globalThis.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <aside class="editor-statusline" aria-label="Page status">
      <span class="editor-statusline-mode">NORMAL</span>
      <a class="editor-statusline-file" href="#" title="Back to top">
        <span class="editor-statusline-path" aria-hidden="true">~/</span>
        tsiry-sandratraina.com
      </a>
      <div class="editor-statusline-meta">
        <span class="editor-statusline-location">Antananarivo, MG</span>
        <span class="editor-statusline-encoding">utf-8</span>
        <time
          class="editor-statusline-clock"
          dateTime={clock.dateTime}
          title="Local time in Antananarivo (UTC+3)"
          aria-label={`Antananarivo local time: ${clock.text}`}
        >
          {clock.text}
        </time>
        <span
          class="editor-statusline-position"
          aria-label={`Page position: ${position}`}
        >
          {position}
        </span>
      </div>
    </aside>
  );
}

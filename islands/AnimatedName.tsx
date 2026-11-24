import { useEffect, useState } from "preact/hooks";

const NAME = "Tsiry Sandratraina";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CURSOR = "░▒▓█";
const DURATION = 1200;
const PAUSE = 2600;

export default function AnimatedName() {
  const [display, setDisplay] = useState(NAME);

  useEffect(() => {
    const motion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      setDisplay(NAME);
    };

    const animate = () => {
      const started = performance.now();
      let lastUpdate = -Infinity;

      const tick = (now: number) => {
        const elapsed = now - started;
        if (elapsed >= DURATION) {
          setDisplay(NAME);
          timeout = setTimeout(animate, PAUSE);
          return;
        }

        if (now - lastUpdate >= 1000 / 30) {
          lastUpdate = now;
          setDisplay(
            Array.from(NAME, (letter, index) => {
              if (letter === " ") return letter;
              const distance = Math.abs(index - (NAME.length - 1) / 2);
              const progress = (elapsed - distance * 35) /
                (DURATION - (NAME.length - 1) / 2 * 35);
              if (progress <= 0 || progress >= 1) return letter;
              if (progress < 0.3) {
                return CURSOR[Math.min(3, Math.floor(progress / 0.075))];
              }
              return LETTERS[Math.floor(Math.random() * LETTERS.length)];
            }).join(""),
          );
        }
        frame = requestAnimationFrame(tick);
      };

      frame = requestAnimationFrame(tick);
    };

    const updateMotion = () => {
      stop();
      if (!motion.matches) animate();
    };

    updateMotion();
    motion.addEventListener("change", updateMotion);
    return () => {
      stop();
      motion.removeEventListener("change", updateMotion);
    };
  }, []);

  let offset = 0;
  return (
    <span class="electric-name">
      <span class="sr-only">{NAME}</span>
      <span aria-hidden="true">
        {NAME.split(" ").map((word, wordIndex) => {
          const start = offset;
          offset += word.length + 1;
          return (
            <span key={word}>
              {wordIndex > 0 && " "}
              <span class="electric-name-word">
                {Array.from(
                  word,
                  (letter, index) => (
                    <span class="electric-name-letter" key={index}>
                      <span class="electric-name-placeholder">{letter}</span>
                      <span class="electric-name-glyph">
                        {display[start + index]}
                      </span>
                    </span>
                  ),
                )}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

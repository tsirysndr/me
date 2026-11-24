import { useEffect, useState } from "preact/hooks";

type Theme = "light" | "dark";

export default function ThemeChooser() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(
      document.documentElement.dataset.theme === "light" ? "light" : "dark",
    );
    const sync = (event: StorageEvent) => {
      if (event.key !== "theme" && event.key !== null) return;
      const next = event.newValue === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    globalThis.addEventListener("storage", sync);
    return () => globalThis.removeEventListener("storage", sync);
  }, []);

  const choose = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Theme selection still works when browser storage is unavailable.
    }
  };

  return (
    <div class="theme-chooser" role="group" aria-label="Color theme">
      <button
        type="button"
        aria-pressed={theme === "light"}
        onClick={() => choose("light")}
      >
        Light
      </button>
      <button
        type="button"
        aria-pressed={theme === "dark"}
        onClick={() => choose("dark")}
      >
        Dark
      </button>
    </div>
  );
}

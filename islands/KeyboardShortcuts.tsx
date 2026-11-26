import { useEffect, useRef, useState } from "preact/hooks";
import { asset } from "$fresh/runtime.ts";

export default function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [panePercent, setPanePercent] = useState(45);
  const [launched, setLaunched] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState("Loading Linux…");
  const [failed, setFailed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const help = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const open = useRef(false);
  open.current = terminalOpen;

  const syncFrame = () => {
    frame.current?.contentWindow?.postMessage({
      source: "portfolio-terminal",
      type: "state",
      open: open.current,
      theme: document.documentElement.dataset.theme,
    }, location.origin);
  };

  const hideTerminal = () => {
    setTerminalOpen(false);
    setFullscreen(false);
    button.current?.focus();
  };

  const toggleTerminal = () => {
    setLaunched(true);
    setHelpOpen(false);
    setTerminalOpen((current) => {
      if (current) {
        button.current?.focus();
        setFullscreen(false);
      }
      return !current;
    });
  };

  const toggleFullscreen = () => {
    setLaunched(true);
    setHelpOpen(false);
    if (!open.current) {
      setTerminalOpen(true);
      setFullscreen(true);
    } else {
      setFullscreen((current) => !current);
    }
  };

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
      if (
        event.ctrlKey && !event.altKey && !event.metaKey &&
        event.code === "Backquote"
      ) {
        event.preventDefault();
        if (event.shiftKey) toggleFullscreen();
        else toggleTerminal();
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea, select"))
      ) return;
      if (
        event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey
      ) {
        event.preventDefault();
        setHelpOpen((current) => !current);
      } else if (event.key === "Escape") {
        setHelpOpen(false);
      }
    };
    const message = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.source !== "browser-linux"
      ) return;
      if (event.data.type === "toggle") toggleTerminal();
      if (event.data.type === "fullscreen") toggleFullscreen();
      if (event.data.type === "mounted") syncFrame();
      if (
        event.data.type === "status" && typeof event.data.text === "string"
      ) {
        setStatus(event.data.text);
        setFailed(event.data.error === true);
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !help.current?.contains(event.target) &&
        !button.current?.contains(event.target)
      ) setHelpOpen(false);
    };
    const observer = new MutationObserver(syncFrame);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    globalThis.addEventListener("keydown", shortcut);
    globalThis.addEventListener("message", message);
    document.addEventListener("pointerdown", outside);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("keydown", shortcut);
      globalThis.removeEventListener("message", message);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);

  useEffect(syncFrame, [terminalOpen, generation]);

  useEffect(() => {
    if (!terminalOpen) return;
    const page = document.getElementById("site-page");
    const scroll = globalThis.scrollY;
    const previous = document.body.style.overflow;
    document.documentElement.dataset.terminalPane = "open";
    document.body.style.overflow = "hidden";
    if (page) page.scrollTop = scroll;
    return () => {
      const position = page?.scrollTop ?? scroll;
      delete document.documentElement.dataset.terminalPane;
      document.body.style.overflow = previous;
      globalThis.scrollTo({ top: position, behavior: "instant" });
    };
  }, [terminalOpen]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--terminal-pane-height",
      `${panePercent}dvh`,
    );
  }, [panePercent]);

  useEffect(() => {
    const page = document.getElementById("site-page");
    if (page) page.inert = terminalOpen && fullscreen;
    return () => {
      if (page) page.inert = false;
    };
  }, [terminalOpen, fullscreen]);

  return (
    <>
      {launched && (
        <section
          id="browser-terminal"
          class={`browser-terminal${fullscreen ? " is-fullscreen" : ""}`}
          hidden={!terminalOpen}
          role="dialog"
          aria-labelledby="browser-terminal-title"
        >
          {!fullscreen && (
            <div
              class="terminal-pane-divider"
              role="separator"
              aria-label="Resize terminal pane"
              aria-orientation="horizontal"
              aria-valuemin={25}
              aria-valuemax={75}
              aria-valuenow={Math.round(panePercent)}
              tabIndex={0}
              title="Drag to resize; use arrow keys when focused"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                event.currentTarget.focus();
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  setPanePercent(
                    Math.max(
                      25,
                      Math.min(
                        75,
                        (globalThis.innerHeight - event.clientY) /
                          globalThis.innerHeight * 100,
                      ),
                    ),
                  );
                }
              }}
              onPointerUp={(event) =>
                event.currentTarget.releasePointerCapture(event.pointerId)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  setPanePercent((current) =>
                    Math.max(
                      25,
                      Math.min(
                        75,
                        current + (event.key === "ArrowUp" ? 5 : -5),
                      ),
                    )
                  );
                }
              }}
            />
          )}
          <h2 id="browser-terminal-title" class="sr-only">
            Linux terminal pane
          </h2>
          <div class="terminal-pane-help" aria-label="Terminal shortcuts">
            <button type="button" onClick={hideTerminal}>
              <kbd>Ctrl + `</kbd> hide
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={toggleFullscreen}>
              <kbd>Ctrl + Shift + `</kbd>{" "}
              {fullscreen ? "restore pane" : "fullscreen"}
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              title="Restart Linux and clear its temporary files"
              onClick={() => {
                setStatus("Loading Linux…");
                setFailed(false);
                setGeneration((current) => current + 1);
              }}
            >
              restart
            </button>
            {!status.startsWith("Bash") && (
              <span
                class={failed ? "terminal-pane-error" : "terminal-pane-status"}
                role="status"
              >
                {status}
              </span>
            )}
          </div>
          <iframe
            key={generation}
            ref={frame}
            src={asset("/terminal/index.html")}
            title="Linux Bash terminal"
            class="browser-terminal-frame"
            onLoad={syncFrame}
          />
        </section>
      )}
      {helpOpen && (
        <div
          id="keyboard-shortcuts-panel"
          class="keyboard-shortcuts-panel"
          ref={help}
          role="dialog"
          aria-labelledby="keyboard-shortcuts-title"
        >
          <h2 id="keyboard-shortcuts-title">Keyboard shortcuts</h2>
          <button
            type="button"
            class="shortcut-row shortcut-terminal"
            onClick={toggleTerminal}
          >
            <span>{terminalOpen ? "Hide terminal" : "Open terminal"}</span>
            <kbd>Ctrl + `</kbd>
          </button>
          <div class="shortcut-row">
            <span>Terminal fullscreen</span>
            <kbd>Ctrl + Shift + `</kbd>
          </div>
          <div class="shortcut-row">
            <span>Show shortcuts</span>
            <kbd>?</kbd>
          </div>
          <div class="shortcut-row">
            <span>Stream volume</span>
            <span>
              <kbd>−</kbd> / <kbd>+</kbd>
            </span>
          </div>
          <p>
            Volume shortcuts work outside text fields and the terminal. Linux
            files reset on reload.
          </p>
        </div>
      )}
      <button
        ref={button}
        type="button"
        class="keyboard-shortcuts-button"
        aria-label="Keyboard shortcuts"
        aria-expanded={helpOpen}
        aria-controls="keyboard-shortcuts-panel"
        title="Keyboard shortcuts (?)"
        onClick={() => setHelpOpen((current) => !current)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path
            d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 15h10"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </>
  );
}

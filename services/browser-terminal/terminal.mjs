import { WTerm } from "@wterm/dom";
import { checkSupport, createKernel } from "unkernel/web";

let vm;
const pendingInput = [];
const bootAbort = new AbortController();
let ready = false;
let consoleReady = false;
let stopped = false;
let started = false;
let hidden = false;
let resize = [80, 24];
let bootTimeout;
let promptSignal = "";
const outputDecoder = new TextDecoder();
const encoder = new TextEncoder();
const host = document.getElementById("terminal");
const parentOrigin = location.origin;
const tellParent = (type, extra = {}) => {
  parent.postMessage({ source: "browser-linux", type, ...extra }, parentOrigin);
};
const status = (text, error = false) => tellParent("status", { text, error });
const input = (data) => {
  if (consoleReady && !stopped) {
    if (vm) vm.write(data);
    else pendingInput.push(data);
  }
};
const terminal = new WTerm(host, {
  scrollbackLines: 2000,
  onData: (text) => input(encoder.encode(text)),
  onBinary: input,
  onResize: (cols, rows) => {
    resize = [cols, rows];
    if (started) vm.resize(...resize);
    requestAnimationFrame(() => {
      host.scrollTop = host.scrollHeight;
    });
  },
});

function fail(message) {
  if (stopped) return;
  stopped = true;
  clearTimeout(bootTimeout);
  bootAbort.abort();
  vm?.stop();
  status(message, true);
  terminal.write(`\r\n${message}\r\nUse Restart to try again.\r\n`);
}

// Capture the toggle before the terminal can forward it to Fish or SSH.
addEventListener("keydown", (event) => {
  if (
    event.ctrlKey && !event.altKey && !event.metaKey &&
    event.code === "Backquote"
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
    tellParent(event.shiftKey ? "fullscreen" : "toggle");
  }
}, true);

addEventListener("message", (event) => {
  if (event.origin !== parentOrigin || event.source !== parent) return;
  if (event.data?.source !== "portfolio-terminal") return;
  if (event.data.type === "state") {
    const wasHidden = hidden;
    hidden = !event.data.open;
    document.documentElement.dataset.theme = event.data.theme === "light"
      ? "light"
      : "dark";
    terminal.setRenderingPaused(hidden);
    if (!hidden) {
      requestAnimationFrame(() => {
        terminal.fit();
        if (wasHidden) terminal.focus();
      });
    }
  }
});

addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  console.error(event.reason);
  fail("Linux could not start.");
});

addEventListener("pagehide", () => {
  stopped = true;
  clearTimeout(bootTimeout);
  bootAbort.abort();
  vm?.stop();
  terminal.destroy();
});

try {
  await terminal.init();
  tellParent("mounted");
  status("Loading Linux…");
  terminal.write("Starting Linux in WebAssembly…\r\n");
  const asset = (name) => `/terminal/${name}?${__LINUX_VERSION__}`;
  const support = await checkSupport();
  if (!support.ok) throw new Error(support.problems.join(" "));
  bootTimeout = setTimeout(() => fail("Linux startup timed out."), 180_000);
  vm = await createKernel({
    worker: true,
    signal: bootAbort.signal,
    kernel: asset(`unkernel/${__UNKERNEL_VERSION__}/unkernel.wasm`),
    distro: asset("distro"),
    memoryMiB: 512,
    cmdline: "console=hvc0 rdinit=/init kw.user=visitor quiet loglevel=3",
    consoleSize: { cols: resize[0], rows: resize[1] },
    net: {
      kind: "net",
      backend: {
        kind: "wisp",
        servers: [`wss://${location.host}/terminal/relay/`],
      },
    },
    onProgress: ({ stage }) => {
      if (!ready) status(`Loading Linux… ${stage}`);
    },
    onOutput: (bytes) => receiveOutput(bytes),
  });
  for (const bytes of pendingInput.splice(0)) vm.write(bytes);
  started = true;
  vm.resize(...resize);
  vm.exited.then(({ kind }) => {
    if (!stopped) fail(`Linux stopped (${kind}).`);
  });
} catch (error) {
  console.error(error);
  fail(
    `Linux could not load. ${
      error.message || "Check your connection and restart."
    }`,
  );
}

function receiveOutput(bytes) {
  if (stopped) return;
  if (!consoleReady) {
    consoleReady = true;
    vm?.resize(...resize);
    status("Preparing shell…");
  }
  if (!ready) {
    const signal = promptSignal +
      outputDecoder.decode(bytes, { stream: true });
    promptSignal = signal.slice(-16);
    if (signal.includes("\x1b]133;A\x07")) {
      ready = true;
      clearTimeout(bootTimeout);
      status("Fish · Linux in your browser");
      if (!hidden) terminal.focus();
    }
  }
  terminal.write(bytes);
}

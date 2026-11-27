import { WTerm } from "@wterm/dom";
import { downloadAsset, downloadPool } from "./download-assets.mjs";

let vm;
let kernelWorker;
const bootStart = performance.now();
function bootLog(message) {
  if (!stopped) {
    terminal.write(
      `[${
        ((performance.now() - bootStart) / 1000).toFixed(2)
      }s] ${message}\r\n`,
    );
  }
}
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
  bootLog("Checking browser WebAssembly support");
  if (
    typeof WebAssembly.Suspending !== "function" ||
    typeof WebAssembly.promising !== "function"
  ) {
    throw new Error("This browser does not support WebAssembly JSPI.");
  }
  bootTimeout = setTimeout(() => fail("Linux startup timed out."), 180_000);
  let cache;
  try {
    cache = await caches.open("portfolio-linux-assets-v1");
  } catch { /* Optional storage. */ }
  bootLog("Starting the Linux worker; cached boot blocks will be reused");
  kernelWorker = new Worker(
    `/terminal/kernel-worker.js?${__WORKER_VERSION__}`,
    { type: "module" },
  );
  let resolveExit;
  vm = {
    write(bytes) {
      kernelWorker.postMessage({ type: "input", bytes });
    },
    resize(cols, rows) {
      kernelWorker.postMessage({ type: "resize", cols, rows });
    },
    stop() {
      kernelWorker.terminate();
      resolveExit({ kind: "stopped" });
    },
    exited: new Promise((resolve) => {
      resolveExit = resolve;
    }),
  };
  let lastImageMB = -1;
  kernelWorker.addEventListener("message", ({ data }) => {
    if (stopped) return;
    if (data.type === "output") receiveOutput(data.bytes);
    else if (data.type === "log" && !ready) bootLog(data.message);
    else if (data.type === "error") fail(data.message);
    else if (data.type === "exit") resolveExit(data.result);
    else if (data.type === "image-progress" && !ready) {
      const mb = Math.floor((data.fetched + data.cached) / 1e6);
      if (mb !== lastImageMB) {
        lastImageMB = mb;
        const text = `Boot blocks: ${
          (data.fetched / 1e6).toFixed(1)
        } MB downloaded, ${(data.cached / 1e6).toFixed(1)} MB cached`;
        status(text);
        bootLog(text);
      }
    }
  });
  kernelWorker.addEventListener(
    "error",
    (event) => fail(`Linux worker failed: ${event.message}`),
  );
  kernelWorker.postMessage({
    type: "boot",
    image: __BOOT_ASSETS__.distro,
    relayUrl: `wss://${location.host}/terminal/relay/`,
    cols: resize[0],
    rows: resize[1],
  });
  let loaded = 0;
  bootLog(
    `Loading the compressed kernel (${
      (__BOOT_ASSETS__.kernel.bytes / 1e6).toFixed(1)
    } MB)`,
  );
  const kernelBlob = await downloadAsset(__BOOT_ASSETS__.kernel, {
    pool: downloadPool(2),
    cache,
    signal: bootAbort.signal,
    onProgress(bytes, hit) {
      loaded += bytes;
      bootLog(
        `Kernel: ${(loaded / 1e6).toFixed(1)} / ${
          (__BOOT_ASSETS__.kernel.bytes / 1e6).toFixed(1)
        } MB${hit ? " from cache" : " downloaded"}`,
      );
    },
  });
  bootLog("Decompressing and compiling the WebAssembly kernel");
  const kernel = await WebAssembly.compileStreaming(
    new Response(
      kernelBlob.stream().pipeThrough(new DecompressionStream("gzip")),
      { headers: { "Content-Type": "application/wasm" } },
    ),
  );
  bootAbort.signal.throwIfAborted();
  bootLog("Kernel compiled; handing it to the worker");
  kernelWorker.postMessage({ type: "kernel", kernel });
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
      bootLog("Fish is ready; remaining tools load on demand");
      status("Fish · Linux in your browser");
      if (!hidden) terminal.focus();
    }
  }
  terminal.write(bytes);
}

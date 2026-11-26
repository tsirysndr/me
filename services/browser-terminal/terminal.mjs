import { WTerm } from "@wterm/dom";
import { V86 } from "v86";

let vm;
let ready = false;
let consoleReady = false;
let stopped = false;
let started = false;
let hidden = false;
let resize = [80, 24];
let outputTimer = 0;
let bootOutput = "";
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
    vm.bus.send("virtio-console0-input-bytes", data);
  }
};
const terminal = new WTerm(host, {
  scrollbackLines: 2000,
  onData: (text) => input(encoder.encode(text)),
  onBinary: input,
  onResize: (cols, rows) => {
    resize = [cols, rows];
    if (started) vm.bus.send("virtio-console0-resize", resize);
    requestAnimationFrame(() => {
      host.scrollTop = host.scrollHeight;
    });
  },
});

function fail(message) {
  if (stopped) return;
  stopped = true;
  clearTimeout(bootTimeout);
  clearTimeout(outputTimer);
  vm?.destroy();
  status(message, true);
  terminal.write(`\r\n${message}\r\nUse Restart to try again.\r\n`);
}

function flushBootOutput() {
  outputTimer = 0;
  if (bootOutput && !consoleReady && !stopped) terminal.write(bootOutput);
  bootOutput = "";
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
  clearTimeout(outputTimer);
  vm?.destroy();
  terminal.destroy();
});

try {
  await terminal.init();
  tellParent("mounted");
  status("Loading Linux…");
  terminal.write("Starting Linux in WebAssembly…\r\n");
  const asset = (name) => `/terminal/${name}?${__LINUX_VERSION__}`;
  vm = new V86({
    wasm_path: asset("v86.wasm"),
    memory_size: 512 * 1024 * 1024,
    vga_memory_size: 512 * 1024,
    bios: { url: asset("seabios.bin") },
    vga_bios: { url: asset("vgabios.bin") },
    bzimage: { url: asset("linux/vmlinuz") },
    initrd: { url: asset("linux/initramfs.gz") },
    cmdline:
      "console=ttyS0,115200 rdinit=/init tsc=reliable random.trust_cpu=on quiet loglevel=3",
    virtio_console: { type: "none" },
    net_device: {
      relay_url: `wisps://${location.host}/terminal/relay/`,
    },
    disable_keyboard: true,
    disable_mouse: true,
    autostart: true,
  });
  vm.add_listener("download-progress", (event) => {
    if (!started && event.lengthComputable && event.total) {
      status(`Loading Linux… ${Math.round(event.loaded / event.total * 100)}%`);
    }
  });
  vm.add_listener("emulator-ready", () => {
    started = true;
    status("Booting Linux…");
    vm.bus.send("virtio-console0-resize", resize);
  });
  vm.add_listener("serial0-output-byte", (byte) => {
    if (consoleReady || stopped) return;
    bootOutput += String.fromCharCode(byte);
    if (!outputTimer) outputTimer = setTimeout(flushBootOutput, 16);
  });
  vm.add_listener("virtio-console0-output-bytes", (bytes) => {
    if (stopped) return;
    if (!consoleReady) {
      consoleReady = true;
      clearTimeout(outputTimer);
      bootOutput = "";
      vm.bus.send("virtio-console0-resize", resize);
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
  });
  bootTimeout = setTimeout(() => fail("Linux startup timed out."), 180_000);
} catch (error) {
  console.error(error);
  fail("Linux could not load. Check your connection and restart.");
}

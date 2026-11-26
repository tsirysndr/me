import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { V86 } from "v86";
import WebSocket from "ws";

globalThis.WebSocket = class extends WebSocket {
  constructor(url, protocols) {
    super(url, protocols, { origin: "https://tsiry-sandratraina.com" });
  }
};

const root = fileURLToPath(new URL("../../static/terminal/", import.meta.url));
const vm = new V86({
  wasm_path: fileURLToPath(
    new URL("node_modules/v86/build/v86.wasm", import.meta.url),
  ),
  memory_size: 512 * 1024 * 1024,
  bios: { url: `${root}seabios.bin` },
  vga_bios: { url: `${root}vgabios.bin` },
  bzimage: { url: `${root}linux/vmlinuz` },
  initrd: { url: `${root}linux/initramfs.gz` },
  cmdline:
    "console=ttyS0,115200 rdinit=/init tsc=reliable random.trust_cpu=on quiet loglevel=3",
  virtio_console: { type: "none" },
  net_device: {
    relay_url: process.env.TERMINAL_TEST_RELAY ||
      "wisps://tsiry-sandratraina.com/terminal/relay/",
  },
  disable_keyboard: true,
  disable_mouse: true,
  autostart: true,
});

let output = "";
let sent = false;
let finished = false;
const timeout = setTimeout(() => {
  console.error("Linux smoke test timed out:", output.slice(-8000));
  vm.destroy();
  process.exitCode = 1;
}, 90_000);

vm.add_listener("serial0-output-byte", (byte) => {
  if (process.env.DEBUG_BOOT) process.stdout.write(String.fromCharCode(byte));
  output += String.fromCharCode(byte);
});
vm.add_listener("emulator-ready", () => {
  vm.bus.send("virtio-console0-resize", [100, 30]);
});
vm.add_listener("virtio-console0-output-bytes", (bytes) => {
  const text = new TextDecoder().decode(bytes);
  process.stdout.write(text);
  output += text;
  if (!sent && output.includes("\x1b[0m:~$ ")) {
    sent = true;
    const command =
      "printf '\\nBASH=%s\\n' \"$BASH_VERSION\"; uname -m; ssh -V; curl --version | head -1; git --version; printf 'real unix commands\\n' | grep unix | tr a-z A-Z; stty size; df -h /; printf 'ROOT='; sudo -n id -u; printf 'SU='; su - root -c 'id -u'; ssh-keyscan -t ed25519 -T 10 github.com; curl -fsS --max-time 20 -o /dev/null https://example.com && echo __CURL_OK__; timeout 25 git ls-remote --exit-code https://github.com/tsirysndr/me.git HEAD && echo __GIT_OK__; printf '\\n__SMOKE_DONE__\\n'\n";
    setTimeout(
      () =>
        vm.bus.send(
          "virtio-console0-input-bytes",
          new TextEncoder().encode(command),
        ),
      100,
    );
  }
  if (sent && !finished && output.includes("\r\n__SMOKE_DONE__\r\n")) {
    finished = true;
    clearTimeout(timeout);
    try {
      assert.match(output, /BASH=5\./);
      assert.match(output, /i[3-6]86/);
      assert.match(output, /OpenSSH_/);
      assert.match(output, /curl 8\./);
      assert.match(output, /git version 2\./);
      assert.match(output, /Alpine Linux/);
      assert.match(output, /ROOT=0/);
      assert.match(output, /SU=0/);
      assert.match(output, /browser-root\s+384\.0M/);
      assert.match(output, /REAL UNIX COMMANDS/);
      assert.match(output, /30 100/);
      assert.match(output, /github\.com ssh-ed25519 AAAA/);
      assert.match(output, /\r\n__CURL_OK__\r\n/);
      assert.match(output, /\r\n__GIT_OK__\r\n/);
      console.log(
        "\nPASS: Bash, OpenSSH, curl, Git, neofetch, passwordless root/sudo, geometry, and relay networking.",
      );
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
    vm.destroy();
  }
});

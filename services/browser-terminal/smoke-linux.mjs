import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { V86 } from "v86";
import WebSocket from "ws";
import { WasmBridge } from "@wterm/core";

globalThis.WebSocket = class extends WebSocket {
  constructor(url, protocols) {
    super(url, protocols, { origin: "https://tsiry-sandratraina.com" });
  }
};

const root = fileURLToPath(new URL("../../static/terminal/", import.meta.url));
const terminal = await WasmBridge.load();
terminal.init(100, 30);
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
let historyProbeSent = false;
let finished = false;
const decoder = new TextDecoder();
const promptMarker = "\x1b]133;A\x07";
const timeout = setTimeout(() => {
  console.error("Linux smoke test timed out:", output.slice(-8000));
  vm.destroy();
  process.exitCode = 1;
}, 180_000);

vm.add_listener("serial0-output-byte", (byte) => {
  if (process.env.DEBUG_BOOT) process.stdout.write(String.fromCharCode(byte));
  output += String.fromCharCode(byte);
});
vm.add_listener("emulator-ready", () => {
  vm.bus.send("virtio-console0-resize", [100, 30]);
});
vm.add_listener("virtio-console0-output-bytes", (bytes) => {
  terminal.writeRaw(bytes);
  let response;
  while ((response = terminal.getResponse())) {
    vm.bus.send(
      "virtio-console0-input-bytes",
      new TextEncoder().encode(response),
    );
  }
  const text = decoder.decode(bytes, { stream: true });
  process.stdout.write(text);
  output += text;
  const prompts = output.split(promptMarker).length - 1;
  if (!historyProbeSent && prompts >= 1) {
    historyProbeSent = true;
    setTimeout(
      () =>
        vm.bus.send(
          "virtio-console0-input-bytes",
          new TextEncoder().encode(
            "\x1b[200~echo FISH_HISTORY_PROBE\x1b[201~\r",
          ),
        ),
      500,
    );
  }
  if (!sent && historyProbeSent && prompts >= 2) {
    sent = true;
    const command =
      "printf '\\nFISH=%s\\nDEFAULT_SHELL=%s\\n' $version $SHELL; fish --version; bash --version | head -1; uname -m; ssh -V; curl --version | head -1; git --version; oh-my-posh version; tmux -V; zoxide --version; mkdir -p ~/zoxide-test; zoxide add ~/zoxide-test; z zoxide-test; and test \"$PWD\" = \"$HOME/zoxide-test\"; and echo __ZOXIDE_OK__; cd; test -L ~/.tmux.conf; and echo __OH_MY_TMUX_OK__; tmux -L smoke new-session -d -s smoke 'sleep 30'; and tmux -L smoke list-panes -F '#{pane_current_command}'; and tmux -L smoke show-options -gv default-shell; and tmux -L smoke kill-server; and echo __TMUX_OK__; history search --exact 'echo FISH_HISTORY_PROBE' | grep -x 'echo FISH_HISTORY_PROBE'; and echo __FISH_HISTORY_OK__; if not type -q atuin; and not test -d /usr/local/share/blesh; echo __REMOVED_TOOLS_OK__; end; grep -q '^root:.*:/usr/bin/fish$' /etc/passwd; and echo __ROOT_FISH_OK__; printf 'real unix commands\\n' | grep unix | tr a-z A-Z; stty size; df -h /; printf 'ROOT='; sudo -n id -u; printf 'SU='; su - root -c 'id -u'; ssh-keyscan -t ed25519 -T 10 github.com; curl -fsS --max-time 20 -o /dev/null https://example.com; and echo __CURL_OK__; timeout 25 git ls-remote --exit-code https://github.com/tsirysndr/me.git HEAD; and echo __GIT_OK__; printf '\\n__SMOKE_DONE__\\n'";
    setTimeout(
      () =>
        vm.bus.send(
          "virtio-console0-input-bytes",
          new TextEncoder().encode(`\x1b[200~${command}\x1b[201~\r`),
        ),
      1000,
    );
  }
  if (
    sent && !finished &&
    stripVTControlCharacters(output).includes("\r\n__SMOKE_DONE__\r\n")
  ) {
    finished = true;
    clearTimeout(timeout);
    try {
      output = stripVTControlCharacters(output);
      assert.match(output, /FISH=4\./);
      assert.match(output, /DEFAULT_SHELL=\/usr\/bin\/fish/);
      assert.match(output, /GNU bash, version 5\./);
      assert.match(output, /\r\n__ROOT_FISH_OK__\r\n/);
      assert.match(output, /\r\n__REMOVED_TOOLS_OK__\r\n/);
      assert.match(output, /tmux 3\.5a/);
      assert.match(output, /33\.4\.1/);
      assert.match(output, /zoxide 0\./);
      assert.match(output, /\r\n__ZOXIDE_OK__\r\n/);
      assert.match(output, /\r\n__TMUX_OK__\r\n/);
      assert.match(output, /\r\n__OH_MY_TMUX_OK__\r\n/);
      assert.match(output, /\r\n__FISH_HISTORY_OK__\r\n/);
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
        "\nPASS: Fish default shell/history, tmux/Oh My Tmux, Oh My Posh, zoxide, removed Atuin/ble.sh, Unix tools, root/sudo, storage, geometry, and relay networking.",
      );
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
    vm.destroy();
  }
});

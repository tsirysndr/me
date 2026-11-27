import assert from "node:assert/strict";
import { createKernel, NetStack, wispBackend } from "unkernel/node";
import { WasmBridge } from "@wterm/core";
import { enableIcmpEcho } from "./icmp-network.mjs";
import { stripVTControlCharacters } from "node:util";
const origin = "https://tsiry-sandratraina.com";
const names = new Map();
const backend = wispBackend(["wss://tsiry-sandratraina.com/terminal/relay/"], {
  headers: { Origin: origin },
});
const lookup = backend.lookup.bind(backend);
backend.lookup = async (name) => {
  const addresses = await lookup(name);
  for (const address of addresses) names.set(address, name);
  return addresses;
};
const network = enableIcmpEcho(new NetStack({ backend }), {
  url: `${origin}/terminal/relay/`,
  hostnameForAddress: (address) => names.get(address),
  fetchImpl: (url, options) =>
    fetch(url, { ...options, headers: { ...options.headers, Origin: origin } }),
});
const terminal = await WasmBridge.load();
terminal.init(100, 30);
let vm = null, output = "", sent = false;
const pending = [];
let finish, fail;
const done = new Promise((resolve, reject) => {
  finish = resolve;
  fail = reject;
});
const timeout = setTimeout(
  () => fail(new Error(`ICMP smoke timed out: ${output.slice(-2500)}`)),
  30000,
);
try {
  vm = await createKernel({
    kernel: new URL(
      "node_modules/unkernel/dist/unkernel.wasm",
      import.meta.url,
    ),
    distro: new URL(
      "../../static/terminal/linux/alpine.erofs",
      import.meta.url,
    ),
    memoryMiB: 1024,
    cmdline: "console=hvc0 rdinit=/init kw.user=visitor quiet loglevel=3",
    consoleSize: { cols: 100, rows: 30 },
    net: network,
    onOutput(bytes) {
      terminal.writeRaw(bytes);
      let reply;
      while ((reply = terminal.getResponse())) {
        if (vm) vm.write(reply);
        else pending.push(reply);
      }
      output += new TextDecoder().decode(bytes);
      if (!sent && output.includes("\x1b]133;A\x07")) {
        sent = true;
        setTimeout(
          () =>
            vm.write(
              "\x1b[200~ping -c 1 -W 5 1.1.1.1; printf '__USER_PING_CODE=%s\\n' $status; sudo -n ping -c 2 -W 5 1.1.1.1; printf '__ROOT_PING_CODE=%s\\n' $status; sudo -n ping -c 1 -W 5 one.one.one.one; printf '__HOSTNAME_PING_CODE=%s\\n' $status; echo __PING_DONE__\x1b[201~\r",
            ),
          100,
        );
      }
      if (stripVTControlCharacters(output).includes("\r\n__PING_DONE__\r\n")) {
        finish();
      }
    },
  });
  for (const reply of pending) vm.write(reply);
  await done;
  const clean = stripVTControlCharacters(output);
  console.log(clean.slice(-2500));
  assert.match(clean, /__ROOT_PING_CODE=0/);
  assert.match(clean, /__USER_PING_CODE=0/);
  assert.match(clean, /__HOSTNAME_PING_CODE=0/);
  assert.match(clean, /bytes from 1\.1\.1\.1/);
  console.log(
    "PASS: Linux guest received real relayed public ICMP echo replies",
  );
} finally {
  clearTimeout(timeout);
  vm?.stop();
}

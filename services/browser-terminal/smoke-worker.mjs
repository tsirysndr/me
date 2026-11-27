import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { WasmBridge } from "@wterm/core";

const image = await readFile(
  new URL("../../static/terminal/linux/alpine.erofs", import.meta.url),
);
const assets = JSON.parse(
  await readFile(
    new URL("../../static/terminal/boot-assets.json", import.meta.url),
    "utf8",
  ),
);
let downloaded = 0;
const server = createServer((req, res) => {
  const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || "");
  if (!match) {
    res.writeHead(416).end();
    return;
  }
  const start = Number(match[1]), end = Number(match[2]);
  downloaded += end - start + 1;
  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${image.length}`,
    "Content-Length": end - start + 1,
  });
  res.end(image.subarray(start, end + 1));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const terminal = await WasmBridge.load();
terminal.init(100, 30);
const worker = new Worker(
  new URL("./worker-node-harness.mjs", import.meta.url),
  { workerData: { baseUrl: `http://127.0.0.1:${server.address().port}` } },
);
const kernel = await WebAssembly.compile(
  await readFile(
    new URL("node_modules/unkernel/dist/unkernel.wasm", import.meta.url),
  ),
);
let output = "", sent = false;
const logs = [];
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Worker boot timed out: ${output.slice(-1500)}`)),
      30000,
    );
    worker.on("error", reject);
    worker.on("message", (message) => {
      if (message.type === "error") {
        clearTimeout(timer);
        reject(new Error(message.message));
      }
      if (message.type === "log") logs.push(message.message);
      if (message.type !== "output") return;
      terminal.writeRaw(message.bytes);
      let response;
      while ((response = terminal.getResponse())) {
        worker.postMessage({
          type: "input",
          bytes: new TextEncoder().encode(response),
        });
      }
      output += new TextDecoder().decode(message.bytes);
      if (!sent && output.includes("\x1b]133;A\x07")) {
        sent = true;
        assert(downloaded < 5 * 1024 ** 2);
        console.log(
          `Browser worker reached Fish after ${downloaded} image bytes`,
        );
        worker.postMessage({
          type: "input",
          bytes: new TextEncoder().encode(
            "\x1b[200~uname -m; df -h /; free -m; echo __WORKER_OK__\x1b[201~\r",
          ),
        });
      }
      if (output.includes("\r\n__WORKER_OK__\r\n")) {
        clearTimeout(timer);
        resolve();
      }
    });
    worker.postMessage({
      type: "boot",
      image: assets.distro,
      relayUrl: "wss://tsiry-sandratraina.com/terminal/relay/",
      cols: 100,
      rows: 30,
    });
    worker.postMessage({ type: "kernel", kernel });
  });
  assert.match(output, /aarch64/);
  assert.match(output, /3\.9G/);
  assert(logs.some((line) => line.includes("4 GB disk")));
  assert(logs.some((line) => line.includes("Boot image ready")));
  console.log(
    "PASS: browser SDK worker, verified lazy image reads, 4 GB disk, shell input/output and boot step logs",
  );
} finally {
  await worker.terminate();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

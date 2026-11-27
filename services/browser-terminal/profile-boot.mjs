import {
  bundledBoot,
  createImageFromKwsparse,
  createKernel,
  FileDisk,
} from "unkernel/node";
import { mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { WasmBridge } from "@wterm/core";
const image = process.argv[2] ||
  new URL("../../static/terminal/linux/alpine.erofs", import.meta.url);
const kernel = await WebAssembly.compile(
  await readFile(
    new URL("node_modules/unkernel/dist/unkernel.wasm", import.meta.url),
  ),
);
const dir = await mkdtemp(join(tmpdir(), "linux-profile-"));
const disk = join(dir, "data.img");
await createImageFromKwsparse(disk, bundledBoot(kernel).datadisk);
await truncate(disk, 4 * 1024 ** 3);
const file = new FileDisk(image instanceof URL ? image.pathname : image, {
  readOnly: true,
});
const imageBytes = await readFile(image);
const imageSha = createHash("sha256").update(imageBytes).digest("hex");
const reads = [];
const chunks = new Set();
const chunkSize = 128 * 1024;
const distro = {
  size: file.size,
  readOnly: true,
  read(off, views) {
    const bytes = views.reduce((n, v) => n + v.length, 0);
    reads.push(`${off} ${bytes}`);
    for (
      let i = Math.floor(off / chunkSize);
      i <= Math.floor((off + bytes - 1) / chunkSize);
      i++
    ) chunks.add(i);
    return file.read(off, views);
  },
  write() {
    throw new Error("read only");
  },
  close() {
    file.close();
  },
};
const term = await WasmBridge.load();
term.init(100, 30);
let vm = null, output = "", done = false;
const pending = [];
const start = performance.now();
const timeout = setTimeout(() => {
  console.error(output.slice(-1500));
  vm?.stop();
  process.exitCode = 1;
}, 30000);
vm = await createKernel({
  kernel,
  distro,
  memoryMiB: 1024,
  disks: [{ kind: "file", path: disk, snapshot: true }],
  cmdline: "console=hvc0 rdinit=/init kw.user=visitor quiet loglevel=3",
  consoleSize: { cols: 100, rows: 30 },
  onOutput(bytes) {
    term.writeRaw(bytes);
    let response;
    while ((response = term.getResponse())) {
      if (vm) vm.write(response);
      else pending.push(response);
    }
    output += new TextDecoder().decode(bytes);
    if (!done && output.includes("\x1b]133;A\x07")) {
      done = true;
      clearTimeout(timeout);
      const profile = {
        sha256: imageSha,
        seconds: (performance.now() - start) / 1000,
        chunkSize,
        bootChunks: [...chunks].sort((a, b) => a - b),
        bytes: chunks.size * chunkSize,
        imageBytes: file.size,
      };
      console.log(JSON.stringify(profile, null, 2));
      if (process.argv.includes("--save")) {
        void writeFile(
          new URL("linux/boot-profile.json", import.meta.url),
          JSON.stringify(profile, null, 2) + "\n",
        );
      }
      void writeFile("/tmp/me-boot-reads.txt", reads.join("\n")).then(() =>
        vm.stop()
      );
    }
  },
});
for (const text of pending) vm.write(text);
await vm.exited;
await rm(dir, { recursive: true, force: true });

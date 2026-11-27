import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";

const out = new URL("../../static/terminal/", import.meta.url);
await mkdir(out, { recursive: true });
const linuxVersion = createHash("sha256")
  .update(await readFile(new URL("linux/SHA256SUMS", out)))
  .digest("hex").slice(0, 12);

const unkernelVersion = JSON.parse(
  await readFile(
    new URL("node_modules/unkernel/package.json", import.meta.url),
    "utf8",
  ),
).version;
await cp(
  new URL("node_modules/unkernel/dist/", import.meta.url),
  new URL(`unkernel/${unkernelVersion}/`, out),
  { recursive: true },
);
for (
  const [source, target] of [
    ["unkernel/LICENSE", "unkernel-LICENSE.txt"],
    ["unkernel/LICENSE-MIT", "unkernel-SDK-LICENSE.txt"],
    ["unkernel/THIRD-PARTY.md", "unkernel-THIRD-PARTY.md"],
    ["@wterm/core/LICENSE", "wterm-LICENSE.txt"],
  ]
) {
  await copyFile(
    new URL(`node_modules/${source}`, import.meta.url),
    new URL(target, out),
  );
}

const compressedKernel = gzipSync(
  await readFile(new URL(`unkernel/${unkernelVersion}/unkernel.wasm`, out)),
  { level: 9 },
);
await writeFile(new URL("linux/unkernel.wasm.gz", out), compressedKernel);
const bootAssets = {};
for (
  const [name, file] of [["kernel", "linux/unkernel.wasm.gz"], [
    "distro",
    "linux/alpine.erofs",
  ]]
) {
  const bytes = await readFile(new URL(file, out));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  bootAssets[name] = {
    url: `/terminal/${name}?${sha256}`,
    bytes: bytes.byteLength,
    sha256,
  };
  if (name === "distro") {
    const profile = JSON.parse(
      await readFile(
        new URL("linux/boot-profile.json", import.meta.url),
        "utf8",
      ),
    );
    if (profile.sha256 !== sha256) {
      throw new Error(
        "Guest image changed: run npm run profile:linux before building.",
      );
    }
    const chunkSize = profile.chunkSize;
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(
        createHash("sha256").update(bytes.subarray(offset, offset + chunkSize))
          .digest("hex"),
      );
    }
    Object.assign(bootAssets[name], {
      chunkSize,
      chunks,
      bootChunks: profile.bootChunks,
    });
  }
}
await writeFile(
  new URL("boot-assets.json", out),
  JSON.stringify(bootAssets, null, 2) + "\n",
);

const workerVersion = createHash("sha256");
for (
  const source of [
    "kernel-worker.mjs",
    "image-disk.mjs",
    "download-assets.mjs",
    "icmp-network.mjs",
    "../terminal-relay/icmp-policy.mjs",
  ]
) workerVersion.update(await readFile(new URL(source, import.meta.url)));
workerVersion.update(unkernelVersion).update(JSON.stringify(bootAssets));
await build({
  absWorkingDir: new URL(".", import.meta.url).pathname,
  entryPoints: ["terminal.mjs", "terminal.css", "kernel-worker.mjs"],
  outdir: out.pathname,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  alias: { "unkernel/web": `/terminal/unkernel/${unkernelVersion}/web.mjs` },
  external: ["/terminal/*"],
  define: {
    __LINUX_VERSION__: JSON.stringify(linuxVersion),
    __WORKER_VERSION__: JSON.stringify(
      workerVersion.digest("hex").slice(0, 12),
    ),
    __BOOT_ASSETS__: JSON.stringify(bootAssets),
    __UNKERNEL_VERSION__: JSON.stringify(unkernelVersion),
  },
});
const version = createHash("sha256")
  .update(await readFile(new URL("terminal.js", out)))
  .update(await readFile(new URL("terminal.css", out)))
  .update(await readFile(new URL("kernel-worker.js", out)))
  .digest("hex").slice(0, 12);
const html = (await readFile(new URL("index.html", import.meta.url), "utf8"))
  .replaceAll("BUILD_VERSION", version);
await writeFile(new URL("index.html", out), html);
console.log(`Built browser terminal ${version}, Linux ${linuxVersion}`);

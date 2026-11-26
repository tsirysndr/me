import { build } from "esbuild";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const out = new URL("../../static/terminal/", import.meta.url);
await mkdir(out, { recursive: true });
const linuxVersion = createHash("sha256")
  .update(await readFile(new URL("linux/SHA256SUMS", out)))
  .digest("hex").slice(0, 12);

for (const file of ["libv86.mjs", "v86.wasm", "v86-fallback.wasm"]) {
  await copyFile(
    new URL(`node_modules/v86/build/${file}`, import.meta.url),
    new URL(file, out),
  );
}
await copyFile(
  new URL("node_modules/v86/LICENSE", import.meta.url),
  new URL("v86-LICENSE.txt", out),
);
await copyFile(
  new URL("node_modules/@wterm/core/LICENSE", import.meta.url),
  new URL("wterm-LICENSE.txt", out),
);

for (
  const [file, expected] of [
    [
      "seabios.bin",
      "73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98",
    ],
    [
      "vgabios.bin",
      "a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880",
    ],
  ]
) {
  const response = await fetch(
    `https://raw.githubusercontent.com/copy/v86/9457e7a/bios/${file}`,
  );
  if (!response.ok) throw new Error(`BIOS download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== expected) {
    throw new Error(`BIOS checksum mismatch: ${file}`);
  }
  await writeFile(new URL(file, out), bytes);
}

await build({
  absWorkingDir: new URL(".", import.meta.url).pathname,
  entryPoints: ["terminal.mjs", "terminal.css"],
  outdir: out.pathname,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  alias: { v86: `/terminal/libv86.mjs?${linuxVersion}` },
  external: ["/terminal/*"],
  define: { __LINUX_VERSION__: JSON.stringify(linuxVersion) },
});
const version = createHash("sha256")
  .update(await readFile(new URL("terminal.js", out)))
  .update(await readFile(new URL("terminal.css", out)))
  .digest("hex").slice(0, 12);
const html = (await readFile(new URL("index.html", import.meta.url), "utf8"))
  .replaceAll("BUILD_VERSION", version);
await writeFile(new URL("index.html", out), html);
console.log(`Built browser terminal ${version}, Linux ${linuxVersion}`);

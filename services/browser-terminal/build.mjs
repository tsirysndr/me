import { build } from "esbuild";
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

await build({
  absWorkingDir: new URL(".", import.meta.url).pathname,
  entryPoints: ["terminal.mjs", "terminal.css"],
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
    __UNKERNEL_VERSION__: JSON.stringify(unkernelVersion),
  },
});
const version = createHash("sha256")
  .update(await readFile(new URL("terminal.js", out)))
  .update(await readFile(new URL("terminal.css", out)))
  .digest("hex").slice(0, 12);
const html = (await readFile(new URL("index.html", import.meta.url), "utf8"))
  .replaceAll("BUILD_VERSION", version);
await writeFile(new URL("index.html", out), html);
console.log(`Built browser terminal ${version}, Linux ${linuxVersion}`);

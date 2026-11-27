import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadPool } from "./download-assets.mjs";
import { openImageDisk } from "./image-disk.mjs";

async function hash(bytes) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
async function fixture() {
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => i);
  const entries = new Map();
  const calls = [];
  const cache = {
    match: (key) => entries.get(key)?.clone(),
    put: (key, res) => entries.set(key, res),
    delete: (key) => entries.delete(key),
  };
  const asset = {
    url: "https://example.test/distro?hash",
    bytes: 32,
    chunkSize: 8,
    bootChunks: [0],
    chunks: await Promise.all(
      [0, 8, 16, 24].map((i) => hash(bytes.subarray(i, i + 8))),
    ),
    sha256: await hash(bytes),
  };
  const fetchImpl = (_url, { headers }) => {
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(headers.Range).map(Number);
    calls.push(start);
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: { "Content-Range": `bytes ${start}-${end}/32` },
    });
  };
  return { bytes, asset, calls, cache, fetchImpl };
}

test("boot prefetch skips unused tools and reads across blocks without duplicate downloads", async () => {
  const f = await fixture();
  const disk = await openImageDisk(f.asset, { ...f, pool: downloadPool(4) });
  await disk.prefetch();
  assert.deepEqual(f.calls, [0]);
  const a = new Uint8Array(5),
    b = new Uint8Array(7),
    overlap = new Uint8Array(9);
  await Promise.all([disk.read(3, [a, b]), disk.read(5, [overlap])]);
  assert.deepEqual([...a, ...b], [...f.bytes.subarray(3, 15)]);
  assert.deepEqual(overlap, f.bytes.subarray(5, 14));
  assert.deepEqual(f.calls.sort((a, b) => a - b), [0, 8]);
  assert.throws(() => disk.write(), /read-only/);
  await assert.rejects(disk.read(31, [new Uint8Array(2)]), /bounds/);
  const warm = await openImageDisk(f.asset, {
    cache: f.cache,
    pool: downloadPool(4),
    fetchImpl: () => {
      throw new Error("cache miss");
    },
  });
  await warm.prefetch();
});

test("corrupt blocks are rejected and never cached", async () => {
  const f = await fixture();
  const disk = await openImageDisk(f.asset, {
    cache: f.cache,
    pool: downloadPool(1),
    fetchImpl: () =>
      new Response(new Uint8Array(8), {
        status: 206,
        headers: { "Content-Range": "bytes 0-7/32" },
      }),
  });
  await assert.rejects(disk.prefetch(), /checksum/);
  assert.equal(await f.cache.match(`${f.asset.url}&block=0`), undefined);
});

test("a previously verified full image remains usable without redownloading", async () => {
  const f = await fixture();
  await f.cache.put(f.asset.url, new Response(f.bytes));
  const disk = await openImageDisk(f.asset, {
    cache: f.cache,
    pool: downloadPool(4),
    fetchImpl: () => {
      throw new Error("network should not be used");
    },
  });
  const view = new Uint8Array(12);
  await disk.read(18, [view]);
  assert.deepEqual(view, f.bytes.subarray(18, 30));
});

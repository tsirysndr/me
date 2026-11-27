import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadAsset, downloadPool } from "./download-assets.mjs";

async function fixture(size = 21) {
  const bytes = Uint8Array.from({ length: size }, (_, i) => i);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(
    new Uint8Array(hash),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const entries = new Map();
  const cache = {
    match: (key) => entries.get(key)?.clone(),
    put: (key, response) => {
      entries.set(key, response);
    },
    delete: (key) => entries.delete(key),
  };
  return {
    asset: { url: "https://example.test/asset?v=1", bytes: size, sha256 },
    bytes,
    cache,
  };
}

function rangeResponse(bytes, range) {
  const [, start, end] = /bytes=(\d+)-(\d+)/.exec(range).map(Number);
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}` },
  });
}

test("bounded parallel chunks reassemble in order and subsequent boots use verified cache", async () => {
  const { asset, bytes, cache } = await fixture();
  let active = 0, peak = 0, calls = 0, progress = 0;
  const fetchImpl = async (_url, options) => {
    calls++;
    peak = Math.max(peak, ++active);
    const start = Number(/bytes=(\d+)/.exec(options.headers.Range)[1]);
    await new Promise((resolve) => setTimeout(resolve, start === 0 ? 20 : 2));
    active--;
    return rangeResponse(bytes, options.headers.Range);
  };
  const options = {
    pool: downloadPool(2),
    cache,
    chunkSize: 4,
    fetchImpl,
    onProgress: (n) => progress += n,
  };
  const blob = await downloadAsset(asset, options);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  assert.equal(peak, 2);
  assert.equal(calls, 6);
  assert.equal(progress, bytes.length);
  await downloadAsset(asset, {
    ...options,
    fetchImpl: () => {
      throw new Error("cache miss");
    },
  });
});

test("retries failed chunks, discards corrupt cache, and works without writable storage", async () => {
  const { asset, bytes, cache } = await fixture(8);
  await cache.put(asset.url, new Response("bad cached data"));
  cache.put = () => {
    throw new Error("quota exceeded");
  };
  let calls = 0;
  const blob = await downloadAsset(asset, {
    pool: downloadPool(1),
    cache,
    chunkSize: 4,
    fetchImpl: (_url, options) => {
      if (++calls === 1) throw new Error("connection reset");
      return rangeResponse(bytes, options.headers.Range);
    },
  });
  assert.equal(calls, 3);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test("rejects incorrect ranges and checksums without caching partial data", async () => {
  const { asset, bytes, cache } = await fixture(4);
  const options = { pool: downloadPool(1), cache, chunkSize: 4 };
  await assert.rejects(
    downloadAsset(asset, { ...options, fetchImpl: () => new Response(bytes) }),
    /range/,
  );
  const wrong = Uint8Array.from(bytes, (b) => b + 1);
  await assert.rejects(
    downloadAsset(asset, {
      ...options,
      fetchImpl: (_url, opts) => rangeResponse(wrong, opts.headers.Range),
    }),
    /checksum/,
  );
  assert.equal(await cache.match(asset.url), undefined);
});

test("cancellation stops queued downloads", async () => {
  const { asset } = await fixture();
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    downloadAsset(asset, {
      pool: downloadPool(2),
      signal: controller.signal,
      fetchImpl: () => {
        calls++;
        throw new Error("should not fetch");
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);
});

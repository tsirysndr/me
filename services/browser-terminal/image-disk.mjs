async function matches(bytes, expected) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("") ===
    expected;
}

// Read-only distro: fetch and verify only the blocks Linux actually reads.
export async function openImageDisk(asset, {
  cache,
  pool,
  signal,
  fetchImpl = fetch,
  onProgress = () => {},
}) {
  const blocks = new Map();
  let legacy;
  try {
    const saved = await cache?.match(asset.url);
    if (saved) {
      const bytes = new Uint8Array(await saved.arrayBuffer());
      if (bytes.length === asset.bytes && await matches(bytes, asset.sha256)) {
        legacy = bytes;
      }
    }
  } catch { /* The browser cache is optional. */ }

  function block(index) {
    if (blocks.has(index)) return blocks.get(index);
    const job = pool(async () => {
      signal?.throwIfAborted();
      const start = index * asset.chunkSize;
      const end = Math.min(asset.bytes, start + asset.chunkSize);
      const key = `${asset.url}&block=${index}`;
      if (legacy) {
        onProgress(end - start, true);
        return legacy.subarray(start, end);
      }
      try {
        const saved = await cache?.match(key);
        if (saved) {
          const bytes = new Uint8Array(await saved.arrayBuffer());
          if (
            bytes.length === end - start &&
            await matches(bytes, asset.chunks[index])
          ) {
            onProgress(bytes.length, true);
            return bytes;
          }
          await cache.delete(key);
        }
      } catch { /* A storage failure must not prevent boot. */ }
      for (let attempt = 0;; attempt++) {
        signal?.throwIfAborted();
        try {
          const response = await fetchImpl(asset.url, {
            headers: { Range: `bytes=${start}-${end - 1}` },
            signal,
          });
          if (
            response.status !== 206 ||
            response.headers.get("Content-Range") !==
              `bytes ${start}-${end - 1}/${asset.bytes}`
          ) {
            await response.body?.cancel();
            throw new Error("Invalid Linux image range.");
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (
            bytes.length !== end - start ||
            !await matches(bytes, asset.chunks[index])
          ) {
            throw new Error("Linux image block checksum mismatch.");
          }
          signal?.throwIfAborted();
          try {
            await cache?.put(key, new Response(bytes));
          } catch { /* Optional cache. */ }
          onProgress(bytes.length, false);
          return bytes;
        } catch (error) {
          if (signal?.aborted || attempt >= 2) throw error;
        }
      }
    });
    blocks.set(index, job);
    job.catch(() => blocks.delete(index));
    return job;
  }

  return {
    size: asset.bytes,
    readOnly: true,
    async prefetch() {
      await Promise.all(asset.bootChunks.map(block));
    },
    async read(offset, views) {
      const count = views.reduce((sum, v) => sum + v.length, 0);
      if (offset < 0 || offset + count > asset.bytes) {
        throw new Error("Image read out of bounds.");
      }
      if (!count) return;
      const first = Math.floor(offset / asset.chunkSize);
      const last = Math.floor((offset + count - 1) / asset.chunkSize);
      await Promise.all(
        Array.from({ length: last - first + 1 }, (_, i) => block(first + i)),
      );
      let position = offset;
      for (const view of views) {
        for (let written = 0; written < view.length;) {
          const index = Math.floor(position / asset.chunkSize);
          const bytes = await block(index);
          const within = position % asset.chunkSize;
          const length = Math.min(bytes.length - within, view.length - written);
          view.set(bytes.subarray(within, within + length), written);
          position += length;
          written += length;
        }
      }
    },
    write() {
      throw new Error("The distro image is read-only.");
    },
    close() {
      blocks.clear();
      legacy = undefined;
    },
  };
}

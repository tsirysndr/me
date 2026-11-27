export function downloadPool(limit = 6) {
  const waiting = [];
  let active = 0;
  function run() {
    while (active < limit && waiting.length) {
      const { task, resolve, reject } = waiting.shift();
      active++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        active--;
        run();
      });
    }
  }
  return (task) =>
    new Promise((resolve, reject) => {
      waiting.push({ task, resolve, reject });
      run();
    });
}

async function verified(bytes, asset) {
  if (bytes.byteLength !== asset.bytes) return false;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0"))
    .join("") === asset.sha256;
}

// Cache only complete, verified immutable assets. Guest files are never cached here.
export async function downloadAsset(asset, {
  pool,
  cache,
  signal,
  onProgress = () => {},
  fetchImpl = fetch,
  chunkSize = 1024 * 1024,
}) {
  signal?.throwIfAborted();
  const key = asset.url;
  let saved;
  try {
    saved = await cache?.match(key);
  } catch { /* Storage can be unavailable in private browsing. */ }
  if (saved) {
    const bytes = await saved.arrayBuffer();
    if (await verified(bytes, asset)) {
      signal?.throwIfAborted();
      onProgress(bytes.byteLength, true);
      return new Blob([bytes]);
    }
    try {
      await cache.delete(key);
    } catch { /* Redownload a corrupt entry even if deletion failed. */ }
  }

  const parts = await Promise.all(
    Array.from(
      { length: Math.ceil(asset.bytes / chunkSize) },
      (_, i) =>
        pool(async () => {
          const start = i * chunkSize;
          const end = Math.min(asset.bytes, start + chunkSize) - 1;
          for (let attempt = 0;; attempt++) {
            signal?.throwIfAborted();
            try {
              const response = await fetchImpl(asset.url, {
                headers: { Range: `bytes=${start}-${end}` },
                signal,
              });
              const range = `bytes ${start}-${end}/${asset.bytes}`;
              if (
                response.status !== 206 ||
                response.headers.get("Content-Range") !== range
              ) {
                await response.body?.cancel();
                throw new Error("Invalid Linux download range.");
              }
              const bytes = await response.arrayBuffer();
              if (bytes.byteLength !== end - start + 1) {
                throw new Error("Incomplete Linux download.");
              }
              signal?.throwIfAborted();
              onProgress(bytes.byteLength, false);
              return bytes;
            } catch (error) {
              if (signal?.aborted || attempt >= 2) throw error;
            }
          }
        }),
    ),
  );
  const blob = new Blob(parts);
  if (!await verified(await blob.arrayBuffer(), asset)) {
    throw new Error("Linux download checksum mismatch. Please restart.");
  }
  try {
    await cache?.put(
      key,
      new Response(blob, {
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
  } catch { /* Boot still works if browser storage is full or unavailable. */ }
  return blob;
}

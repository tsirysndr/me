import type { Handlers } from "$fresh/server.ts";
import { serveFile } from "$std/http/file_server.ts";
import { fromFileUrl } from "$std/path/from_file_url.ts";

const image = fromFileUrl(
  new URL("../../static/terminal/linux/unkernel.wasm.gz", import.meta.url),
);

async function serveKernel(request: Request) {
  const response = await serveFile(request, image);
  response.headers.set("Content-Type", "application/octet-stream");
  response.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return response;
}

// Compressed kernel chunks are downloaded concurrently and verified by the client.
export const handler: Handlers = {
  GET: serveKernel,
  HEAD: serveKernel,
};

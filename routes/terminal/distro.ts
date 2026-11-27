import type { Handlers } from "$fresh/server.ts";
import { serveFile } from "$std/http/file_server.ts";
import { fromFileUrl } from "$std/path/from_file_url.ts";

const image = fromFileUrl(
  new URL("../../static/terminal/linux/alpine.erofs", import.meta.url),
);

async function serveDistro(request: Request) {
  const response = await serveFile(request, image);
  response.headers.set("Content-Type", "application/octet-stream");
  response.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return response;
}

// unkernel reads its immutable distro lazily through HTTP byte ranges.
export const handler: Handlers = {
  GET: serveDistro,
  HEAD: serveDistro,
};

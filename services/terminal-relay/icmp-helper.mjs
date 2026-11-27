import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { chmod } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { readProbe } from "./icmp-request.mjs";
import { icmpSocket } from "./icmp-client.mjs";

export function pingOnce({ target, ttl, bytes }, signal) {
  return new Promise((resolve, reject) => {
    execFile("/usr/bin/ping", [
      "-n",
      "-c",
      "1",
      "-W",
      "2",
      "-s",
      String(bytes),
      "-t",
      String(ttl),
      "--",
      target,
    ], {
      signal,
      timeout: 2500,
      maxBuffer: 4096,
      env: { ...process.env, LC_ALL: "C" },
    }, (error, stdout, stderr) => {
      if (signal.aborted) return reject(signal.reason);
      if (error && /not permitted|permission denied/i.test(stderr)) {
        return reject(new Error("ICMP helper lacks ping permission"));
      }
      const result = { reachable: !error };
      const ttlMatch = /ttl=(\d+)/.exec(stdout);
      if (ttlMatch) result.ttl = Number(ttlMatch[1]);
      resolve(result);
    });
  });
}

export function createIcmpHelper({ probe = pingOnce, now = Date.now } = {}) {
  let active = 0, tokens = 8, last = now();
  return createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST" || req.url !== "/echo") {
      res.writeHead(404).end();
      return;
    }
    let value;
    try {
      value = await readProbe(req);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const current = now();
    tokens = Math.min(8, tokens + (current - last) * 4 / 1000);
    last = current;
    if (active >= 4 || tokens < 1) {
      res.writeHead(429).end();
      return;
    }
    tokens--;
    active++;
    const abort = new AbortController();
    res.once("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    try {
      res.end(JSON.stringify(await probe(value, abort.signal)));
    } catch {
      if (!res.destroyed) {
        res.writeHead(503).end(
          JSON.stringify({ error: "ICMP helper unavailable" }),
        );
      }
    } finally {
      active--;
    }
  });
}

if (
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createIcmpHelper();
  server.listen(icmpSocket, async () => {
    await chmod(icmpSocket, 0o600);
    console.log("ICMP echo helper ready on private Unix socket");
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
}

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

export function configureWisp() {
  Object.assign(wisp.options, {
    allow_tcp_streams: true,
    allow_udp_streams: false,
    port_whitelist: [22],
    hostname_whitelist: null,
    allow_direct_ip: true,
    allow_private_ips: false,
    allow_loopback_ips: false,
    // WISP counts the new stream before checking this limit.
    stream_limit_total: 5,
    stream_limit_per_host: 3,
    dns_cache_size: 256,
    send_buffer_size: 32,
  });
}

export function createRelay({
  origin = "https://tsiry-sandratraina.com",
  maxClients = 8,
  maxSessionMs = 60 * 60 * 1000,
} = {}) {
  configureWisp();
  const sockets = new Set();
  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
  });
  const httpServer = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/healthz") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok", clients: sockets.size }));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const reject = (status) => {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    };
    if (request.url !== "/terminal/relay/") return reject("404 Not Found");
    if (request.headers.origin !== origin) return reject("403 Forbidden");
    if (sockets.size >= maxClients) return reject("503 Service Unavailable");

    websocketServer.handleUpgrade(request, socket, head, (ws) => {
      sockets.add(ws);
      const timeout = setTimeout(() => ws.terminate(), maxSessionMs);
      let alive = true;
      const heartbeat = setInterval(() => {
        if (!alive) return ws.terminate();
        alive = false;
        ws.ping();
      }, 30_000);
      ws.on("pong", () => alive = true);
      ws.on("error", () => ws.terminate());
      ws.once("close", () => {
        sockets.delete(ws);
        clearTimeout(timeout);
        clearInterval(heartbeat);
      });

      const connection = new wisp.ServerConnection(ws, request.url, {
        wisp_version: request.headers["sec-websocket-protocol"] ? 2 : 1,
      });
      (async () => {
        try {
          await connection.setup();
          await connection.run();
        } catch (error) {
          console.error("Relay connection closed:", error.message);
          await connection.cleanup();
        } finally {
          ws.terminate();
        }
      })();
    });
  });

  return {
    httpServer,
    close: async () => {
      for (const socket of sockets) socket.terminate();
      await new Promise((resolve) => websocketServer.close(resolve));
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

if (
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const relay = createRelay({ origin: process.env.RELAY_ORIGIN });
  relay.httpServer.listen(8181, "127.0.0.1", () => {
    console.log("SSH WISP relay listening on 127.0.0.1:8181");
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => relay.close().then(() => process.exit(0)));
  }
}

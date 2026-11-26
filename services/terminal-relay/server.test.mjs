import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import WebSocket from "ws";
import { createRelay } from "./server.mjs";

const origin = "https://tsiry-sandratraina.com";

function connectPacket(host, port = 22, type = 1) {
  const packet = Buffer.alloc(8 + Buffer.byteLength(host));
  packet[0] = 1;
  packet.writeUInt32LE(1, 1);
  packet[5] = type;
  packet.writeUInt16LE(port, 6);
  packet.write(host, 8);
  return packet;
}

async function start(t, options) {
  const relay = createRelay(options);
  relay.httpServer.listen(0, "127.0.0.1");
  await once(relay.httpServer, "listening");
  t.after(() => relay.close());
  return `ws://127.0.0.1:${relay.httpServer.address().port}`;
}

async function connect(t, base) {
  const ws = new WebSocket(`${base}/terminal/relay/`, { origin });
  t.after(() => ws.terminate());
  const firstMessage = once(ws, "message");
  await once(ws, "open");
  const [packet] = await firstMessage;
  assert.equal(packet[0], 3, "WISP v1 initial flow-control packet");
  return ws;
}

test("only the terminal endpoint and expected Origin can upgrade", async (t) => {
  const base = await start(t);
  for (
    const [path, headers, expected] of [
      ["/terminal/relay/", {}, 403],
      ["/terminal/relay/", { origin: "https://example.com" }, 403],
      ["/wrong/", { origin }, 404],
    ]
  ) {
    const ws = new WebSocket(`${base}${path}`, headers);
    ws.on("error", () => {});
    const [, response] = await once(ws, "unexpected-response");
    assert.equal(response.statusCode, expected);
    response.resume();
    ws.terminate();
  }
});

test("WISP refuses local, private, Tailscale, other ports and UDP", async (t) => {
  const base = await start(t);
  for (
    const [host, port, type] of [
      ["127.0.0.1", 22, 1],
      ["10.0.0.1", 22, 1],
      ["192.168.1.1", 22, 1],
      ["169.254.169.254", 22, 1],
      ["100.64.0.1", 22, 1],
      ["::1", 22, 1],
      ["::ffff:127.0.0.1", 22, 1],
      ["1.1.1.1", 443, 1],
      ["1.1.1.1", 22, 2],
      ["localhost", 22, 1],
    ]
  ) {
    const ws = await connect(t, base);
    const response = once(ws, "message");
    ws.send(connectPacket(host, port, type));
    const [packet] = await response;
    assert.equal(packet[0], 4, `close ${host}:${port}`);
    assert.equal(packet.readUInt32LE(1), 1);
    assert.equal(packet[5], 0x48, "HostBlocked");
    const closed = once(ws, "close");
    ws.close();
    await closed;
  }
});

test("client cap rejects extra sessions and releases closed slots", async (t) => {
  const base = await start(t, { maxClients: 1 });
  const first = await connect(t, base);
  const second = new WebSocket(`${base}/terminal/relay/`, { origin });
  second.on("error", () => {});
  const [, response] = await once(second, "unexpected-response");
  assert.equal(response.statusCode, 503);
  response.resume();
  second.terminate();
  const closed = once(first, "close");
  first.close();
  await closed;
  await connect(t, base);
});

test("sessions expire and the health endpoint stays available", async (t) => {
  const base = await start(t, { maxSessionMs: 100 });
  const ws = await connect(t, base);
  await once(ws, "close");
  const response = await fetch(`${base.replace("ws:", "http:")}/healthz`);
  assert.deepEqual(await response.json(), { status: "ok", clients: 0 });
});

import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createRelay } from "./server.mjs";
import { createIcmpHelper } from "./icmp-helper.mjs";
import { isPublicIPv4 } from "./icmp-policy.mjs";
const origin = "https://tsiry-sandratraina.com";
const value = { target: "1.1.1.1", ttl: 64, bytes: 56 };
async function start(t, server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  });
  return `http://127.0.0.1:${server.address().port}`;
}
const send = (url, body, headers = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

test("ICMP policy accepts only canonical public IPv4 destinations", () => {
  for (const ip of ["1.1.1.1", "8.8.8.8", "93.184.216.34"]) {
    assert(isPublicIPv4(ip));
  }
  for (
    const ip of [
      "0.0.0.0",
      "10.0.0.1",
      "127.0.0.1",
      "100.64.0.1",
      "100.127.255.255",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "192.0.0.1",
      "192.0.2.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::ffff:1.1.1.1",
      "localhost",
      "1.1.1.1; id",
      "01.1.1.1",
      "256.1.1.1",
    ]
  ) assert(!isPublicIPv4(ip), ip);
});

test("relay validates origin and destination before asking the private helper", async (t) => {
  let calls = 0;
  const relay = createRelay({
    probe: (body) => {
      assert.deepEqual(body, value);
      calls++;
      return { reachable: true, ttl: 57 };
    },
  });
  const base = await start(t, relay.httpServer);
  t.after(() => relay.close());
  assert.equal((await send(`${base}/terminal/relay/`, value)).status, 403);
  assert.equal(
    (await send(`${base}/terminal/relay/`, { ...value, target: "127.0.0.1" }, {
      Origin: origin,
    })).status,
    400,
  );
  assert.equal(calls, 0);
  const response = await send(`${base}/terminal/relay/`, value, {
    Origin: origin,
  });
  assert.deepEqual(await response.json(), { reachable: true, ttl: 57 });
  assert.equal(calls, 1);
});

test("helper rejects invalid probes and enforces its global rate limit", async (t) => {
  let calls = 0;
  const base = await start(
    t,
    createIcmpHelper({
      now: () => 0,
      probe: () => {
        calls++;
        return { reachable: true };
      },
    }),
  );
  for (
    const invalid of [
      { ...value, target: "10.0.0.1" },
      { ...value, ttl: 0 },
      { ...value, ttl: 256 },
      { ...value, bytes: 257 },
      { ...value, bytes: -1 },
    ]
  ) assert.equal((await send(`${base}/echo`, invalid)).status, 400);
  assert.equal(calls, 0);
  for (let i = 0; i < 8; i++) {
    assert.equal((await send(`${base}/echo`, value)).status, 200);
  }
  assert.equal((await send(`${base}/echo`, value)).status, 429);
  assert.equal(calls, 8);
});

test("helper failures do not create successful echo replies", async (t) => {
  const base = await start(
    t,
    createIcmpHelper({
      probe: () => {
        throw new Error("permission denied");
      },
    }),
  );
  assert.equal((await send(`${base}/echo`, value)).status, 503);
});

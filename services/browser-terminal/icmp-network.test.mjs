import assert from "node:assert/strict";
import { test } from "node:test";
import { checksum, enableIcmpEcho } from "./icmp-network.mjs";
const ip = (s) => s.split(".").reduce((a, b) => (a * 256 + Number(b)) >>> 0, 0);
function fixture(fetchImpl) {
  const replies = [];
  let local = 0;
  const stack = {
    gw: ip("10.0.2.2"),
    dns: ip("10.0.2.3"),
    icmpInput() {
      local++;
    },
    ipFrame() {
      const bytes = new Uint8Array(34 + 13);
      return [bytes, new DataView(bytes.buffer)];
    },
    emit(frame) {
      replies.push(frame);
    },
  };
  enableIcmpEcho(stack, { url: "https://example.test/relay/", fetchImpl });
  const frame = new Uint8Array(47);
  frame[22] = 64;
  frame[34] = 8;
  frame.set([0x12, 0x34, 0, 1, 1, 2, 3, 4, 5], 38);
  new DataView(frame.buffer).setUint16(36, checksum(frame.subarray(34)));
  return { stack, frame, replies, local: () => local };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("real successful probes preserve echo payload, identifier, sequence and checksum", async () => {
  let requested;
  const f = fixture((_url, options) => {
    requested = JSON.parse(options.body);
    return Response.json({ reachable: true, ttl: 57 });
  });
  f.stack.icmpInput(
    f.frame,
    new DataView(f.frame.buffer),
    ip("10.0.2.15"),
    ip("1.1.1.1"),
    34,
    47,
  );
  await settle();
  assert.deepEqual(requested, { target: "1.1.1.1", ttl: 64, bytes: 5 });
  assert.equal(f.replies.length, 1);
  const reply = f.replies[0];
  assert.equal(reply[34], 0);
  assert.equal(reply[22], 57);
  assert.equal(checksum(reply.subarray(34)), 0);
  assert.deepEqual(reply.subarray(38), f.frame.subarray(38));
});

test("unreachable hosts, permission failures and private addresses never get forged replies", async () => {
  for (
    const result of [
      Response.json({ reachable: false }),
      new Response(null, { status: 503 }),
    ]
  ) {
    let calls = 0;
    const f = fixture(() => {
      calls++;
      return result;
    });
    f.stack.icmpInput(
      f.frame,
      new DataView(f.frame.buffer),
      ip("10.0.2.15"),
      ip("1.1.1.1"),
      34,
      47,
    );
    f.stack.icmpInput(
      f.frame,
      new DataView(f.frame.buffer),
      ip("10.0.2.15"),
      ip("192.168.1.1"),
      34,
      47,
    );
    await settle();
    assert.equal(calls, 1);
    assert.equal(f.replies.length, 0);
    f.stack.icmpInput(
      f.frame,
      new DataView(f.frame.buffer),
      ip("10.0.2.15"),
      f.stack.gw,
      34,
      47,
    );
    assert.equal(f.local(), 1);
  }
});

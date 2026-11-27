import { isDnsName, isPublicIPv4 } from "../terminal-relay/icmp-policy.mjs";

export function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    sum += (bytes[i] << 8) | (bytes[i + 1] || 0);
  }
  while (sum >>> 16) sum = (sum & 65535) + (sum >>> 16);
  return (~sum) & 65535;
}
const address = (ip) =>
  [ip >>> 24, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join(".");

// Echo replies are emitted only after the Orange Pi receives a real ICMP reply.
export function enableIcmpEcho(
  stack,
  { url, signal, fetchImpl = fetch, hostnameForAddress = () => undefined },
) {
  const localEcho = stack.icmpInput.bind(stack);
  let active = 0, tokens = 4, last = performance.now();
  stack.icmpInput = (frame, view, src, dst, offset, end) => {
    if (dst === stack.gw || dst === stack.dns) {
      return localEcho(frame, view, src, dst, offset, end);
    }
    const target = hostnameForAddress(address(dst)) || address(dst),
      length = end - offset;
    if (
      frame[offset] !== 8 || frame[offset + 1] !== 0 || length < 8 ||
      length > 264 || !(isPublicIPv4(target) || isDnsName(target))
    ) return;
    const payload = frame.slice(offset, end);
    if (checksum(payload) !== 0) return;
    const now = performance.now();
    tokens = Math.min(4, tokens + (now - last) * 4 / 1000);
    last = now;
    if (active >= 2 || tokens < 1) return;
    active++;
    tokens--;
    const ttl = frame[22];
    void (async () => {
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, ttl, bytes: length - 8 }),
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(4000)])
            : AbortSignal.timeout(4000),
        });
        if (!response.ok) return;
        const result = await response.json();
        if (result.reachable !== true || signal?.aborted) return;
        const [reply, dv] = stack.ipFrame(dst, src, 1, payload.length);
        reply.set(payload, 34);
        reply[34] = 0;
        dv.setUint16(36, 0);
        dv.setUint16(36, checksum(reply.subarray(34)));
        if (
          Number.isInteger(result.ttl) && result.ttl > 0 && result.ttl <= 255
        ) {
          reply[22] = result.ttl;
          dv.setUint16(24, 0);
          dv.setUint16(24, checksum(reply.subarray(14, 34)));
        }
        stack.emit(reply);
      } catch {
        /* A failed probe produces packet loss, not a synthetic success. */
      } finally {
        active--;
      }
    })();
  };
  return stack;
}

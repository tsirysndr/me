import { validProbe } from "./icmp-policy.mjs";

export async function readProbe(request) {
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 512) throw new Error("Probe body too large");
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!validProbe(value)) throw new Error("Invalid public IPv4 probe");
  return value;
}

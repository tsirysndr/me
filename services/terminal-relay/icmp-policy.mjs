export function isPublicIPv4(value) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value)
  ) return false;
  const [a, b, c, d] = value.split(".").map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 &&
      (b === 168 || (b === 0 && (c === 0 || c === 2)) ||
        (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function isDnsName(value) {
  return typeof value === "string" && value.length <= 253 &&
    /[a-z]/i.test(value) &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\.?$/i
      .test(value);
}

export function validProbe(value) {
  return value && (isPublicIPv4(value.target) || isDnsName(value.target)) &&
    Number.isInteger(value.ttl) &&
    value.ttl >= 1 && value.ttl <= 255 &&
    Number.isInteger(value.bytes) && value.bytes >= 0 && value.bytes <= 256;
}

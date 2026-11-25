export function formatAudioDetails(
  data: { codec?: unknown; bitrate?: unknown; sample_rate?: unknown },
): string {
  const parts: string[] = [];
  if (typeof data.codec === "string") {
    const codec = data.codec.trim();
    if (codec && codec.toLowerCase() !== "unknown") {
      parts.push(codec.toUpperCase());
    }
  }
  if (
    typeof data.bitrate === "number" && Number.isFinite(data.bitrate) &&
    data.bitrate > 0
  ) {
    // Rocksky reports the source bitrate in kilobits per second.
    parts.push(`${data.bitrate} kbps`);
  }
  if (
    typeof data.sample_rate === "number" && Number.isFinite(data.sample_rate) &&
    data.sample_rate > 0
  ) {
    parts.push(`${data.sample_rate / 1000} kHz`);
  }
  return parts.join(" · ");
}

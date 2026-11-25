import { assertEquals } from "$std/assert/mod.ts";
import { formatAudioDetails } from "./audioFormat.ts";

Deno.test("audio format uses Rocksky bitrate and sample rate units", () => {
  assertEquals(
    formatAudioDetails({ codec: "aac", bitrate: 320, sample_rate: 44100 }),
    "AAC · 320 kbps · 44.1 kHz",
  );
  assertEquals(
    formatAudioDetails({ codec: " flac ", sample_rate: 96000 }),
    "FLAC · 96 kHz",
  );
});

Deno.test("audio format omits unavailable or invalid fields", () => {
  for (
    const data of [
      {},
      { codec: null, bitrate: null, sample_rate: null },
      { codec: "unknown", bitrate: 0, sample_rate: -1 },
      { codec: " ", bitrate: NaN, sample_rate: Infinity },
    ]
  ) {
    assertEquals(formatAudioDetails(data), "");
  }
  assertEquals(formatAudioDetails({ bitrate: 192 }), "192 kbps");
  assertEquals(formatAudioDetails({ sample_rate: 48000 }), "48 kHz");
});

import { assert, assertEquals } from "$std/assert/mod.ts";
import { canStreamFromDevice, volumeDbToGain } from "./liveAudio.ts";

Deno.test("only the Orange Pi can enable live audio", () => {
  assert(canStreamFromDevice("Orange Pi Zero 3W"));
  assert(canStreamFromDevice("  orange pi zero 3w  "));
  for (
    const value of [
      undefined,
      null,
      "",
      "Spotify",
      "MacBook",
      "Orange Pi Zero 2",
    ]
  ) {
    assertEquals(canStreamFromDevice(value), false);
  }
});

Deno.test("live volume starts muted and remains in the safe gain range", () => {
  assertEquals(volumeDbToGain(-24), 0);
  assertEquals(volumeDbToGain(-100), 0);
  assertEquals(volumeDbToGain(NaN), 0);
  assertEquals(volumeDbToGain(0), 1);
  assertEquals(volumeDbToGain(12), 1);
  assert(Math.abs(volumeDbToGain(-12) - 0.2511886) < 0.000001);
  assert(Math.abs(volumeDbToGain(-21) - 0.0891251) < 0.000001);
});

import { assert, assertEquals } from "$std/assert/mod.ts";
import { audioEqLevels } from "./audioEq.ts";

Deno.test("EQ silence remains still instead of generating animation", () => {
  const spectrum = new Float32Array(1024).fill(-Infinity);
  assertEquals(audioEqLevels(spectrum, 48000, 2048), [0, 0, 0]);
});

Deno.test("EQ separates bass, midrange and treble at different sample rates", () => {
  for (const rate of [44100, 48000]) {
    for (const [band, hz] of [100, 1000, 6000].entries()) {
      const spectrum = new Float32Array(1024).fill(-Infinity);
      spectrum[Math.round(hz * 2048 / rate)] = -20;
      const levels = audioEqLevels(spectrum, rate, 2048);
      assert(levels[band] > 0);
      levels.forEach((level, index) => {
        if (index !== band) assertEquals(level, 0);
      });
    }
  }
});

Deno.test("EQ responds to signal level and stays within bar bounds", () => {
  const quiet = audioEqLevels(new Float32Array(1024).fill(-60), 48000, 2048);
  const loud = audioEqLevels(new Float32Array(1024).fill(-30), 48000, 2048);
  const peak = audioEqLevels(new Float32Array(1024).fill(0), 48000, 2048);
  for (let i = 0; i < 3; i++) {
    assert(quiet[i] > 0 && quiet[i] < loud[i]);
    assert(loud[i] < peak[i]);
    assertEquals(peak[i], 1);
  }
});

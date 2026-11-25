// Bass, midrange and treble, measured from the decoded audio's FFT bins.
const BANDS = [[60, 250], [250, 2000], [2000, 12000]] as const;

export function audioEqLevels(
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
): number[] {
  const binWidth = sampleRate / fftSize;
  return BANDS.map(([low, high]) => {
    const first = Math.ceil(low / binWidth);
    const end = Math.min(spectrum.length, Math.ceil(high / binWidth));
    let power = 0;
    let peak = 0;
    for (let bin = first; bin < end; bin++) {
      const db = spectrum[bin];
      if (Number.isFinite(db)) {
        const value = 10 ** (db / 10);
        power += value;
        peak = Math.max(peak, value);
      }
    }
    if (!power || end <= first) return 0;
    // Blend average energy with spectral peaks so short percussion and
    // narrow melodic notes remain visible instead of being averaged away.
    const db = 10 * Math.log10(0.6 * power / (end - first) + 0.4 * peak);
    return Math.max(0, Math.min(1, (db + 70) / 60));
  });
}

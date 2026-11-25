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
    for (let bin = first; bin < end; bin++) {
      const db = spectrum[bin];
      if (Number.isFinite(db)) power += 10 ** (db / 10);
    }
    if (!power || end <= first) return 0;
    const db = 10 * Math.log10(power / (end - first));
    return Math.max(0, Math.min(1, (db + 75) / 55));
  });
}

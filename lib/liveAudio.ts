export const MIN_DB = -24;
export const MAX_DB = 0;
export const STEP_DB = 3;

export function canStreamFromDevice(name?: string | null): boolean {
  return name?.trim().toLowerCase() === "orange pi zero 3w";
}

// The minimum is the muted floor of the control, not an audible -24 dB gain.
export function volumeDbToGain(decibels: number): number {
  if (!Number.isFinite(decibels) || decibels <= MIN_DB) return 0;
  return 10 ** (Math.min(MAX_DB, decibels) / 20);
}

/**
 * Prefetched Horizons data for preset sites (scripts/prefetch-horizons.ts).
 * Shared by the script that writes it and the API route that serves it, so no
 * imports: the script runs under plain Node type stripping.
 */

/** One year of hourly samples from this start time is prefetched for every preset. */
export const DEMO_START_ISO = "2026-12-01T00:00:00.000Z"
export const PREFETCH_DAYS = 366
export const PREFETCH_STEP_HOURS = 1

export type PrefetchedObserver = {
  kind: "observer"; command: string; lat: number; lon: number
  startIso: string; stepHours: number; az: number[]; el: number[]
}
export type PrefetchedVectors = {
  kind: "vectors"; command: string
  startIso: string; stepHours: number; x: number[]; y: number[]; z: number[]
}

const num = (n: number) => String(Number(n.toFixed(4)))
export const observerFile = (command: string, lat: number, lon: number) => `obs_${command}_${num(lat)}_${num(lon)}.json`
export const vectorsFile = (command: string) => `vec_${command}.json`

/** Indices for [startMs, stopMs] at stepHours inside a prefetched series, or null if not covered. */
export function sliceIndices(fileStartIso: string, fileStepHours: number, length: number, startMs: number, stopMs: number, stepHours: number) {
  const stepMs = fileStepHours * 3_600_000
  const i0 = (startMs - Date.parse(fileStartIso)) / stepMs
  const i1 = (stopMs - Date.parse(fileStartIso)) / stepMs
  const stride = stepHours / fileStepHours
  if (!Number.isInteger(i0) || !Number.isInteger(stride) || stride < 1 || i0 < 0 || i1 > length - 1 || i1 < i0) return null
  const out: number[] = []
  for (let i = i0; i <= i1; i += stride) out.push(i)
  return out
}

/**
 * Mission illumination analysis over a Horizons time series.
 * Pure functions: no fetching, no React. Elevation is the Sun's centre relative
 * to the local horizontal; terrain shadowing is not modelled.
 */

import type { ObserverEntry } from "./horizons"

export const SOLAR_CONSTANT_W_M2 = 1361

/** horizontal = flat panel; vertical = upright panel that turns to face the Sun. */
export type PanelMode = "horizontal" | "vertical"

export type Sample = {
  t: number            // epoch ms
  sunAz: number
  sunEl: number
  sunRangeAu: number
  earthAz: number
  earthEl: number
}

export function irradiance(sunElDeg: number, rangeAu: number, mode: PanelMode): number {
  if (sunElDeg <= 0) return 0
  const el = (sunElDeg * Math.PI) / 180
  const flux = SOLAR_CONSTANT_W_M2 / (rangeAu * rangeAu)
  return flux * (mode === "horizontal" ? Math.sin(el) : Math.cos(el))
}

/** Join Sun and Earth series on timestamp. Rows missing either body are dropped. */
export function mergeSeries(sun: ObserverEntry[], earth: ObserverEntry[]): Sample[] {
  const earthByTime = new Map(earth.map((e) => [e.time, e]))
  const out: Sample[] = []
  for (const s of sun) {
    const e = earthByTime.get(s.time)
    if (!e) continue
    out.push({ t: Date.parse(s.time), sunAz: s.az, sunEl: s.el, sunRangeAu: s.rangeAu ?? 1, earthAz: e.az, earthEl: e.el })
  }
  return out
}

/**
 * Running totals at every sample, so playback can read them in O(1).
 * Each sample stands for the `stepHours` interval that starts at it.
 */
export type Timeline = {
  stepHours: number
  irradiance: Float64Array        // W/m² at each sample
  cumSunHours: Float64Array
  cumEnergyKWh: Float64Array      // kWh per m² of panel
  cumEarthHours: Float64Array
  longestDarkHours: Float64Array  // longest continuous darkness seen so far
  longestBlackoutHours: Float64Array
}

export function buildTimeline(samples: Sample[], stepHours: number, mode: PanelMode): Timeline {
  const n = samples.length
  const tl: Timeline = {
    stepHours,
    irradiance: new Float64Array(n),
    cumSunHours: new Float64Array(n),
    cumEnergyKWh: new Float64Array(n),
    cumEarthHours: new Float64Array(n),
    longestDarkHours: new Float64Array(n),
    longestBlackoutHours: new Float64Array(n),
  }
  let sun = 0, energy = 0, earth = 0, dark = 0, maxDark = 0, blackout = 0, maxBlackout = 0
  for (let i = 0; i < n; i++) {
    const s = samples[i]
    const w = irradiance(s.sunEl, s.sunRangeAu, mode)
    tl.irradiance[i] = w
    if (s.sunEl > 0) { sun += stepHours; dark = 0 } else { dark += stepHours; maxDark = Math.max(maxDark, dark) }
    if (s.earthEl > 0) { earth += stepHours; blackout = 0 } else { blackout += stepHours; maxBlackout = Math.max(maxBlackout, blackout) }
    energy += (w * stepHours) / 1000
    tl.cumSunHours[i] = sun
    tl.cumEnergyKWh[i] = energy
    tl.cumEarthHours[i] = earth
    tl.longestDarkHours[i] = maxDark
    tl.longestBlackoutHours[i] = maxBlackout
  }
  return tl
}

export type DaySummary = {
  dayStart: number        // epoch ms of the first sample in the day
  sunlightHours: number
  earthHours: number
  peakIrradiance: number  // W/m²
  energyKWh: number       // kWh per m² of panel
}

/** Bucket samples into consecutive 24 h windows starting at the first sample. */
export function summarizeByDay(samples: Sample[], tl: Timeline): DaySummary[] {
  if (!samples.length) return []
  const days: DaySummary[] = []
  const t0 = samples[0].t
  for (let i = 0; i < samples.length; i++) {
    const d = Math.floor((samples[i].t - t0) / 86_400_000)
    if (!days[d]) days[d] = { dayStart: t0 + d * 86_400_000, sunlightHours: 0, earthHours: 0, peakIrradiance: 0, energyKWh: 0 }
    const day = days[d]
    if (samples[i].sunEl > 0) day.sunlightHours += tl.stepHours
    if (samples[i].earthEl > 0) day.earthHours += tl.stepHours
    day.peakIrradiance = Math.max(day.peakIrradiance, tl.irradiance[i])
    day.energyKWh += (tl.irradiance[i] * tl.stepHours) / 1000
  }
  return days.filter(Boolean)
}

export const SYNODIC_MONTH_HOURS = 29.530589 * 24

export type LunarDaySummary = {
  index: number
  startMs: number
  endMs: number
  sunlightHours: number
  maxSunEl: number
  earthVisiblePct: number
  /** false for a trailing bucket shorter than a full lunar day */
  complete: boolean
}

/** Bucket an hourly series into consecutive synodic months (lunar days) from its first sample. */
export function summarizeByLunarDay(samples: Sample[], stepHours = 1): LunarDaySummary[] {
  if (!samples.length) return []
  const t0 = samples[0].t, span = SYNODIC_MONTH_HOURS * 3_600_000
  const out: (LunarDaySummary & { n: number; earthN: number })[] = []
  for (const s of samples) {
    const k = Math.floor((s.t - t0) / span)
    const b = out[k] ??= { index: k, startMs: t0 + k * span, endMs: t0 + (k + 1) * span, sunlightHours: 0, maxSunEl: -90, earthVisiblePct: 0, complete: false, n: 0, earthN: 0 }
    b.n++
    if (s.sunEl > 0) b.sunlightHours += stepHours
    if (s.earthEl > 0) b.earthN++
    b.maxSunEl = Math.max(b.maxSunEl, s.sunEl)
  }
  const lastT = samples[samples.length - 1].t
  return out.filter(Boolean).map(({ n, earthN, ...b }) => ({
    ...b,
    earthVisiblePct: (earthN / n) * 100,
    complete: lastT >= b.endMs - stepHours * 3_600_000,
  }))
}

function lerpAngle(a: number, b: number, f: number): number {
  const d = ((b - a + 540) % 360) - 180
  return (a + d * f + 360) % 360
}

/** Interpolated sample at a fractional index, for smooth playback between hours. */
export function sampleAt(samples: Sample[], index: number): Sample {
  const i = Math.max(0, Math.min(samples.length - 1, Math.floor(index)))
  const j = Math.min(samples.length - 1, i + 1)
  const f = Math.max(0, Math.min(1, index - i))
  const a = samples[i], b = samples[j]
  return {
    t: a.t + (b.t - a.t) * f,
    sunAz: lerpAngle(a.sunAz, b.sunAz, f),
    sunEl: a.sunEl + (b.sunEl - a.sunEl) * f,
    sunRangeAu: a.sunRangeAu + (b.sunRangeAu - a.sunRangeAu) * f,
    earthAz: lerpAngle(a.earthAz, b.earthAz, f),
    earthEl: a.earthEl + (b.earthEl - a.earthEl) * f,
  }
}

/**
 * Hours from `index` until the body next changes state (sets if up, rises if down).
 * Null when it never changes before the series ends.
 */
export function hoursUntilChange(samples: Sample[], index: number, stepHours: number, body: "sun" | "earth"): number | null {
  const key = body === "sun" ? "sunEl" : "earthEl"
  const i0 = Math.max(0, Math.min(samples.length - 1, Math.floor(index)))
  const up = samples[i0][key] > 0
  for (let i = i0 + 1; i < samples.length; i++) {
    if ((samples[i][key] > 0) !== up) return (i - index) * stepHours
  }
  return null
}

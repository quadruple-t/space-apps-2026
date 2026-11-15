/**
 * Side-by-side metrics for two sites over the same mission window.
 * Pure functions over the hourly samples from lib/lunar-data.ts and the terrain facts from
 * lib/terrain-stats.ts: no fetching, no React.
 */

import { buildTimeline, type Sample } from "@/lib/illumination"
import type { TerrainStats } from "@/lib/terrain-stats"
import { lowConfidenceOxides, type Oxide } from "@/lib/science/composition"
import type { CompositionStats } from "@/lib/use-composition"

/** Numbers computed from the hourly Sun/Earth samples over the mission window. */
export type SlotMetrics = {
  /** Hourly samples the numbers were computed from */
  hours: number
  sunlightPct: number
  sunlightHours: number
  longestDarkHours: number
  earthPct: number
  longestBlackoutHours: number
  peakSunEl: number
  /** Flat-panel energy over the window, using the panel area and efficiency passed in */
  energyKWh: number
}

/** Null when there are no samples (window not loaded, or entirely outside the stored ephemeris). */
export function computeMetrics(samples: Sample[], panelAreaM2: number, panelEfficiency: number): SlotMetrics | null {
  const n = samples.length
  if (n === 0) return null
  // Each sample stands for one hour, matching how the rest of Open Exploration summarises the series.
  const tl = buildTimeline(samples, 1, "horizontal")
  const last = n - 1
  let peak = -90
  for (const s of samples) peak = Math.max(peak, s.sunEl)
  return {
    hours: n,
    sunlightPct: (tl.cumSunHours[last] / n) * 100,
    sunlightHours: tl.cumSunHours[last],
    longestDarkHours: tl.longestDarkHours[last],
    earthPct: (tl.cumEarthHours[last] / n) * 100,
    longestBlackoutHours: tl.longestBlackoutHours[last],
    peakSunEl: peak,
    energyKWh: tl.cumEnergyKWh[last] * panelAreaM2 * panelEfficiency,
  }
}

export type MetricKey =
  | "sunlightPct" | "slopeDeg" | "elevationM" | "insidePsr"
  | "sunlightHours" | "longestDarkHours" | "peakSunEl" | "energyKWh"
  | "earthPct" | "longestBlackoutHours"
  | "ironOxide" | "titaniumOxide" | "aluminumOxide" | "calciumOxide" | "magnesiumOxide" | "siliconDioxide" | "meteorExposure"

export type MetricGroup = "layers" | "resources" | "weather" | "sun" | "earth"

export type MetricDef = {
  key: MetricKey
  label: string
  group: MetricGroup
  /** "number" is compared by size; "flag" is a Yes/No fact */
  kind: "number" | "flag"
  unit: string
  digits: number
  /** Which direction is better for a mission planner; "none" when neither is (elevation, PSR) */
  better: "higher" | "lower" | "none"
  /** The map layer this metric is the number behind */
  layer?: string
  /** Shown when a site has no value, so the gap is explained rather than blank */
  noData?: string
}

export const GROUP_LABELS: Record<MetricGroup, string> = {
  layers: "From the map layers",
  resources: "Mining and resources · regional oxides",
  weather: "Weather and environment",
  sun: "Sunlight and power",
  earth: "Earth and communications",
}

const POLAR_ONLY = "LOLA terrain grid covers south of 80°S; catalog sites use their own terrain data"

export const METRICS: MetricDef[] = [
  { key: "sunlightPct", label: "Illumination (share of time sunlit)", group: "layers", kind: "number", unit: "%", digits: 1, better: "higher", layer: "Illumination" },
  { key: "slopeDeg", label: "Slope", group: "layers", kind: "number", unit: "°", digits: 1, better: "lower", layer: "Slope", noData: POLAR_ONLY },
  { key: "elevationM", label: "Elevation", group: "layers", kind: "number", unit: " m", digits: 0, better: "none", layer: "Elevation", noData: "Only catalog sites have a stored elevation" },
  { key: "insidePsr", label: "Inside a permanently shadowed region", group: "layers", kind: "flag", unit: "", digits: 0, better: "none", layer: "Permanently shadowed", noData: "LOLA terrain grid covers south of 80°S" },
  { key: "ironOxide", label: "Iron oxide · FeO", group: "resources", kind: "number", unit: " wt%", digits: 1, better: "none" },
  { key: "titaniumOxide", label: "Titanium oxide · TiO₂", group: "resources", kind: "number", unit: " wt%", digits: 1, better: "none" },
  { key: "aluminumOxide", label: "Aluminum oxide · Al₂O₃", group: "resources", kind: "number", unit: " wt%", digits: 1, better: "none" },
  { key: "calciumOxide", label: "Calcium oxide · CaO", group: "resources", kind: "number", unit: " wt%", digits: 1, better: "none" },
  { key: "magnesiumOxide", label: "Magnesium oxide · MgO", group: "resources", kind: "number", unit: " wt%", digits: 1, better: "none" },
  { key: "siliconDioxide", label: "Silicon dioxide · SiO₂", group: "resources", kind: "number", unit: " wt%", digits: 1, better: "none" },
  { key: "meteorExposure", label: "Meteor shower exposure · geometry", group: "weather", kind: "number", unit: "%", digits: 0, better: "none", layer: "Meteor showers" },
  { key: "sunlightHours", label: "Sunlit duration", group: "sun", kind: "number", unit: " h", digits: 0, better: "higher" },
  { key: "longestDarkHours", label: "Longest darkness", group: "sun", kind: "number", unit: " h", digits: 0, better: "lower" },
  { key: "peakSunEl", label: "Peak Sun elevation", group: "sun", kind: "number", unit: "°", digits: 1, better: "higher" },
  { key: "energyKWh", label: "Solar energy", group: "sun", kind: "number", unit: " kWh", digits: 1, better: "higher" },
  { key: "earthPct", label: "Earth in view", group: "earth", kind: "number", unit: "%", digits: 1, better: "higher" },
  { key: "longestBlackoutHours", label: "Longest comms blackout", group: "earth", kind: "number", unit: " h", digits: 0, better: "lower" },
]

/** What the table shows until the user changes it: the original comparison rows. */
export const DEFAULT_METRICS: MetricKey[] = ["sunlightPct", "sunlightHours", "longestDarkHours", "earthPct", "longestBlackoutHours", "peakSunEl", "energyKWh", "ironOxide", "titaniumOxide"]

const TERRAIN_KEYS = new Set<MetricKey>(["slopeDeg", "elevationM", "insidePsr"])
export const OXIDE_BY_METRIC: Partial<Record<MetricKey, Oxide>> = {
  ironOxide: "FeO", titaniumOxide: "TiO2", aluminumOxide: "Al2O3", calciumOxide: "CaO", magnesiumOxide: "MgO", siliconDioxide: "SiO2",
}
export const isMetricKey = (v: unknown): v is MetricKey => METRICS.some((m) => m.key === v)

/** One site's inputs: window metrics, and terrain facts (each null until loaded). */
export type SiteValues = { window: SlotMetrics | null; terrain: TerrainStats | null; composition?: CompositionStats | null; meteorExposure?: number | null }
export type MetricValue = number | boolean | "low-confidence" | null | undefined

/**
 * The value of one metric. `undefined` = still loading, `null` = the data has nothing for this site.
 */
export function metricValue(def: MetricDef, v: SiteValues): MetricValue {
  if (TERRAIN_KEYS.has(def.key)) return v.terrain === null ? undefined : v.terrain[def.key as keyof TerrainStats]
  const oxide = OXIDE_BY_METRIC[def.key]
  if (oxide) {
    if (v.composition === undefined) return undefined
    if (v.composition === null) return null
    if (lowConfidenceOxides(v.composition.oxidesWtPct, v.composition.sigmaWtPct).includes(oxide)) return "low-confidence"
    return v.composition.oxidesWtPct[oxide]
  }
  if (def.key === "meteorExposure") return v.meteorExposure
  return v.window === null ? undefined : v.window[def.key as keyof Omit<SlotMetrics, "hours">]
}

export function formatValue(def: MetricDef, value: MetricValue) {
  if (value === undefined) return "—"
  if (value === null) return "No data"
  if (value === "low-confidence") return "Low confidence"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return `${value.toFixed(def.digits)}${def.unit}`
}

export type Winner = "a" | "b" | "tie" | "none"

/** Compares at the precision that is displayed, so two cells that read the same are a tie. */
export function winnerFor(def: MetricDef, a: MetricValue, b: MetricValue): Winner {
  if (def.better === "none" || typeof a !== "number" || typeof b !== "number") return "none"
  const ra = Number(a.toFixed(def.digits)), rb = Number(b.toFixed(def.digits))
  if (ra === rb) return "tie"
  const aWins = def.better === "higher" ? ra > rb : ra < rb
  return aWins ? "a" : "b"
}

/** Signed difference B − A at the displayed precision, or an em dash when either side is not a number. */
export function formatDelta(def: MetricDef, a: MetricValue, b: MetricValue) {
  if (typeof a !== "number" || typeof b !== "number") return "—"
  const d = Number((b - a).toFixed(def.digits))
  if (d === 0) return `0${def.unit}`
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(def.digits)}${def.unit}`
}

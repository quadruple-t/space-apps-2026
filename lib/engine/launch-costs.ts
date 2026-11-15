/**
 * Launch vehicle classes keyed by LEO capacity, with list-price and cost-per-kg ranges.
 * Every number carries a `sourceId` defined in docs/SOURCES.md section 8.
 * ESTIMATES ONLY: list prices are third-party reported, not quotes or contract prices.
 */

export type LaunchClass = {
  id: "small" | "medium" | "heavy"
  label: string
  reference: string
  /** Largest mass to LEO this class carries (kg) */
  leoCapacityKg: number
  /** Dedicated-launch list price range, USD */
  launchPriceUsd: { low: number; high: number }
  /** USD per kg to LEO (reported range, or list price divided by capacity) */
  perKgUsd: { low: number; high: number }
  sourceId: string
}

export const LAUNCH_CLASSES: LaunchClass[] = [
  {
    id: "small", label: "Small launcher", reference: "Electron-class",
    leoCapacityKg: 300, launchPriceUsd: { low: 7_500_000, high: 7_500_000 }, perKgUsd: { low: 25_000, high: 30_000 }, sourceId: "LC-1",
  },
  {
    id: "medium", label: "Medium-lift launcher", reference: "Falcon 9-class",
    leoCapacityKg: 22_800, launchPriceUsd: { low: 67_000_000, high: 75_000_000 }, perKgUsd: { low: 2_940, high: 3_290 }, sourceId: "LC-2",
  },
  {
    id: "heavy", label: "Heavy-lift launcher", reference: "Falcon Heavy-class",
    leoCapacityKg: 63_800, launchPriceUsd: { low: 90_000_000, high: 97_000_000 }, perKgUsd: { low: 1_410, high: 1_520 }, sourceId: "LC-3",
  },
]

export type CostEstimate = {
  launchClass: LaunchClass
  /** Pro-rata share of a launch (rideshare or shared manifest). */
  lowUsd: number
  /** Whole dedicated launch at list price (or pro-rata at the high $/kg if that is larger). */
  highUsd: number
}

/** Smallest class that carries `leoMassKg`, or null above the largest class. */
export function launchClassFor(leoMassKg: number): LaunchClass | null {
  return LAUNCH_CLASSES.find((c) => leoMassKg <= c.leoCapacityKg) ?? null
}

export function launchCostRange(leoMassKg: number): CostEstimate | null {
  if (!(leoMassKg >= 0)) throw new RangeError("mass must be >= 0")
  const launchClass = launchClassFor(leoMassKg)
  if (!launchClass) return null
  return {
    launchClass,
    lowUsd: leoMassKg * launchClass.perKgUsd.low,
    highUsd: Math.max(leoMassKg * launchClass.perKgUsd.high, launchClass.launchPriceUsd.high),
  }
}

/** Round to 2 significant figures so a range never looks like an exact price. */
export function roundUsd(usd: number): number {
  if (usd <= 0) return 0
  const p = 10 ** (Math.floor(Math.log10(usd)) - 1)
  return Math.round(usd / p) * p
}

export function formatUsdRange(lowUsd: number, highUsd: number): string {
  const f = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M` : `$${Math.round(v / 1e3)}k`)
  return `${f(roundUsd(lowUsd))} to ${f(roundUsd(highUsd))}`
}

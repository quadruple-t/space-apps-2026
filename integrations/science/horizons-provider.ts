/**
 * Horizons science provider — replaces mockScienceProvider.
 *
 * getCelestialState: calls /api/horizons for Sun (NAIF 10) and Earth (NAIF 399)
 *   as an observer on the Moon surface at the requested site and timestamp.
 *   Results are cached server-side (public/data/horizons/) and client-side
 *   (in-memory Map) so playback scrubbing stays fast after the first fetch.
 *
 * getMissionMetrics: samples Sun + Earth elevation hourly over durationHours,
 *   computes sunlight %, longest darkness, Earth-visibility %, longest blackout.
 *
 * getHorizon: returns null until a LOLA terrain tile is integrated.
 *
 * To activate: import this file in app/explore/freeplay.tsx and replace
 *   mockScienceProvider with horizonsScienceProvider.
 */

import { isoToHorizons } from "@/lib/horizons"
import type { CelestialState, HorizonProfile, LunarSite, MissionMetrics, ScienceProvider } from "./types"

// ─── Types from API response ──────────────────────────────────────────────────
interface ObserverEntry { time: string; az: number; el: number }
interface HorizonsApiResponse { source: "cache" | "live"; entries: ObserverEntry[] }

// ─── In-memory client cache ───────────────────────────────────────────────────
// Prevents duplicate fetches while Freeplay ticks through the same minute.
const celestialCache = new Map<string, CelestialState>()
const metricsCache   = new Map<string, MissionMetrics>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundToMinute(iso: string): string {
  // "2026-11-14T12:34:56.789Z" → "2026-11-14T12:34:00.000Z"
  return iso.slice(0, 16) + ":00.000Z"
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString()
}

/** Fetch one body's az/el for a 1-minute window, return the first entry. */
async function fetchObserver(
  command: string,
  site: LunarSite,
  timestamp: string,
): Promise<{ az: number; el: number } | null> {
  const start = isoToHorizons(timestamp)
  const stop  = isoToHorizons(addHours(timestamp, 0.025)) // +90 seconds as stop
  const params = new URLSearchParams({
    type: "OBSERVER",
    command,
    lat:    String(site.latitudeDeg),
    lon:    String(site.longitudeDeg),
    alt_km: "0",
    start,
    stop,
    step:   "1m",
  })
  try {
    const res = await fetch(`/api/horizons?${params}`)
    if (!res.ok) return null
    const data: HorizonsApiResponse = await res.json()
    const entry = data.entries[0]
    return entry ? { az: entry.az, el: entry.el } : null
  } catch {
    return null
  }
}

/** Fetch hourly samples over durationHours for a body, return all entries. */
async function fetchObserverRange(
  command: string,
  site: LunarSite,
  startIso: string,
  durationHours: number,
): Promise<ObserverEntry[]> {
  const start = isoToHorizons(startIso)
  const stop  = isoToHorizons(addHours(startIso, durationHours))
  const params = new URLSearchParams({
    type: "OBSERVER",
    command,
    lat:    String(site.latitudeDeg),
    lon:    String(site.longitudeDeg),
    alt_km: "0",
    start,
    stop,
    step:   "1h",
  })
  try {
    const res = await fetch(`/api/horizons?${params}`)
    if (!res.ok) return []
    const data: HorizonsApiResponse = await res.json()
    return data.entries
  } catch {
    return []
  }
}

// ─── Metric helpers ───────────────────────────────────────────────────────────

function computeMetricsFromSamples(
  sunEntries: ObserverEntry[],
  earthEntries: ObserverEntry[],
  durationHours: number,
): Omit<MissionMetrics, "provenance"> {
  const n = Math.max(sunEntries.length, 1)

  // sunlight
  const litSamples = sunEntries.filter(e => e.el > 0).length
  const sunlightPercent = Math.round((litSamples / n) * 100)
  const sunlightHours   = Number(((litSamples / n) * durationHours).toFixed(1))

  // longest continuous darkness
  let longestDarkness = 0, currentDark = 0
  for (const e of sunEntries) {
    if (e.el <= 0) { currentDark++; longestDarkness = Math.max(longestDarkness, currentDark) }
    else currentDark = 0
  }
  const longestDarknessHours = Number(((longestDarkness / n) * durationHours).toFixed(1))

  // earth visibility
  const earthSamples = earthEntries.filter(e => e.el > 0).length
  const earthVisibilityPercent = Math.round((earthSamples / Math.max(earthEntries.length, 1)) * 100)

  let longestBlackout = 0, currentBlackout = 0
  for (const e of earthEntries) {
    if (e.el <= 0) { currentBlackout++; longestBlackout = Math.max(longestBlackout, currentBlackout) }
    else currentBlackout = 0
  }
  const longestBlackoutHours = Number(((longestBlackout / Math.max(earthEntries.length, 1)) * durationHours).toFixed(1))

  return { sunlightPercent, sunlightHours, longestDarknessHours, earthVisibilityPercent, longestBlackoutHours }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const horizonsScienceProvider: ScienceProvider = {
  provenance: "scientific",

  async getCelestialState(site: LunarSite, timestamp: string): Promise<CelestialState> {
    const ts  = roundToMinute(timestamp)
    const key = `${site.id}|${ts}`

    if (celestialCache.has(key)) return celestialCache.get(key)!

    // Fetch Sun and Earth in parallel
    const [sunResult, earthResult] = await Promise.all([
      fetchObserver("10",  site, ts),  // Sun
      fetchObserver("399", site, ts),  // Earth
    ])

    // Graceful fallback: if Horizons is unavailable, re-use last known state
    // rather than showing stale zeros. The UI's dataError branch handles null.
    if (!sunResult && !earthResult) {
      throw new Error("Horizons unavailable")
    }

    const state: CelestialState = {
      timestamp: ts,
      sun: {
        azimuthDeg:   sunResult?.az   ?? 0,
        elevationDeg: sunResult?.el   ?? 0,
        visible:      (sunResult?.el ?? -1) > 0,
      },
      earth: {
        azimuthDeg:   earthResult?.az   ?? 0,
        elevationDeg: earthResult?.el   ?? 0,
        visible:      (earthResult?.el ?? -1) > 0,
      },
      provenance: "scientific",
    }

    celestialCache.set(key, state)
    return state
  },

  async getMissionMetrics(
    site: LunarSite,
    start: string,
    durationHours: number,
  ): Promise<MissionMetrics | null> {
    // Round start to hour
    const startHour = new Date(start).toISOString().slice(0, 13) + ":00:00.000Z"
    const key = `${site.id}|${startHour}|${durationHours}`

    if (metricsCache.has(key)) return metricsCache.get(key)!

    const [sunEntries, earthEntries] = await Promise.all([
      fetchObserverRange("10",  site, startHour, durationHours),
      fetchObserverRange("399", site, startHour, durationHours),
    ])

    if (!sunEntries.length && !earthEntries.length) return null

    const metrics: MissionMetrics = {
      ...computeMetricsFromSamples(sunEntries, earthEntries, durationHours),
      provenance: "scientific",
    }

    metricsCache.set(key, metrics)
    return metrics
  },

  async getHorizon(): Promise<HorizonProfile | null> {
    // No terrain horizon until a LOLA DEM is integrated.
    return null
  },
}

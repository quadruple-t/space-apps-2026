/**
 * Freeplay's data source: the Lunaris360 data API (see docs/API.md).
 *
 * Ephemeris comes from the stored JPL Horizons monthly chunks (`/api/v1/ephemeris/{YYYY-MM}`),
 * decoded and evaluated with lib/ephemeris (the same code the server's science routes use).
 * Terrain comes from `/api/v1/science/horizon`: a LOLA DEM mask for catalog sites, or a
 * labelled smooth-sphere horizon elsewhere.
 */

import { base64ToU8 } from "@/lib/bytes"
import {
  CartesianSeries, decodeEphemerisData, loadSeries, MAIN_SERIES_END, MAIN_SERIES_START, siteFrame, azElFromCartesian,
} from "@/lib/ephemeris"
import { EPHEMERIS_LAYOUT, type EphemerisChunk } from "@/lib/model/types"
import { maskAt } from "@/lib/terrain/mask"
import type { Sample } from "@/lib/illumination"
import type { CatalogSite } from "@/data/sites"

export { MAIN_SERIES_END, MAIN_SERIES_START }

const AU_KM = 149_597_870.7

type ChunkJson = Omit<EphemerisChunk, "data" | "layout" | "timeScale" | "source"> & { data: string }
type ApiError = { error?: { message?: string } }

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api/v1/${path}`)
  const body = (await res.json()) as T & ApiError
  if (!res.ok) throw new Error(body.error?.message ?? `Data API returned ${res.status}`)
  return body
}

const chunkCache = new Map<string, Promise<EphemerisChunk>>()

/** One month of hourly sub-solar/sub-Earth points, decoded. Cached for the page's lifetime. */
export function fetchEphemerisChunk(id: string): Promise<EphemerisChunk> {
  let p = chunkCache.get(id)
  if (!p) {
    p = getJson<ChunkJson>(`ephemeris/${encodeURIComponent(id)}`).then((j) => ({
      ...j,
      layout: EPHEMERIS_LAYOUT,
      timeScale: "UTC" as const,
      source: "JPL Horizons API" as const,
      data: decodeEphemerisData(base64ToU8(j.data), j.count),
    }))
    p.catch(() => chunkCache.delete(id))
    chunkCache.set(id, p)
  }
  return p
}

/** Moon-centred Sun and Earth positions covering [startIso, endIso] (inside 2026-01 … 2030-12). */
export function loadEphemeris(startIso: string, endIso: string): Promise<CartesianSeries> {
  return loadSeries(fetchEphemerisChunk, startIso, endIso)
}

export type TerrainHorizon = {
  /** Terrain elevation (deg) per azimuth bin, bin 0 = north, clockwise; null = smooth horizon */
  elevationsDeg: number[] | null
  azimuthStepDeg: number
  /** "LOLA DEM", "LOLA DEM grid" or "none — smooth horizon" */
  source: string
}

/** Where a site is: a catalog site (has a precomputed LOLA DEM mask) or a free point. */
export type SiteRef = { catalogId?: string; latitudeDeg: number; longitudeDeg: number }

const horizonCache = new Map<string, Promise<TerrainHorizon>>()

const SMOOTH_UNAVAILABLE: TerrainHorizon = { elevationsDeg: null, azimuthStepDeg: 1, source: "unavailable — smooth horizon" }

function requestHorizon(params: URLSearchParams): Promise<TerrainHorizon> {
  const key = params.toString()
  let p = horizonCache.get(key)
  if (!p) {
    p = getJson<{ horizon: { azimuthStepDeg: number; elevationsDeg: number[] } | null; source: string }>(`science/horizon?${key}`)
      .then((r) => ({ elevationsDeg: r.horizon?.elevationsDeg ?? null, azimuthStepDeg: r.horizon?.azimuthStepDeg ?? 1, source: r.source }))
    p.catch(() => horizonCache.delete(key))
    horizonCache.set(key, p)
  }
  return p
}

/**
 * Terrain horizon for a site. Catalog sites use their precomputed mask; the API refuses
 * catalog sites whose point is approximate (422), so those fall back to the coordinates.
 * Never rejects: if terrain is unavailable the result is a labelled smooth horizon.
 */
export function fetchTerrainHorizon(site: SiteRef): Promise<TerrainHorizon> {
  const byPoint = () => requestHorizon(new URLSearchParams({ lat: String(site.latitudeDeg), lon: String(site.longitudeDeg) }))
  const first = site.catalogId ? requestHorizon(new URLSearchParams({ siteId: site.catalogId })).catch(byPoint) : byPoint()
  return first.catch(() => SMOOTH_UNAVAILABLE)
}

/** Terrain horizon elevation (deg) at an azimuth; 0 for a smooth horizon. */
export function horizonAt(h: TerrainHorizon, azimuthDeg: number): number {
  return h.elevationsDeg ? maskAt(h.elevationsDeg, h.azimuthStepDeg, azimuthDeg) : 0
}

/** Hourly (or stepMinutes) samples at a site, with the terrain horizon under the Sun and Earth. */
export function siteSamples(series: CartesianSeries, site: SiteRef, horizon: TerrainHorizon, startMs: number, endMs: number, stepMinutes = 60): Sample[] {
  const frame = siteFrame(site.latitudeDeg, site.longitudeDeg)
  const out: Sample[] = []
  const end = Math.min(endMs, series.endMs)
  for (let t = Math.max(startMs, series.startMs); t <= end; t += stepMinutes * 60_000) {
    const { sun, earth } = series.at(t)
    const s = azElFromCartesian(frame, sun), e = azElFromCartesian(frame, earth)
    out.push({
      t,
      sunAz: s.azimuthDeg, sunEl: s.elevationDeg, sunHorizon: horizonAt(horizon, s.azimuthDeg),
      sunRangeAu: Math.hypot(...sun) / AU_KM,
      earthAz: e.azimuthDeg, earthEl: e.elevationDeg, earthHorizon: horizonAt(horizon, e.azimuthDeg),
    })
  }
  return out
}

let catalogPromise: Promise<CatalogSite[]> | null = null

/** Curated site index (GET /api/v1/catalog/sites). Cached for the page's lifetime. */
export function fetchCatalogSites(): Promise<CatalogSite[]> {
  if (!catalogPromise) {
    catalogPromise = getJson<{ sites: CatalogSite[] }>("catalog/sites").then((r) => r.sites)
    catalogPromise.catch(() => { catalogPromise = null })
  }
  return catalogPromise
}

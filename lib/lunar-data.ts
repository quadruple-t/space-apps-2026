/**
 * Open Exploration's data source: the Lunaris360 data API (see docs/API.md).
 *
 * Ephemeris comes from the stored JPL Horizons monthly chunks (`/api/v1/ephemeris/{YYYY-MM}`),
 * decoded and evaluated with lib/ephemeris and lib/science/sky (the same code the server's science
 * routes use; tests/science-parity.test.ts keeps the two paths in lockstep). The browser fetches raw
 * chunks only because the year-long graphs and day-by-day summaries need thousands of samples, which
 * would be too many round trips through /science/timeline (24 h, max 60-minute steps). It never
 * calls JPL Horizons, LOLA or PDS directly.
 * Terrain comes from `/api/v1/science/horizon`: a LOLA DEM mask for catalog sites or the LOLA
 * polar grid. Where neither covers a point, the horizon is computed in the browser from the
 * LROC GLD100 elevation grid (`/api/v1/terrain/dem`, 50 km radius) and labelled as such; only if
 * that fails too is it a labelled smooth-sphere horizon.
 */

import { base64ToU8 } from "@/lib/bytes"
import {
  CartesianSeries, decodeEphemerisData, loadSeries, MAIN_SERIES_END, MAIN_SERIES_START, siteFrame,
} from "@/lib/ephemeris"
import { EPHEMERIS_LAYOUT, type EphemerisChunk } from "@/lib/model/types"
import { horizonElevationAt, skySamples } from "@/lib/science/sky"
import type { Sample } from "@/lib/illumination"
import type { CatalogSite } from "@/data/sites"
import { horizonProfile } from "@/lib/terrain/dem"

export { MAIN_SERIES_END, MAIN_SERIES_START }

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

export const DEM_HORIZON_RADIUS_KM = 50
const DEM_HORIZON_SIZE = 257
export const DEM_HORIZON_SOURCE = `LROC GLD100 elevation (computed in browser, ${DEM_HORIZON_RADIUS_KM} km radius)`
const demHorizonCache = new Map<string, Promise<TerrainHorizon>>()

/**
 * Horizon from the GLD100 elevation grid centred on the point: 1° bins, observer 2 m above the
 * ground, lunar curvature included, terrain beyond the grid ignored. Values below the level
 * horizon are clamped to 0, matching the smooth-sphere convention.
 */
function demHorizon(site: SiteRef): Promise<TerrainHorizon> {
  const key = `${site.latitudeDeg.toFixed(3)}|${site.longitudeDeg.toFixed(3)}`
  let p = demHorizonCache.get(key)
  if (!p) {
    p = import("@/integrations/terrain/dem-client")
      .then(({ loadDemTile }) => loadDemTile(site.latitudeDeg, site.longitudeDeg, DEM_HORIZON_RADIUS_KM, DEM_HORIZON_SIZE))
      .then((tile) => ({ elevationsDeg: horizonProfile(tile, 0, 0, 1, 2).map((v) => Math.max(0, v)), azimuthStepDeg: 1, source: DEM_HORIZON_SOURCE }))
    p.catch(() => demHorizonCache.delete(key))
    demHorizonCache.set(key, p)
  }
  return p
}

/**
 * Terrain horizon for a site. Catalog sites use their precomputed mask; the API refuses
 * catalog sites whose point is approximate (422), so those fall back to the coordinates.
 * Points no stored LOLA horizon covers get a horizon computed from the GLD100 elevation grid.
 * Never rejects: if terrain is unavailable the result is a labelled smooth horizon.
 */
export function fetchTerrainHorizon(site: SiteRef): Promise<TerrainHorizon> {
  const byPoint = () => requestHorizon(new URLSearchParams({ lat: String(site.latitudeDeg), lon: String(site.longitudeDeg) }))
  const first = site.catalogId ? requestHorizon(new URLSearchParams({ siteId: site.catalogId })).catch(byPoint) : byPoint()
  return first.catch(() => SMOOTH_UNAVAILABLE)
    .then((stored) => stored.elevationsDeg ? stored : demHorizon(site).catch(() => stored))
}

/** Terrain horizon elevation (deg) at an azimuth; 0 for a smooth horizon. */
export function horizonAt(h: TerrainHorizon, azimuthDeg: number): number {
  return horizonElevationAt(h, azimuthDeg)
}

/** Hourly (or stepMinutes) samples at a site, with the terrain horizon under the Sun and Earth. */
export function siteSamples(series: CartesianSeries, site: SiteRef, horizon: TerrainHorizon, startMs: number, endMs: number, stepMinutes = 60): Sample[] {
  // The same evaluation the /api/v1/science/* handlers use (lib/science/sky.ts).
  const frame = siteFrame(site.latitudeDeg, site.longitudeDeg)
  return skySamples(series, frame, horizon, startMs, endMs, stepMinutes).map((p) => ({
    t: p.t,
    sunAz: p.sunAz, sunEl: p.sunEl, sunHorizon: p.sunHorizon, sunRangeAu: p.sunRangeAu,
    earthAz: p.earthAz, earthEl: p.earthEl, earthHorizon: p.earthHorizon,
  }))
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

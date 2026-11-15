"use client"

import { useEffect, useState } from "react"
import { COVERAGE_START_ISO } from "@/lib/freeplay-store"
import type { SiteRef } from "@/lib/lunar-data"

/**
 * Terrain facts for one site, the numbers behind the Slope, Elevation and Permanently-shadowed map layers.
 * Read from GET /api/v1/science/metrics. A field is null when the data set has nothing for that point:
 * slope and PSR come from the LOLA terrain grid (south of 80°S) or a catalog site's own DEM mask,
 * and elevation exists only for catalog sites.
 */
export type TerrainStats = {
  slopeDeg: number | null
  elevationM: number | null
  insidePsr: boolean | null
}

type MetricsBody = { slopeDeg?: number; elevationMeters?: number; insidePsr?: boolean; error?: { message?: string } }

async function request(params: URLSearchParams): Promise<TerrainStats> {
  // The terrain fields do not depend on the window, so ask for the shortest valid one at a fixed start. That keeps one cache entry per site.
  params.set("start", COVERAGE_START_ISO)
  params.set("durationHours", "1")
  const res = await fetch(`/api/v1/science/metrics?${params}`)
  const body = (await res.json()) as MetricsBody
  if (!res.ok) throw new Error(body.error?.message ?? `Data API returned ${res.status}`)
  return {
    slopeDeg: typeof body.slopeDeg === "number" ? body.slopeDeg : null,
    elevationM: typeof body.elevationMeters === "number" ? body.elevationMeters : null,
    insidePsr: typeof body.insidePsr === "boolean" ? body.insidePsr : null,
  }
}

const cache = new Map<string, Promise<TerrainStats>>()

/** Catalog sites use their own DEM mask; others, and catalog sites the API refuses, use coordinates. */
export function fetchTerrainStats(site: SiteRef): Promise<TerrainStats> {
  const key = `${site.catalogId ?? ""}|${site.latitudeDeg}|${site.longitudeDeg}`
  let p = cache.get(key)
  if (!p) {
    const byPoint = () => request(new URLSearchParams({ lat: String(site.latitudeDeg), lon: String(site.longitudeDeg) }))
    p = site.catalogId ? request(new URLSearchParams({ siteId: site.catalogId })).catch(byPoint) : byPoint()
    cache.set(key, p)
    p.catch(() => { if (cache.get(key) === p) cache.delete(key) })
  }
  return p
}

type State = { key: string | null; data: TerrainStats | null; error: string | null }

/** Terrain stats for a site; `loading` is true until the first answer. */
export function useTerrainStats(site: SiteRef | null) {
  const key = site ? `${site.catalogId ?? ""}|${site.latitudeDeg}|${site.longitudeDeg}` : null
  const [attempt, setAttempt] = useState(0)
  const tag = key ? `${key}|${attempt}` : null
  const [state, setState] = useState<State>({ key: null, data: null, error: null })
  useEffect(() => {
    if (!tag || !site) return
    let alive = true
    void fetchTerrainStats(site).then((data) => { if (alive) setState({ key: tag, data, error: null }) })
      .catch((error: unknown) => { if (alive) setState({ key: tag, data: null, error: error instanceof Error ? error.message : "Terrain data unavailable" }) })
    return () => { alive = false }
    // `site` and retry count are folded into `tag`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag])
  if (state.key !== tag) return { data: null, loading: !!tag, error: null, retry: () => setAttempt((n) => n + 1) }
  return { data: tag ? state.data : null, loading: false, error: tag ? state.error : null, retry: () => setAttempt((n) => n + 1) }
}

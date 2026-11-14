"use client"

import { useEffect, useState } from "react"
import type { CartesianSeries } from "@/lib/ephemeris"
import type { Sample } from "@/lib/illumination"
import { fetchTerrainHorizon, loadEphemeris, MAIN_SERIES_END, siteSamples, type SiteRef, type TerrainHorizon } from "@/lib/lunar-data"

export type LunarWindow = { series: CartesianSeries; horizon: TerrainHorizon; samples: Sample[]; endMs: number }
type State = { key: string | null; data: LunarWindow | null; error: string | null }

const SERIES_END_MS = Date.parse(MAIN_SERIES_END)

/**
 * Ephemeris, terrain horizon and hourly samples for a site over [startIso, startIso + hours].
 * The window is clipped to the stored series end (2030-12-31 23:00 UTC).
 */
export function useLunarWindow(site: SiteRef | null, startIso: string, hours: number, enabled = true) {
  const startMs = Date.parse(startIso)
  const endMs = Math.min(startMs + hours * 3_600_000, SERIES_END_MS)
  const key = site && enabled ? `${site.catalogId ?? ""}|${site.latitudeDeg}|${site.longitudeDeg}|${startMs}|${endMs}` : null
  const [state, setState] = useState<State>({ key: null, data: null, error: null })

  useEffect(() => {
    if (!key || !site) return
    let alive = true
    Promise.all([loadEphemeris(new Date(startMs).toISOString(), new Date(endMs).toISOString()), fetchTerrainHorizon(site)])
      .then(([series, horizon]) => {
        if (alive) setState({ key, data: { series, horizon, samples: siteSamples(series, site, horizon, startMs, endMs), endMs }, error: null })
      })
      .catch((e: unknown) => { if (alive) setState({ key, data: null, error: e instanceof Error ? e.message : String(e) }) })
    return () => { alive = false }
    // `site`, `startMs` and `endMs` are folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (state.key !== key) return { data: null, loading: !!key, error: null }
  return { data: state.data, loading: false, error: state.error }
}

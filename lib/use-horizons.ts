"use client"

import { useEffect, useState } from "react"
import { isoToHorizons, type ObserverEntry, type VectorEntry } from "./horizons"
import { mergeSeries, type Sample } from "./illumination"

type Source = "prefetch" | "cache" | "live"
type Fetched<T> = { data: T | null; loading: boolean; error: string | null; source: Source | null }

const memo = new Map<string, Promise<{ entries: unknown[]; source: Source }>>()

function getJson(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  let p = memo.get(qs)
  if (!p) {
    p = fetch(`/api/horizons?${qs}`).then(async (res) => {
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Horizons request failed (${res.status})`)
      return body as { entries: unknown[]; source: Source }
    })
    p.catch(() => memo.delete(qs))
    memo.set(qs, p)
  }
  return p
}

const window_ = (startIso: string, hours: number) => ({
  start: isoToHorizons(startIso),
  stop: isoToHorizons(new Date(Date.parse(startIso) + hours * 3_600_000).toISOString()),
})

const worst = (a: Source, b: Source): Source => (a === "live" || b === "live" ? "live" : a === "cache" || b === "cache" ? "cache" : "prefetch")

function useFetched<T>(key: string | null, load: () => Promise<{ data: T; source: Source }>): Fetched<T> {
  const [state, setState] = useState<Fetched<T> & { key: string | null }>({ key: null, data: null, loading: false, error: null, source: null })
  useEffect(() => {
    if (!key) return
    let alive = true
    load().then(
      ({ data, source }) => { if (alive) setState({ key, data, loading: false, error: null, source }) },
      (e: unknown) => { if (alive) setState({ key, data: null, loading: false, error: e instanceof Error ? e.message : String(e), source: null }) },
    )
    return () => { alive = false }
    // `load` is derived from `key`; re-running on key change is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (state.key !== key) return { data: null, loading: !!key, error: null, source: null }
  return state
}

/** Hourly Sun and Earth az/el at a site over [startIso, startIso + hours]. */
export function useSiteSeries(lat: number, lon: number, startIso: string, hours: number) {
  const { start, stop } = window_(startIso, hours)
  const key = `${lat},${lon},${start},${stop}`
  return useFetched<Sample[]>(key, async () => {
    const base = { type: "OBSERVER", lat: String(lat), lon: String(lon), start, stop, step: "1h" }
    const [sun, earth] = await Promise.all([getJson({ ...base, command: "10" }), getJson({ ...base, command: "399" })])
    return { data: mergeSeries(sun.entries as ObserverEntry[], earth.entries as ObserverEntry[]), source: worst(sun.source, earth.source) }
  })
}

export type OrbitVectors = { moon: VectorEntry[]; sun: VectorEntry[]; stepHours: number }

/** Geocentric Moon and Sun positions over the mission (km, ecliptic). */
export function useOrbitVectors(startIso: string, hours: number) {
  const stepHours = hours > 45 * 24 ? 6 : 1
  // A day past the end so the motion arrow (drawn ahead of the Moon) has data.
  // No pad before the start: it would fall outside the prefetched window.
  const { start, stop } = window_(startIso, hours + 24)
  const key = `${start},${stop},${stepHours}`
  return useFetched<OrbitVectors>(key, async () => {
    const base = { type: "VECTORS", start, stop, step: `${stepHours}h` }
    const [moon, sun] = await Promise.all([getJson({ ...base, command: "301" }), getJson({ ...base, command: "10" })])
    return { data: { moon: moon.entries as VectorEntry[], sun: sun.entries as VectorEntry[], stepHours }, source: worst(moon.source, sun.source) }
  })
}

"use client"

import { create } from "zustand"
import type { FreeplaySite } from "@/data/sites"
import { DEFAULT_METRICS, isMetricKey, type MetricKey, type SlotMetrics } from "@/lib/comparison"
import type { TerrainStats } from "@/lib/terrain-stats"
import type { CompositionStats } from "@/lib/use-composition"

export type SlotId = "a" | "b"

export type SnapshotSide = {
  site: FreeplaySite
  /** Terrain source at the time ("LOLA DEM", "none — smooth horizon", …) so a logged row stays honest */
  terrain: string
  metrics: SlotMetrics
  /** Slope, elevation and PSR facts at the time; absent in entries logged before these existed */
  layers?: TerrainStats
  /** Regional composition and the optional modeled meteor exposure at logging time. */
  composition?: CompositionStats
  meteor?: { name: string; referenceUtc: string; exposurePct: number }
}

/** One tracked row: both sites' numbers plus the window and panel assumptions they were computed with. */
export type Snapshot = {
  id: string
  savedAt: string
  label: string
  startIso: string
  durationHours: number
  panelAreaM2: number
  panelEfficiency: number
  a: SnapshotSide
  b: SnapshotSide
}

const STORAGE_KEY = "lunaris360-comparison-v1"
export const MAX_SNAPSHOTS = 100

type Persisted = {
  slotA: FreeplaySite | null
  slotB: FreeplaySite | null
  /** Metric rows shown in the table, chosen by the user */
  metrics: MetricKey[]
  /** Notes follow a site across comparisons */
  siteNotes: Record<string, string>
  /** Decision notes for one pair of sites; key is the two site ids, sorted */
  pairNotes: Record<string, string>
  log: Snapshot[]
}

export const pairKey = (a: FreeplaySite | null, b: FreeplaySite | null) =>
  a && b ? [a.id, b.id].sort().join("|") : null

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const isSite = (v: unknown): v is FreeplaySite =>
  isObject(v) && typeof v.id === "string" && typeof v.name === "string" && Number.isFinite(v.latitudeDeg) && Number.isFinite(v.longitudeDeg)
const isSide = (v: unknown): v is SnapshotSide => isObject(v) && isSite(v.site) && typeof v.terrain === "string" && isObject(v.metrics)
const isSnapshot = (v: unknown): v is Snapshot =>
  isObject(v) && typeof v.id === "string" && typeof v.savedAt === "string" && typeof v.label === "string" && typeof v.startIso === "string"
  && Number.isFinite(v.durationHours) && Number.isFinite(v.panelAreaM2) && Number.isFinite(v.panelEfficiency) && isSide(v.a) && isSide(v.b)
const stringRecord = (v: unknown): Record<string, string> =>
  isObject(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string")) : {}

function load(): Persisted {
  const empty: Persisted = { slotA: null, slotB: null, metrics: DEFAULT_METRICS, siteNotes: {}, pairNotes: {}, log: [] }
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return empty
    const p: unknown = JSON.parse(raw)
    if (!isObject(p)) return empty
    const oldDefaults = ["sunlightPct", "sunlightHours", "longestDarkHours", "earthPct", "longestBlackoutHours", "peakSunEl", "energyKWh"]
    const savedMetrics = Array.isArray(p.metrics) ? [...new Set(p.metrics.filter(isMetricKey))] : DEFAULT_METRICS
    const metrics = savedMetrics.length === oldDefaults.length && oldDefaults.every((key) => savedMetrics.includes(key as MetricKey)) ? DEFAULT_METRICS : savedMetrics
    return {
      slotA: isSite(p.slotA) ? p.slotA : null,
      slotB: isSite(p.slotB) ? p.slotB : null,
      // A saved empty list is the user's choice; only a missing list falls back to the defaults.
      metrics,
      siteNotes: stringRecord(p.siteNotes),
      pairNotes: stringRecord(p.pairNotes),
      log: Array.isArray(p.log) ? p.log.filter(isSnapshot) : [],
    }
  } catch {
    return empty
  }
}

function save(p: Persisted) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    // Private mode or blocked storage: notes and the log last for this session only.
  }
}

type ComparisonState = Persisted & {
  hydrated: boolean
  setSlot: (slot: SlotId, site: FreeplaySite | null) => void
  swap: () => void
  addMetric: (key: MetricKey) => void
  removeMetric: (key: MetricKey) => void
  resetMetrics: () => void
  setSiteNote: (siteId: string, text: string) => void
  setPairNote: (key: string, text: string) => void
  addSnapshot: (snapshot: Omit<Snapshot, "id" | "savedAt">) => void
  setSnapshotLabel: (id: string, label: string) => void
  removeSnapshot: (id: string) => void
  hydrate: () => void
}

export const useComparison = create<ComparisonState>((set, get) => {
  const persist = () => {
    const { slotA, slotB, metrics, siteNotes, pairNotes, log } = get()
    save({ slotA, slotB, metrics, siteNotes, pairNotes, log })
  }
  return {
    slotA: null,
    slotB: null,
    metrics: DEFAULT_METRICS,
    siteNotes: {},
    pairNotes: {},
    log: [],
    hydrated: false,

    setSlot: (slot, site) => { set(slot === "a" ? { slotA: site } : { slotB: site }); persist() },
    swap: () => { set((s) => ({ slotA: s.slotB, slotB: s.slotA })); persist() },
    addMetric: (key) => { set((s) => (s.metrics.includes(key) ? s : { metrics: [...s.metrics, key] })); persist() },
    removeMetric: (key) => { set((s) => ({ metrics: s.metrics.filter((m) => m !== key) })); persist() },
    resetMetrics: () => { set({ metrics: DEFAULT_METRICS }); persist() },
    setSiteNote: (siteId, text) => {
      set((s) => {
        const next = { ...s.siteNotes }
        if (text) next[siteId] = text; else delete next[siteId]
        return { siteNotes: next }
      })
      persist()
    },
    setPairNote: (key, text) => {
      set((s) => {
        const next = { ...s.pairNotes }
        if (text) next[key] = text; else delete next[key]
        return { pairNotes: next }
      })
      persist()
    },
    addSnapshot: (snapshot) => {
      const entry: Snapshot = { ...snapshot, id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, savedAt: new Date().toISOString() }
      set((s) => ({ log: [entry, ...s.log].slice(0, MAX_SNAPSHOTS) }))
      persist()
    },
    setSnapshotLabel: (id, label) => { set((s) => ({ log: s.log.map((x) => (x.id === id ? { ...x, label } : x)) })); persist() },
    removeSnapshot: (id) => { set((s) => ({ log: s.log.filter((x) => x.id !== id) })); persist() },
    hydrate: () => {
      if (get().hydrated) return
      set({ ...load(), hydrated: true })
    },
  }
})

"use client"

import { create } from "zustand"
import { DEFAULT_SITE_ID, PRESET_SITES, type FreeplaySite } from "@/data/sites"
import { DEMO_START_ISO } from "@/lib/prefetch"

export type FreeplayView = "globe" | "orbit"
export type LayerId = "slope" | "illumination" | "psr" | "elevation"
export type LayerState = { on: boolean; opacity: number }
export type GraphTab = "daily" | "yearly"

/** 1× plays one simulated hour per real second. */
export const SPEEDS = [1, 10, 100, 1000] as const
export type Speed = (typeof SPEEDS)[number]

export const LUNAR_DAY_HOURS = 29.530589 * 24
export const DURATION_PRESETS = [
  { label: "1 day", hours: 24 },
  { label: "1 lunar day", hours: Math.round(LUNAR_DAY_HOURS) },
  { label: "1 year", hours: 365 * 24 },
] as const


const STORAGE_KEY = "shadowline-freeplay-v1"

type Persisted = { savedSites: FreeplaySite[]; panelAreaM2: number; panelEfficiency: number }

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {}
  } catch {
    return {}
  }
}

function savePersisted(p: Persisted) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    // Private mode or blocked storage: saved sites last for this session only.
  }
}

type FreeplayState = {
  view: FreeplayView
  site: FreeplaySite
  calloutOpen: boolean
  savedSites: FreeplaySite[]
  hydrated: boolean

  startIso: string
  durationHours: number
  elapsedHours: number
  playing: boolean
  speed: Speed

  layers: Record<LayerId, LayerState>
  graphTab: GraphTab
  panelAreaM2: number
  panelEfficiency: number

  setView: (v: FreeplayView) => void
  selectSite: (site: FreeplaySite, openCallout?: boolean) => void
  selectCustom: (latitudeDeg: number, longitudeDeg: number) => void
  setRadius: (km: number) => void
  setCalloutOpen: (open: boolean) => void
  saveCurrentSite: () => void
  renameSaved: (id: string, name: string) => void
  setSavedRadius: (id: string, km: number) => void
  deleteSaved: (id: string) => void

  setStart: (iso: string) => void
  setDuration: (hours: number) => void
  setElapsed: (hours: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: Speed) => void

  setLayer: (id: LayerId, patch: Partial<LayerState>) => void
  setGraphTab: (t: GraphTab) => void
  setPanel: (areaM2: number, efficiency: number) => void
  hydrate: () => void
}

const defaultSite = PRESET_SITES.find((s) => s.id === DEFAULT_SITE_ID) ?? PRESET_SITES[0]
const round = (n: number, d = 4) => Number(n.toFixed(d))

export const useFreeplay = create<FreeplayState>((set, get) => {
  const persist = () => {
    const { savedSites, panelAreaM2, panelEfficiency } = get()
    savePersisted({ savedSites, panelAreaM2, panelEfficiency })
  }

  return {
    view: "globe",
    site: defaultSite,
    calloutOpen: false,
    savedSites: [],
    hydrated: false,

    startIso: DEMO_START_ISO,
    durationHours: Math.round(LUNAR_DAY_HOURS),
    elapsedHours: 0,
    playing: false,
    speed: 10,

    layers: {
      slope: { on: false, opacity: 0.7 },
      illumination: { on: false, opacity: 0.75 },
      psr: { on: false, opacity: 0.9 },
      elevation: { on: false, opacity: 0.6 },
    },
    graphTab: "daily",
    panelAreaM2: 1,
    panelEfficiency: 0.3,

    setView: (view) => set({ view }),
    selectSite: (site, openCallout = true) => set({ site, calloutOpen: openCallout }),
    selectCustom: (latitudeDeg, longitudeDeg) => {
      const lat = round(latitudeDeg), lon = round(((longitudeDeg % 360) + 360) % 360)
      set({
        calloutOpen: true,
        site: {
          id: `custom-${lat}-${lon}`, name: "Custom site", latitudeDeg: lat, longitudeDeg: lon,
          radiusKm: get().site.radiusKm, program: "—", country: "—", verified: false,
          source: "Picked on the globe", coordinateReference: defaultSite.coordinateReference,
          provenance: "user", kind: "custom",
        },
      })
    },
    setRadius: (km) => {
      const radiusKm = Math.max(0.1, Math.min(500, km))
      const site = { ...get().site, radiusKm }
      set({ site })
      if (site.kind === "saved") get().setSavedRadius(site.id, radiusKm)
    },
    setCalloutOpen: (calloutOpen) => set({ calloutOpen }),
    saveCurrentSite: () => {
      const { site, savedSites } = get()
      const saved: FreeplaySite = {
        ...site, kind: "saved", provenance: "user",
        id: `saved-${Date.now().toString(36)}`,
        name: site.kind === "custom" ? `Site ${savedSites.length + 1}` : `${site.name} (copy)`,
      }
      set({ savedSites: [...savedSites, saved], site: saved })
      persist()
    },
    renameSaved: (id, name) => {
      set((s) => ({
        savedSites: s.savedSites.map((x) => (x.id === id ? { ...x, name } : x)),
        site: s.site.id === id ? { ...s.site, name } : s.site,
      }))
      persist()
    },
    setSavedRadius: (id, km) => {
      set((s) => ({ savedSites: s.savedSites.map((x) => (x.id === id ? { ...x, radiusKm: km } : x)) }))
      persist()
    },
    deleteSaved: (id) => {
      set((s) => ({
        savedSites: s.savedSites.filter((x) => x.id !== id),
        site: s.site.id === id ? { ...s.site, kind: "custom", id: `custom-${s.site.latitudeDeg}-${s.site.longitudeDeg}` } : s.site,
      }))
      persist()
    },

    setStart: (startIso) => set({ startIso, elapsedHours: 0, playing: false }),
    setDuration: (hours) => set((s) => ({ durationHours: hours, elapsedHours: Math.min(s.elapsedHours, hours) })),
    setElapsed: (h) => set((s) => ({ elapsedHours: Math.max(0, Math.min(s.durationHours, h)) })),
    setPlaying: (playing) => set((s) => ({ playing, elapsedHours: playing && s.elapsedHours >= s.durationHours ? 0 : s.elapsedHours })),
    setSpeed: (speed) => set({ speed }),

    setLayer: (id, patch) => set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], ...patch } } })),
    setGraphTab: (graphTab) => set({ graphTab }),
    setPanel: (panelAreaM2, panelEfficiency) => { set({ panelAreaM2, panelEfficiency }); persist() },
    hydrate: () => {
      if (get().hydrated) return
      const p = loadPersisted()
      set({
        hydrated: true,
        savedSites: Array.isArray(p.savedSites) ? p.savedSites : [],
        panelAreaM2: typeof p.panelAreaM2 === "number" ? p.panelAreaM2 : 1,
        panelEfficiency: typeof p.panelEfficiency === "number" ? p.panelEfficiency : 0.3,
      })
    },
  }
})

export const currentTimeMs = (s: Pick<FreeplayState, "startIso" | "elapsedHours">) =>
  Date.parse(s.startIso) + s.elapsedHours * 3_600_000

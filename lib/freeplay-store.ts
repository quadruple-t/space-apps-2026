"use client"

import { create } from "zustand"
import { COORD_REF, type FreeplaySite } from "@/data/sites"

/** "orbit" is the Orbit + Graphs screen, "compare" the two-site Mission comparison. */
export type FreeplayView = "globe" | "orbit" | "compare"
export type LayerId = "slope" | "illumination" | "psr" | "elevation" | "landings" | "impacts" | "heritage" | "coldTraps" | "resources" | "artemis" | "titanium" | "iron" | "thorium" | "olivine" | "plagioclase" | "pyroxene" | "silicates" | "iceDepth" | "temperatureMax" | "temperatureMin" | "impactHistory" | "meteorStreams"
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


/** Saved sites per expedition; matches EXPEDITION_LIMITS.sites and firestore.rules. */
export const MAX_SAVED_SITES = 50

type FreeplayState = {
  view: FreeplayView
  /** null until the user picks a point on the globe or one of their saved sites */
  site: FreeplaySite | null
  calloutOpen: boolean
  /** Saved sites of the open expedition (or the signed-out draft); loaded and saved by lib/expeditions. */
  savedSites: FreeplaySite[]

  startIso: string
  durationHours: number
  elapsedHours: number
  playing: boolean
  speed: Speed

  layers: Record<LayerId, LayerState>
  /** Show the Lunaris360 catalog sites (landings and Artemis candidates) as pins on the globe */
  meteorStream: string
  setMeteorStream: (name: string) => void
  showCatalog: boolean
  graphTab: GraphTab
  panelAreaM2: number
  panelEfficiency: number

  /** Bumped to ask the globe to fly to the selected site (the assistant uses it for any site kind). */
  focusNonce: number
  requestFocus: () => void

  setView: (v: FreeplayView) => void
  selectSite: (site: FreeplaySite, openCallout?: boolean) => void
  selectCustom: (latitudeDeg: number, longitudeDeg: number) => void
  setRadius: (km: number) => void
  setCalloutOpen: (open: boolean) => void
  saveCurrentSite: (name: string) => void
  renameSaved: (id: string, name: string) => void
  setSavedRadius: (id: string, km: number) => void
  deleteSaved: (id: string) => void

  setStart: (iso: string) => void
  setDuration: (hours: number) => void
  setElapsed: (hours: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: Speed) => void

  setLayer: (id: LayerId, patch: Partial<LayerState>) => void
  setShowCatalog: (show: boolean) => void
  setGraphTab: (t: GraphTab) => void
  setPanel: (areaM2: number, efficiency: number) => void
}

export const DEFAULT_LAYERS: Record<LayerId, LayerState> = {
  landings: { on: false, opacity: 0.8 },
  impacts: { on: false, opacity: 0.8 },
  heritage: { on: false, opacity: 0.8 },
  coldTraps: { on: false, opacity: 0.8 },
  resources: { on: false, opacity: 0.8 },
  artemis: { on: false, opacity: 0.8 },
  titanium: { on: false, opacity: 0.7 },
  iron: { on: false, opacity: 0.7 },
  thorium: { on: false, opacity: 0.7 },
  olivine: { on: false, opacity: 0.7 },
  plagioclase: { on: false, opacity: 0.7 },
  pyroxene: { on: false, opacity: 0.7 },
  silicates: { on: false, opacity: 0.7 },
  iceDepth: { on: false, opacity: 0.7 },
  temperatureMax: { on: false, opacity: 0.7 },
  temperatureMin: { on: false, opacity: 0.7 },
  impactHistory: { on: false, opacity: 0.7 },
  meteorStreams: { on: false, opacity: 0.7 },
  slope: { on: false, opacity: 0.7 },
  illumination: { on: false, opacity: 0.75 },
  psr: { on: false, opacity: 0.9 },
  elevation: { on: false, opacity: 0.6 },
}
export const LAYER_IDS = Object.keys(DEFAULT_LAYERS) as LayerId[]
export const DEFAULT_METEOR_STREAM = "Geminids"
export const DEFAULT_PANEL = { areaM2: 1, efficiency: 0.3 } as const

const DEFAULT_RADIUS_KM = 10
/** Default mission start. Stored ephemeris covers 2026-01-01 … 2030-12-31 (docs/API.md). */
export const DEFAULT_START_ISO = "2026-12-01T00:00:00.000Z"
export const COVERAGE_START_ISO = "2026-01-01T00:00:00.000Z"
export const COVERAGE_END_ISO = "2030-12-31T23:00:00.000Z"
const round = (n: number, d = 4) => Number(n.toFixed(d))

export const useFreeplay = create<FreeplayState>((set, get) => {
  return {
    view: "globe",
    site: null,
    calloutOpen: false,
    savedSites: [],

    startIso: DEFAULT_START_ISO,
    durationHours: Math.round(LUNAR_DAY_HOURS),
    elapsedHours: 0,
    playing: false,
    speed: 10,

    layers: DEFAULT_LAYERS,
    meteorStream: DEFAULT_METEOR_STREAM,
    setMeteorStream: (meteorStream) => set({ meteorStream }),
    showCatalog: false,
    graphTab: "daily",
    panelAreaM2: DEFAULT_PANEL.areaM2,
    panelEfficiency: DEFAULT_PANEL.efficiency,

    focusNonce: 0,
    requestFocus: () => set((s) => ({ focusNonce: s.focusNonce + 1 })),

    setView: (view) => set({ view }),
    selectSite: (site, openCallout = true) => set({ site, calloutOpen: openCallout }),
    selectCustom: (latitudeDeg, longitudeDeg) => {
      const lat = round(latitudeDeg), lon = round(((longitudeDeg % 360) + 360) % 360)
      set({
        calloutOpen: true,
        site: {
          id: `custom-${lat}-${lon}`, name: "Custom site", latitudeDeg: lat, longitudeDeg: lon,
          radiusKm: get().site?.radiusKm ?? DEFAULT_RADIUS_KM, coordinateReference: COORD_REF,
          provenance: "user", kind: "custom",
        },
      })
    },
    setRadius: (km) => {
      const current = get().site
      if (!current) return
      const radiusKm = Math.max(0.1, Math.min(500, km))
      const site = { ...current, radiusKm }
      set({ site })
      if (site.kind === "saved") get().setSavedRadius(site.id, radiusKm)
    },
    setCalloutOpen: (calloutOpen) => set({ calloutOpen }),
    saveCurrentSite: (name) => {
      const { site, savedSites } = get()
      if (!site || savedSites.length >= MAX_SAVED_SITES) return
      const saved: FreeplaySite = {
        ...site, kind: "saved", provenance: "user",
        id: `saved-${Date.now().toString(36)}`,
        name: name.trim() || `Site ${savedSites.length + 1}`,
      }
      set({ savedSites: [...savedSites, saved], site: saved })
    },
    renameSaved: (id, name) => {
      set((s) => ({
        savedSites: s.savedSites.map((x) => (x.id === id ? { ...x, name } : x)),
        site: s.site?.id === id ? { ...s.site, name } : s.site,
      }))
    },
    setSavedRadius: (id, km) => {
      set((s) => ({ savedSites: s.savedSites.map((x) => (x.id === id ? { ...x, radiusKm: km } : x)) }))
    },
    deleteSaved: (id) => {
      set((s) => ({
        savedSites: s.savedSites.filter((x) => x.id !== id),
        site: s.site?.id === id ? { ...s.site, kind: "custom", name: "Custom site", id: `custom-${s.site.latitudeDeg}-${s.site.longitudeDeg}` } : s.site,
      }))
    },

    setStart: (iso) => {
      const ms = Math.min(Date.parse(COVERAGE_END_ISO) - 3_600_000, Math.max(Date.parse(COVERAGE_START_ISO), Date.parse(iso)))
      set({ startIso: new Date(ms).toISOString(), elapsedHours: 0, playing: false })
    },
    setDuration: (hours) => set((s) => ({ durationHours: hours, elapsedHours: Math.min(s.elapsedHours, hours) })),
    setElapsed: (h) => set((s) => ({ elapsedHours: Math.max(0, Math.min(s.durationHours, h)) })),
    setPlaying: (playing) => set((s) => ({ playing, elapsedHours: playing && s.elapsedHours >= s.durationHours ? 0 : s.elapsedHours })),
    setSpeed: (speed) => set({ speed }),

    setLayer: (id, patch) => set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], ...patch } } })),
    setShowCatalog: (showCatalog) => set({ showCatalog }),
    setGraphTab: (graphTab) => set({ graphTab }),
    setPanel: (panelAreaM2, panelEfficiency) => set({ panelAreaM2, panelEfficiency }),
  }
})

export const currentTimeMs = (s: Pick<FreeplayState, "startIso" | "elapsedHours">) =>
  Date.parse(s.startIso) + s.elapsedHours * 3_600_000

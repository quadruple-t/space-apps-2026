/**
 * Pure helpers that move expedition content between the Freeplay/assistant stores and storage.
 * Stored data (Firestore docs, the localStorage draft) is never trusted: the sanitizers clamp,
 * drop and default instead of throwing, so a corrupt or older document degrades to defaults
 * rather than crashing Freeplay.
 */
import { COORD_REF, type FreeplaySite, type SiteKind } from "@/data/sites";
import {
  COVERAGE_END_ISO,
  COVERAGE_START_ISO,
  DEFAULT_LAYERS,
  DEFAULT_METEOR_STREAM,
  DEFAULT_PANEL,
  DEFAULT_START_ISO,
  LAYER_IDS,
  LUNAR_DAY_HOURS,
  SPEEDS,
  type LayerId,
  type LayerState,
  type Speed,
} from "@/lib/freeplay-store";
import {
  EXPEDITION_LIMITS as L,
  EXPEDITION_VERSION,
  STUDY_KINDS,
  STUDY_SOURCES,
  type ExpeditionDraft,
  type ExpeditionWorkspace,
  type StoredChatMessage,
  type StoredSourceRecord,
  type Study,
} from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const str = (v: unknown, fallback: string, max = Infinity) => (typeof v === "string" ? v.slice(0, max) : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const isoIn = (v: unknown, fallback: string) => {
  const ms = typeof v === "string" ? Date.parse(v) : NaN;
  if (!Number.isFinite(ms)) return fallback;
  const clamped = Math.min(Date.parse(COVERAGE_END_ISO) - 3_600_000, Math.max(Date.parse(COVERAGE_START_ISO), ms));
  return new Date(clamped).toISOString();
};

const MAX_DURATION_HOURS = 366 * 24;

export const DEFAULT_WORKSPACE: ExpeditionWorkspace = {
  view: "globe",
  site: null,
  startIso: DEFAULT_START_ISO,
  durationHours: Math.round(LUNAR_DAY_HOURS),
  elapsedHours: 0,
  speed: 10,
  layers: DEFAULT_LAYERS,
  meteorStream: DEFAULT_METEOR_STREAM,
  showCatalog: false,
  graphTab: "daily",
  panelAreaM2: DEFAULT_PANEL.areaM2,
  panelEfficiency: DEFAULT_PANEL.efficiency,
};

export function emptyDraft(now = new Date().toISOString()): ExpeditionDraft {
  return { version: EXPEDITION_VERSION, notes: "", workspace: DEFAULT_WORKSPACE, sites: [], studies: [], chat: [], updatedAt: now };
}

// ---------------------------------------------------------------
// Freeplay workspace
// ---------------------------------------------------------------

type WorkspaceSource = { [K in keyof ExpeditionWorkspace]: ExpeditionWorkspace[K] } & Obj;

/** Picks the persistent fields out of the Freeplay store state. */
export function captureWorkspace(s: WorkspaceSource): ExpeditionWorkspace {
  return {
    view: s.view, site: s.site, startIso: s.startIso, durationHours: s.durationHours, elapsedHours: s.elapsedHours,
    speed: s.speed, layers: s.layers, meteorStream: s.meteorStream, showCatalog: s.showCatalog, graphTab: s.graphTab,
    panelAreaM2: s.panelAreaM2, panelEfficiency: s.panelEfficiency,
  };
}

/** The Freeplay store patch that restores a workspace; also stops playback and closes the callout. */
export function workspaceToStorePatch(ws: ExpeditionWorkspace, sites: FreeplaySite[]) {
  return { ...ws, savedSites: sites, playing: false, calloutOpen: false };
}

/** Stable comparison key so autosave only writes when something persistent changed. */
export function workspaceKey(ws: ExpeditionWorkspace, sites: FreeplaySite[]): string {
  return JSON.stringify([ws, sites]);
}

const SITE_KINDS: readonly SiteKind[] = ["saved", "custom", "catalog"];
const PROVENANCE = ["user", "illustrative", "scientific"] as const;

export function sanitizeSite(v: unknown): FreeplaySite | null {
  if (!isObj(v)) return null;
  const lat = num(v.latitudeDeg, NaN), lon = num(v.longitudeDeg, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) return null;
  const site: FreeplaySite = {
    id: str(v.id, `saved-${Math.abs(Math.round(lat * 1e4))}-${Math.round(lon * 1e4)}`, 120),
    name: str(v.name, "Saved site", L.nameChars) || "Saved site",
    latitudeDeg: lat,
    longitudeDeg: lon >= 0 && lon < 360 ? lon : ((lon % 360) + 360) % 360,
    coordinateReference: str(v.coordinateReference, COORD_REF, 200),
    provenance: oneOf(v.provenance, PROVENANCE, "user"),
    radiusKm: num(v.radiusKm, 10, 0.1, 500),
    kind: oneOf(v.kind, SITE_KINDS, "saved"),
  };
  if (typeof v.catalogId === "string") site.catalogId = v.catalogId.slice(0, 120);
  if (typeof v.catalogPointVerified === "boolean") site.catalogPointVerified = v.catalogPointVerified;
  if (typeof v.elevationMeters === "number" && Number.isFinite(v.elevationMeters)) site.elevationMeters = v.elevationMeters;
  if (typeof v.slopeDeg === "number" && Number.isFinite(v.slopeDeg)) site.slopeDeg = v.slopeDeg;
  return site;
}

export function sanitizeSites(v: unknown): FreeplaySite[] {
  if (!Array.isArray(v)) return [];
  const out: FreeplaySite[] = [], seen = new Set<string>();
  for (const raw of v) {
    const site = sanitizeSite(raw);
    if (!site || seen.has(site.id)) continue;
    seen.add(site.id);
    out.push({ ...site, kind: "saved", provenance: "user" });
    if (out.length >= L.sites) break;
  }
  return out;
}

function sanitizeLayers(v: unknown): Record<LayerId, LayerState> {
  const src = isObj(v) ? v : {};
  const out = {} as Record<LayerId, LayerState>;
  for (const id of LAYER_IDS) {
    const l = src[id], d = DEFAULT_LAYERS[id];
    out[id] = isObj(l) ? { on: typeof l.on === "boolean" ? l.on : d.on, opacity: num(l.opacity, d.opacity, 0, 1) } : d;
  }
  return out;
}

export function sanitizeWorkspace(v: unknown): ExpeditionWorkspace {
  if (!isObj(v)) return DEFAULT_WORKSPACE;
  const d = DEFAULT_WORKSPACE;
  const durationHours = num(v.durationHours, d.durationHours, 1, MAX_DURATION_HOURS);
  return {
    view: oneOf(v.view, ["globe", "orbit"] as const, d.view),
    site: v.site === null || v.site === undefined ? null : sanitizeSite(v.site),
    startIso: isoIn(v.startIso, d.startIso),
    durationHours,
    elapsedHours: num(v.elapsedHours, 0, 0, durationHours),
    speed: (SPEEDS as readonly number[]).includes(v.speed as number) ? (v.speed as Speed) : d.speed,
    layers: sanitizeLayers(v.layers),
    meteorStream: str(v.meteorStream, d.meteorStream, 80) || d.meteorStream,
    showCatalog: typeof v.showCatalog === "boolean" ? v.showCatalog : d.showCatalog,
    graphTab: oneOf(v.graphTab, ["daily", "yearly"] as const, d.graphTab),
    panelAreaM2: num(v.panelAreaM2, d.panelAreaM2, 0.01, 10_000),
    panelEfficiency: num(v.panelEfficiency, d.panelEfficiency, 0.01, 1),
  };
}

// ---------------------------------------------------------------
// Studies
// ---------------------------------------------------------------

/**
 * Firestore rejects `undefined` and nested arrays; a JSON round-trip drops undefined, and the
 * size check keeps one study far below the 1 MiB document limit. Returns null if it does not fit.
 */
export function toStorableJson(v: unknown): Obj | null {
  if (!isObj(v)) return null;
  let text: string;
  try { text = JSON.stringify(v); } catch { return null; }
  if (text.length > L.studyJsonChars) return null;
  const parsed = JSON.parse(text) as Obj;
  return hasNestedArray(parsed) ? null : parsed;
}

function hasNestedArray(v: unknown, inArray = false): boolean {
  if (Array.isArray(v)) return inArray || v.some((x) => hasNestedArray(x, true));
  if (isObj(v)) return Object.values(v).some((x) => hasNestedArray(x, false));
  return false;
}

export function sanitizeStudy(v: unknown): Study | null {
  if (!isObj(v) || typeof v.id !== "string") return null;
  const inputs = isObj(v.inputs) ? v.inputs : null, result = isObj(v.result) ? v.result : null;
  if (!inputs || !result) return null;
  const kind = oneOf(v.kind, STUDY_KINDS, "comparison");
  return {
    id: v.id.slice(0, 120),
    kind,
    source: oneOf(v.source, STUDY_SOURCES, kind === "ranking" ? "mission-control" : "compare-page"),
    label: str(v.label, kind === "ranking" ? "Ranking" : "Comparison", L.studyLabelChars) || "Study",
    inputs,
    result,
    createdAt: str(v.createdAt, new Date(0).toISOString(), 40),
  };
}

export function sanitizeStudies(v: unknown): Study[] {
  return Array.isArray(v) ? v.map(sanitizeStudy).filter((s): s is Study => s !== null).slice(0, L.studies) : [];
}

// ---------------------------------------------------------------
// Mission Control chat
// ---------------------------------------------------------------

/** What serializeChat needs from an assistant UiMessage (structurally compatible with it). */
export type ChatSource = {
  role: "user" | "model";
  text: string;
  answered?: boolean;
  notices?: string[];
  records?: { tool: string; label: string; ok: boolean; site: string | null; horizonKind: string | null; horizonLabel: string | null; dataRange: string | null; mustSay: string[]; error?: string; internal?: boolean; ui?: unknown }[];
};

function storedRecord(r: NonNullable<ChatSource["records"]>[number]): StoredSourceRecord {
  return {
    tool: r.tool, label: r.label, ok: r.ok, site: r.site, horizonKind: r.horizonKind, horizonLabel: r.horizonLabel,
    dataRange: r.dataRange, mustSay: [...r.mustSay], ...(r.error ? { error: r.error } : {}),
  };
}

/**
 * Keeps the last messages, with source records (horizon labels and required wording intact) but
 * without undo snapshots or on-screen change lists, which only make sense in the session that made them.
 */
export function serializeChat(messages: readonly ChatSource[]): StoredChatMessage[] {
  return messages.slice(-L.chatMessages).map((m) => {
    const out: StoredChatMessage = { role: m.role, text: m.text.slice(0, L.chatMessageChars) };
    if (m.answered) out.answered = true;
    if (m.notices?.length) out.notices = m.notices.slice(0, 10).map((n) => n.slice(0, 500));
    const records = (m.records ?? []).filter((r) => !r.internal && !r.ui).map(storedRecord);
    if (records.length) out.records = records.slice(0, 12);
    return out;
  });
}

function sanitizeRecord(v: unknown): StoredSourceRecord | null {
  if (!isObj(v) || typeof v.label !== "string") return null;
  const nullable = (x: unknown) => (typeof x === "string" ? x.slice(0, 300) : null);
  return {
    tool: str(v.tool, "unknown", 40), label: v.label.slice(0, 300), ok: v.ok === true, site: nullable(v.site),
    horizonKind: nullable(v.horizonKind), horizonLabel: nullable(v.horizonLabel), dataRange: nullable(v.dataRange),
    mustSay: Array.isArray(v.mustSay) ? v.mustSay.filter((x): x is string => typeof x === "string").slice(0, 10) : [],
    ...(typeof v.error === "string" ? { error: v.error.slice(0, 300) } : {}),
  };
}

export function sanitizeChat(v: unknown): StoredChatMessage[] {
  if (!Array.isArray(v)) return [];
  const out: StoredChatMessage[] = [];
  for (const m of v.slice(-L.chatMessages)) {
    if (!isObj(m) || (m.role !== "user" && m.role !== "model") || typeof m.text !== "string") continue;
    const msg: StoredChatMessage = { role: m.role, text: m.text.slice(0, L.chatMessageChars) };
    if (m.answered === true) msg.answered = true;
    if (Array.isArray(m.notices)) msg.notices = m.notices.filter((n): n is string => typeof n === "string").slice(0, 10);
    if (Array.isArray(m.records)) {
      const records = m.records.map(sanitizeRecord).filter((r): r is StoredSourceRecord => r !== null);
      if (records.length) msg.records = records;
    }
    out.push(msg);
  }
  return out;
}

// ---------------------------------------------------------------
// Local draft
// ---------------------------------------------------------------

export function sanitizeDraft(v: unknown): ExpeditionDraft {
  if (!isObj(v)) return emptyDraft();
  return {
    version: EXPEDITION_VERSION,
    notes: str(v.notes, "", L.notesChars),
    workspace: sanitizeWorkspace(v.workspace),
    sites: sanitizeSites(v.sites),
    studies: sanitizeStudies(v.studies),
    chat: sanitizeChat(v.chat),
    updatedAt: str(v.updatedAt, new Date().toISOString(), 40),
  };
}

/** True when the draft holds work worth offering to save as an expedition on sign-in. */
export function draftHasContent(d: ExpeditionDraft): boolean {
  if (d.sites.length || d.studies.length || d.chat.length || d.notes.trim()) return true;
  // Playback position and speed alone are not work worth keeping.
  const meaningful = (ws: ExpeditionWorkspace) => JSON.stringify({ ...ws, elapsedHours: 0, speed: DEFAULT_WORKSPACE.speed });
  return meaningful(d.workspace) !== meaningful(DEFAULT_WORKSPACE);
}

/** Folds the pre-expeditions localStorage key (saved sites + panel settings) into a draft. */
export function migrateLegacyFreeplay(legacy: unknown, draft: ExpeditionDraft): ExpeditionDraft {
  if (!isObj(legacy)) return draft;
  const sites = sanitizeSites([...draft.sites, ...(Array.isArray(legacy.savedSites) ? legacy.savedSites : [])]);
  return {
    ...draft,
    sites,
    workspace: {
      ...draft.workspace,
      panelAreaM2: num(legacy.panelAreaM2, draft.workspace.panelAreaM2, 0.01, 10_000),
      panelEfficiency: num(legacy.panelEfficiency, draft.workspace.panelEfficiency, 0.01, 1),
    },
  };
}

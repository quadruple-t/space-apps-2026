/**
 * Builds the server-prompt-template variables from the live Freeplay state so "this site" and "right now"
 * resolve correctly. The values are data, not instructions: free text (saved site names) is sanitised
 * and length-limited before it is sent, and the template fences the block as untrusted.
 */
import { COVERAGE_END_ISO, COVERAGE_START_ISO, MAX_WINDOW_HOURS } from "./constants";
import type { SavedSiteRef, ToolContext } from "./tool-validation";

export type FreeplaySnapshot = {
  view: string;
  site: { name: string; latitudeDeg: number; longitudeDeg: number; radiusKm: number; kind: string; catalogId?: string; catalogPointVerified?: boolean } | null;
  startIso: string;
  durationHours: number;
  elapsedHours: number;
  playing: boolean;
  layers: Record<string, { on: boolean }>;
  panelAreaM2: number;
  panelEfficiency: number;
  /** The user's saved presets; always sent (empty list when none). */
  savedSites?: SavedSiteRef[];
  launchIso?: string;
  trajectoryType?: string;
  payloadKg?: number;
  ispS?: number;
  showArtemisReference?: boolean;
  meteorStream?: string;
  /** Mission comparison slots and graph choice. */
  compareSiteAId?: string | null;
  compareSiteBId?: string | null;
  compareGraph?: string;
};

/** Keeps letters, digits and light punctuation; drops anything that could read as markup or a template tag. */
export function sanitizeLabel(value: string, max = 60): string {
  return value.replace(/[^\p{L}\p{N} .,'()\-_/]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

const currentMs = (s: Pick<FreeplaySnapshot, "startIso" | "elapsedHours">) => Date.parse(s.startIso) + s.elapsedHours * 3_600_000;

/** "Name (id), …" for the prompt; names are sanitised because they are user text. */
function describeSites(sites: SavedSiteRef[] | undefined): string {
  if (!sites?.length) return "none";
  return sites.map((s) => `${sanitizeLabel(s.name) || "Untitled"} (${s.id})`).join(", ");
}

function describeComparison(s: FreeplaySnapshot): string {
  const name = (id: string | null | undefined) => {
    if (!id) return "empty";
    const site = s.savedSites?.find((p) => p.id === id);
    return site ? `${sanitizeLabel(site.name) || "Untitled"} (${id})` : id;
  };
  return `A: ${name(s.compareSiteAId)}, B: ${name(s.compareSiteBId)}`;
}

export function toToolContext(s: FreeplaySnapshot): ToolContext {
  return {
    site: s.site && { name: sanitizeLabel(s.site.name) || "Selected site", latitudeDeg: s.site.latitudeDeg, longitudeDeg: s.site.longitudeDeg, kind: s.site.kind, catalogId: s.site.catalogId, catalogPointVerified: s.site.catalogPointVerified },
    missionStartIso: s.startIso,
    missionDurationHours: Math.min(MAX_WINDOW_HOURS, Math.max(1, s.durationHours)),
    currentTimeMs: currentMs(s),
    savedSites: (s.savedSites ?? []).map((p) => ({ ...p, name: sanitizeLabel(p.name) || "Untitled" })),
    launchIso: s.launchIso,
    trajectoryType: s.trajectoryType === "low-energy" ? "low-energy" : "direct",
    payloadKg: s.payloadKg,
    ispS: s.ispS,
    showArtemisReference: s.showArtemisReference,
    panelAreaM2: s.panelAreaM2,
    panelEfficiency: s.panelEfficiency,
    meteorStream: s.meteorStream,
  };
}

/** Flat, typed variables matching the template's `input.schema`. Optional values are omitted when absent. */
export function buildTemplateVariables(s: FreeplaySnapshot, now: Date = new Date()): Record<string, unknown> {
  const layersOn = Object.entries(s.layers).filter(([, v]) => v.on).map(([k]) => k).join(", ") || "none";
  const site = s.site;
  return {
    hasSite: site !== null,
    ...(site ? {
      siteName: sanitizeLabel(site.name) || "Selected site",
      siteKind: site.kind,
      ...(site.catalogId && site.catalogPointVerified !== false ? { catalogSiteId: site.catalogId } : {}),
      latDeg: Number(site.latitudeDeg.toFixed(4)),
      lonDeg: Number(site.longitudeDeg.toFixed(4)),
      radiusKm: site.radiusKm,
    } : {}),
    screen: s.view,
    missionStartIso: s.startIso,
    missionDurationHours: Math.round(s.durationHours),
    missionElapsedHours: Number(s.elapsedHours.toFixed(2)),
    currentMissionTimeIso: new Date(currentMs(s)).toISOString(),
    playing: s.playing,
    layersOn,
    panelAreaM2: s.panelAreaM2,
    panelEfficiency: s.panelEfficiency,
    savedSites: describeSites(s.savedSites),
    savedSiteCount: s.savedSites?.length ?? 0,
    launchTimeIso: s.launchIso ?? s.startIso,
    trajectoryType: s.trajectoryType === "low-energy" ? "low-energy" : "direct",
    payloadKg: s.payloadKg ?? 500,
    ispS: s.ispS ?? 311,
    showArtemisReference: s.showArtemisReference === true,
    meteorStream: sanitizeLabel(s.meteorStream ?? "Geminids", 48) || "Geminids",
    compareSites: describeComparison(s),
    compareGraph: s.compareGraph ?? "sunlight",
    coverageStartIso: COVERAGE_START_ISO,
    coverageEndIso: COVERAGE_END_ISO,
    wallClockUtcIso: now.toISOString(),
  };
}

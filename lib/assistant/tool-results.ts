/**
 * Shapes raw /api/v1 responses into compact, source-labelled tool results.
 * Every science result states the horizon source used (site LOLA mask, LOLA polar grid cell, or the
 * smooth-sphere fallback) and the data's date range, so the model and the UI cannot blur provenance.
 */
import { ScienceApiError } from "@/integrations/science/api-provider";
import {
  COVERAGE_LABEL, FALLBACK_WORDING, GRID_CELL_WORDING, MAX_TOOL_RESULT_CHARS, NO_COVERAGE_WORDING,
  TOOL_LABELS, UNRECOGNISED_HORIZON_WORDING, failureWording, type ToolName,
} from "./constants";
import type { ToolError } from "./tool-validation";

export type HorizonKind = "site-lola-mask" | "lola-polar-grid" | "smooth-sphere-fallback" | "unrecognised";

export type SourceRecord = {
  id: string;
  tool: ToolName | "unknown";
  label: string;
  ok: boolean;
  site: string | null;
  horizonKind: HorizonKind | null;
  horizonLabel: string | null;
  dataRange: string | null;
  error?: string;
  /** The model sent invalid arguments. Not a data failure: hidden from Sources and retried by the model. */
  internal?: boolean;
  /** Fixed wording that must accompany this result (shown as a notice by the UI). */
  mustSay: string[];
};
export type ToolOutcome = { response: Record<string, unknown>; record: SourceRecord };

type Json = Record<string, unknown>;
const r2 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
const clip = (v: unknown, max: number) => (typeof v === "string" ? (v.length > max ? `${v.slice(0, max - 1)}…` : v) : null);
const asObj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

export function classifyHorizonSource(apiSource: unknown): HorizonKind {
  const s = typeof apiSource === "string" ? apiSource.trim().toLowerCase() : "";
  if (s.startsWith("lola dem grid")) return "lola-polar-grid";
  if (s === "lola dem") return "site-lola-mask";
  if (s.includes("smooth") || s.startsWith("none")) return "smooth-sphere-fallback";
  return "unrecognised";
}

export function horizonInfo(apiSource: unknown) {
  const kind = classifyHorizonSource(apiSource);
  const detail = typeof apiSource === "string" ? apiSource : "unknown";
  const label = {
    "site-lola-mask": "Site-specific LOLA horizon mask",
    "lola-polar-grid": `LOLA polar grid cell (${detail})`,
    "smooth-sphere-fallback": "Smooth-sphere fallback (not terrain-derived)",
    unrecognised: `Unrecognised horizon source (${detail})`,
  }[kind];
  const mustSay = kind === "smooth-sphere-fallback" ? [FALLBACK_WORDING] : kind === "lola-polar-grid" ? [GRID_CELL_WORDING] : kind === "unrecognised" ? [UNRECOGNISED_HORIZON_WORDING] : [];
  return { kind, label, apiSource: detail, upperBound: kind === "smooth-sphere-fallback", mustSay };
}

const RANK: HorizonKind[] = ["smooth-sphere-fallback", "unrecognised", "lola-polar-grid", "site-lola-mask"];
const worst = (kinds: HorizonKind[]) => RANK.find((k) => kinds.includes(k)) ?? null;

function ok(tool: ToolName, id: string, parts: { site: string | null; horizon?: ReturnType<typeof horizonInfo>; dataRange: string | null; data: Json; notes?: string[]; adjustments?: string[]; extraMustSay?: string[] }): ToolOutcome {
  const mustSay = [...(parts.horizon?.mustSay ?? []), ...(parts.extraMustSay ?? [])];
  const response: Json = {
    ok: true, tool, site: parts.site,
    ...(parts.horizon ? { horizon: { kind: parts.horizon.kind, label: parts.horizon.label, upperBound: parts.horizon.upperBound } } : {}),
    dataRange: parts.dataRange,
    ...(parts.horizon ? { ephemeris: COVERAGE_LABEL } : {}),
    data: parts.data,
    ...(parts.notes?.length ? { notes: parts.notes } : {}),
    ...(parts.adjustments?.length ? { adjustments: parts.adjustments } : {}),
    ...(mustSay.length ? { mustSay } : {}),
  };
  const outcome: ToolOutcome = {
    response,
    record: { id, tool, label: TOOL_LABELS[tool], ok: true, site: parts.site, horizonKind: parts.horizon?.kind ?? null, horizonLabel: parts.horizon?.label ?? null, dataRange: parts.dataRange, mustSay },
  };
  return JSON.stringify(response).length > MAX_TOOL_RESULT_CHARS ? failure(tool, id, { code: "result_too_large", message: "The result was too large to return; ask for a narrower window or fewer sites." }, parts.site) : outcome;
}

const INTERNAL_CODES = new Set(["invalid_arguments", "unknown_tool"]);

export function failure(tool: ToolName | "unknown", id: string, error: ToolError, site: string | null = null): ToolOutcome {
  const label = tool === "unknown" ? "Unknown tool" : TOOL_LABELS[tool];
  if (INTERNAL_CODES.has(error.code)) {
    // The model's own mistake (bad or placeholder arguments): let it correct itself, and do not show it as a data failure.
    return {
      response: { ok: false, tool, error: { code: error.code, message: error.message }, instruction: "Your arguments were invalid. Read the error, correct the arguments and call the tool again. Do not mention this to the user unless you cannot fix it." },
      record: { id, tool, label, ok: false, internal: true, site, horizonKind: null, horizonLabel: null, dataRange: null, error: error.message, mustSay: [] },
    };
  }
  const mustSay = error.mustSay ?? failureWording(error.message);
  return {
    response: { ok: false, tool, error: { code: error.code, message: error.message }, mustSay: [mustSay], instruction: "Tell the user plainly that this lookup failed or has no coverage. Do not answer from your own knowledge." },
    record: { id, tool, label, ok: false, site, horizonKind: null, horizonLabel: null, dataRange: null, error: error.message, mustSay: [mustSay] },
  };
}

/** Maps a thrown fetch/API error to a plain tool error. */
export function classifyError(err: unknown): ToolError {
  if (err instanceof ScienceApiError) {
    const m = err.message;
    if (err.status === 404) return { code: "not_found", message: m };
    if (err.status === 422 && /verified|point coordinate/i.test(m)) return { code: "site_unverified", message: m };
    if (err.status === 422) return { code: "out_of_coverage", message: m, mustSay: NO_COVERAGE_WORDING };
    if (err.status >= 400 && err.status < 500) return { code: "invalid_arguments", message: m };
    return { code: "unavailable", message: m };
  }
  if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) return { code: "timeout", message: "The data service took too long to respond." };
  return { code: "unavailable", message: "The data service could not be reached." };
}

const fmtUtc = (iso: string) => iso.replace("T", " ").replace(/:\d{2}(\.\d+)?Z$/, " UTC");
const range = (a: unknown, b: unknown) => (typeof a === "string" && typeof b === "string" ? `${fmtUtc(a)} to ${fmtUtc(b)}` : null);

export function shapeSites(id: string, raw: unknown): ToolOutcome {
  const body = asObj(raw);
  const all = Array.isArray(body.sites) ? (body.sites as Json[]) : [];
  const rows = all.slice(0, 25).map((s) => ({
    id: s.id, name: clip(s.name, 80), family: s.family, siteKind: s.siteKind, country: s.country, outcome: s.outcome,
    latDeg: r2(s.latDeg), lonDeg: r2(s.lonDeg), coordsVerified: s.coordsVerified === true, pointIsApproximate: s.pointIsApproximate === true,
    landingTimeUtc: s.landingTimeUtc ?? null,
  }));
  return ok("list_catalog_sites", id, {
    site: null, dataRange: null,
    data: { count: all.length, shown: rows.length, truncated: all.length > rows.length, sites: rows },
    notes: ["Source: Lunaris360 curated site catalog. Only coordsVerified=true sites accept siteId in the science tools."],
  });
}

export function shapeSiteDetail(id: string, raw: unknown): ToolOutcome {
  const body = asObj(raw), site = asObj(body.site), coords = asObj(site.coordinates), rep = asObj(site.representativePoint), ts = asObj(site.terrainSummary);
  const sources = (Array.isArray(site.sources) ? (site.sources as Json[]) : []).slice(0, 3).map((s) => clip(s.label, 100));
  return ok("get_catalog_site", id, {
    site: clip(site.name, 80) ?? String(site.id ?? ""), dataRange: null,
    data: {
      id: site.id, name: clip(site.name, 80), family: site.family, siteKind: site.siteKind, country: site.country, agency: site.agency,
      mission: clip(site.mission, 120), landingTimeUtc: site.landingTimeUtc ?? null, outcome: site.outcome, blurb: clip(site.blurb, 400),
      point: coords.latDeg !== undefined ? { latDeg: r2(coords.latDeg), lonDeg: r2(coords.lonDeg), verified: site.coordsVerified === true } : null,
      approximateRegionReference: rep.latDeg !== undefined ? { latDeg: r2(rep.latDeg), lonDeg: r2(rep.lonDeg) } : null,
      terrainSummary: Object.keys(ts).length ? { slope100mDeg: r2(ts.slope100mDeg), nearestPsrKm: r2(ts.nearestPsrKm), nearestColdTrapKm: r2(ts.nearestColdTrapKm), insidePsr: ts.insidePsr ?? null } : null,
      siteSpecificLolaMaskAvailable: body.terrain != null,
      sourceLabels: sources,
    },
    notes: [site.coordsVerified === true ? "Coordinates are verified." : "Coordinates are not verified (or this is an approximate region reference): the science tools will refuse this siteId."],
  });
}

export function shapeChapters(id: string, raw: unknown): ToolOutcome {
  const items = Array.isArray(asObj(raw).items) ? (asObj(raw).items as Json[]) : [];
  const chapters = items.slice(0, 10).map((c) => ({
    id: c.id, order: c.order, title: clip(c.title, 100), era: clip(c.era, 80), concept: clip(c.concept, 300),
    featuredSiteIds: Array.isArray(c.featuredSiteIds) ? c.featuredSiteIds.slice(0, 6) : [], headline: clip(asObj(c.debrief).headline, 160),
  }));
  return ok("list_story_chapters", id, { site: null, dataRange: null, data: { chapters }, notes: ["Source: Lunaris360 story chapters. The Guided Mission is a non-interactive introduction."] });
}

export function shapePosition(id: string, site: string, raw: unknown): ToolOutcome {
  const b = asObj(raw), sun = asObj(b.sun), earth = asObj(b.earth);
  const body = (o: Json) => ({ azimuthDeg: r2(o.azimuthDeg), elevationDeg: r2(o.elevationDeg), clearOfLocalHorizon: o.visible === true });
  const when = typeof b.timestamp === "string" ? b.timestamp : null;
  return ok("get_sun_earth_position", id, {
    site, horizon: horizonInfo(b.horizonSource), dataRange: when ? fmtUtc(when) : null,
    data: { timeUtc: when, sun: body(sun), earth: body(earth) },
    notes: ["Sun and Earth are treated as points at disk centre, with no refraction. clearOfLocalHorizon means elevation is above the horizon mask at that azimuth."],
  });
}

const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function shapeHorizon(id: string, site: string, raw: unknown): ToolOutcome {
  const b = asObj(raw), horizon = asObj(b.horizon), info = horizonInfo(b.source);
  const el = Array.isArray(horizon.elevationsDeg) ? (horizon.elevationsDeg as number[]).filter((n) => Number.isFinite(n)) : [];
  if (!el.length) {
    return ok("get_horizon_profile", id, { site, horizon: info, dataRange: "Horizon mask (time-independent)", data: { profileAvailable: false, reason: "No terrain mask for this location; a smooth-sphere horizon (0° everywhere) is used." } });
  }
  const step = Number(horizon.azimuthStepDeg) || 360 / el.length;
  const maxEl = Math.max(...el);
  const sectorMax = SECTORS.map((name, i) => {
    const centre = i * 45;
    let m = -Infinity;
    el.forEach((v, k) => { const az = k * step, d = Math.abs(((az - centre + 540) % 360) - 180); if (d <= 22.5 && v > m) m = v; });
    return { sector: name, maxElevationDeg: r2(m) };
  });
  return ok("get_horizon_profile", id, {
    site, horizon: info, dataRange: "Horizon mask (time-independent)",
    data: { azimuthStepDeg: step, samples: el.length, minElevationDeg: r2(Math.min(...el)), maxElevationDeg: r2(maxEl), meanElevationDeg: r2(el.reduce((a, c) => a + c, 0) / el.length), azimuthOfMaxDeg: Math.round(el.indexOf(maxEl) * step), sectorMaxElevation: sectorMax },
    notes: ["Azimuth is clockwise from lunar north. Elevations are the obstruction angle above the local horizontal."],
  });
}

function metricsCore(m: Json) {
  return {
    sunlightPercent: m.sunlightPercent, sunlightHours: m.sunlightHours, longestDarknessHours: m.longestDarknessHours,
    earthVisibilityPercent: m.earthVisibilityPercent, longestBlackoutHours: m.longestBlackoutHours,
    ...(m.slopeDeg !== undefined ? { slopeDeg: r2(m.slopeDeg) } : {}), ...(m.elevationMeters !== undefined ? { elevationMeters: r2(m.elevationMeters) } : {}),
  };
}

export function shapeMetrics(id: string, site: string, raw: unknown, adjustments: string[]): ToolOutcome {
  const m = asObj(raw), info = horizonInfo(m.horizonSource);
  return ok("get_sunlight_and_earth_visibility", id, {
    site, horizon: info, dataRange: range(m.intervalStart, m.intervalEnd),
    data: { ...metricsCore(m), interval: { start: m.intervalStart, end: m.intervalEnd }, sharesAreUpperBounds: info.upperBound },
    notes: Array.isArray(m.assumptions) ? (m.assumptions as unknown[]).filter((a): a is string => typeof a === "string").slice(0, 4) : [],
    adjustments,
  });
}

type Sample = { timestamp: string; sun: Json; earth: Json };
function runs(samples: Sample[], key: "sun" | "earth") {
  const out: { from: string; to: string; continuesFromBeforeWindow: boolean; continuesAfterWindow: boolean }[] = [];
  let start = -1;
  samples.forEach((s, i) => {
    const up = asObj(s[key]).visible === true;
    if (up && start < 0) start = i;
    if ((!up || i === samples.length - 1) && start >= 0) {
      const last = up ? i : i - 1;
      out.push({ from: samples[start].timestamp, to: samples[last].timestamp, continuesFromBeforeWindow: start === 0, continuesAfterWindow: last === samples.length - 1 });
      start = -1;
    }
  });
  return out.slice(0, 12);
}
function peak(samples: Sample[], key: "sun" | "earth") {
  let best: Sample | null = null;
  for (const s of samples) if (best === null || Number(asObj(s[key]).elevationDeg) > Number(asObj(best[key]).elevationDeg)) best = s;
  return best ? { elevationDeg: r2(asObj(best[key]).elevationDeg), atUtc: best.timestamp } : null;
}

export function shapeRiseSet(id: string, site: string, raw: unknown, adjustments: string[]): ToolOutcome {
  const b = asObj(raw), samples = (Array.isArray(b.samples) ? b.samples : []) as Sample[], info = horizonInfo(b.horizonSource);
  const step = Number(b.stepMinutes) || 0;
  return ok("get_sun_earth_rise_set", id, {
    site, horizon: info, dataRange: range(b.intervalStart, b.intervalEnd),
    data: {
      window: { start: b.intervalStart, end: b.intervalEnd }, stepMinutes: step, sampleCount: samples.length,
      sunClearOfHorizonIntervals: runs(samples, "sun"), earthClearOfHorizonIntervals: runs(samples, "earth"),
      sunPeak: peak(samples, "sun"), earthPeak: peak(samples, "earth"),
    },
    notes: [`Times are sample times at ${step}-minute resolution: the actual rise is up to one step before 'from' and the set up to one step after 'to'. These intervals already account for the horizon mask.`],
    adjustments,
  });
}

export function shapeCompare(id: string, raw: unknown, adjustments: string[]): ToolOutcome {
  const b = asObj(raw), entries = (Array.isArray(b.sites) ? b.sites : []) as Json[];
  const kinds: HorizonKind[] = [], mustSay = new Set<string>(), labels: string[] = [];
  let intervalText: string | null = null;
  const sites = entries.map((e) => {
    const result = asObj(e.result), siteId = String(e.siteId ?? "");
    if (e.status !== 200) {
      const message = clip(asObj(result.error).message, 160) ?? `HTTP ${String(e.status)}`;
      mustSay.add(failureWording(`${siteId}: ${message}`));
      return { siteId, ok: false, error: message };
    }
    const info = horizonInfo(result.horizonSource);
    kinds.push(info.kind); info.mustSay.forEach((s) => mustSay.add(s)); labels.push(`${siteId}: ${info.label}`);
    intervalText ??= range(result.intervalStart, result.intervalEnd);
    return { siteId, ok: true, horizon: { kind: info.kind, label: info.label, upperBound: info.upperBound }, ...metricsCore(result) };
  });
  const out = ok("compare_sites", id, {
    site: entries.map((e) => String(e.siteId)).join(", "), dataRange: intervalText,
    data: { sites }, adjustments, extraMustSay: [...mustSay],
    notes: ["Each site uses its own horizon source; compare shares only with that in mind. Fallback-horizon shares are upper bounds."],
  });
  out.record.horizonKind = worst(kinds);
  out.record.horizonLabel = labels.join("; ") || null;
  out.record.ok = sites.some((s) => s.ok);
  if (!out.record.ok) out.record.error = "No site returned data";
  return out;
}

/**
 * Shapes raw /api/v1 responses into compact, source-labelled tool results.
 * Every science result states the horizon source used (site LOLA mask, LOLA polar grid cell, or the
 * smooth-sphere fallback) and the data's date range, so the model and the UI cannot blur provenance.
 */
import { ScienceApiError } from "@/integrations/science/api-provider";
import { activeCriteria, DEFAULT_WEIGHTS, type RankCriterion } from "@/lib/science/rank";
import {
  APPROXIMATE_POINT_WORDING, COMPOSITION_WORDING, COVERAGE_LABEL, FALLBACK_WORDING, ICE_PROXY_WORDING, LAUNCH_PLAN_WORDING, METEOR_STREAM_WORDING,
  MAX_TOOL_RESULT_CHARS, NO_COVERAGE_WORDING, RANK_ROWS_SHOWN, GRID_CELL_WORDING,
  RANK_ROWS_BUDGET_CHARS, SAVED_SITE_WORDING, SOLAR_POWER_WORDING, TOOL_LABELS, UNRECOGNISED_HORIZON_WORDING, failureWording, type ToolName,
} from "./constants";
import type { CatalogSite } from "@/data/sites";
import type { SavedSiteRef, ToolError } from "./tool-validation";

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
  /** Set for show_in_freeplay: what changed on screen. Not a data lookup, so it is kept out of Sources. */
  ui?: UiChange;
};
export type UiChange = { changes: string[]; link?: { label: string; href: string } };
export type ToolOutcome = { response: Record<string, unknown>; record: SourceRecord };

/** A browser-computed launch plan (lib/assistant/estimators.ts) in a transport-safe shape. */
export type LaunchPlanData = {
  plan: {
    launchIso: string;
    arrivalIso: string;
    transitHours: number;
    arrivalDistanceKm: number;
    apogeeKm: number;
    eccentricity: number;
    alignment: { sunUpAtArrival: boolean; hoursSincePrevSunrise: number | null; hoursUntilNextSunrise: number | null; nearSunrise: boolean; summary: string } | null;
  } | null;
  outOfCoverage: boolean;
  estimate: {
    totalKmS: number; totalLowKmS: number; totalHighKmS: number;
    phases: { id: string; label: string; kmS: number; lowKmS: number; highKmS: number }[];
    propellantKg: number; leoMassKg: number; leoMassRangeKg: { low: number; high: number };
    cost: { lowUsd: number; highUsd: number; classLabel: string; reference: string } | null;
  };
  artemis: { hoursToFlyby: number; flybyAltitudeKm: number } | null;
};

/** A browser-computed flat-panel solar power estimate. */
export type PowerEstimateData = {
  peakW: number;
  meanW: number;
  energyKWh: number;
  litSharePercent: number;
  hours: number;
  horizonSource: string;
  startIso: string;
  endIso: string;
  panelAreaM2: number;
  panelEfficiency: number;
};

export type MeteorExposureData = {
  streams: {
    name: string;
    referenceIso: string;
    subRadiantLatDeg: number;
    subRadiantLonDeg: number;
    incidence: number | null;
    facingHemisphere: boolean | null;
  }[];
};

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
    ...(m.insidePsr !== undefined ? { insidePsr: m.insidePsr === true } : {}),
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

const COMPOSITION_CRITERIA: RankCriterion[] = ["iron", "titanium", "aluminium", "calcium"];
const strings = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);

/** Ranked shortlist: the top rows in full, the rest by count, with every caveat that applies to a shown row. */
export function shapeRank(id: string, raw: unknown, weights: Partial<Record<RankCriterion, number>> | null, adjustments: string[]): ToolOutcome {
  const b = asObj(raw), interval = asObj(b.interval), all = (Array.isArray(b.sites) ? b.sites : []) as Json[];
  const active = activeCriteria(weights ?? DEFAULT_WEIGHTS);
  const rec = asObj(b.recommendation);
  const pickId = typeof rec.siteId === "string" ? rec.siteId : null;
  // The recommended pick is always shown, even when it ranks below the cut.
  const shown = all.slice(0, RANK_ROWS_SHOWN);
  const pickRow = pickId ? all.find((r) => r.siteId === pickId) : undefined;
  if (pickRow && !shown.includes(pickRow)) shown.push(pickRow);
  const kinds: HorizonKind[] = [], mustSay = new Set<string>();
  const rows = shown.map((r) => {
    const info = horizonInfo(r.horizonSource);
    kinds.push(info.kind); info.mustSay.forEach((m) => mustSay.add(m));
    const flags = strings(r.flags, 10);
    if (r.locationQuality === "approximate-region") mustSay.add(APPROXIMATE_POINT_WORDING);
    const opt = (k: string, v: unknown) => (v === null || v === undefined ? {} : { [k]: r2(v) });
    // Oxide values below 2 sigma of their uncertainty are withheld so they cannot be quoted as measurements.
    const noisy = strings(r.oxidesLowConfidence, 4);
    const oxide = (k: string, oxideName: string, v: unknown) => (noisy.includes(oxideName) ? {} : opt(k, v));
    const sharing = strings(r.sharesCompositionPixelWith, 5);
    return {
      rank: r.rank ?? null, siteId: r.siteId, name: clip(r.name, 80), family: r.family, locationQuality: r.locationQuality,
      latDeg: r2(r.latDeg), lonDeg: r2(r.lonDeg), score: r2(r.score), weightCoverage: r2(r.weightCoverage),
      sunlightPercent: r.sunlightPercent, worstWindowSunlightPercent: r.worstWindowSunlightPercent, longestDarknessHours: r.longestDarknessHours,
      earthVisibilityPercent: r.earthVisibilityPercent, ...opt("slope100mDeg", r.slope100mDeg), ...opt("nearestColdTrapKm", r.nearestColdTrapKm),
      ...oxide("feoWtPct", "FeO", r.feoWtPct), ...oxide("tio2WtPct", "TiO2", r.tio2WtPct), ...oxide("al2o3WtPct", "Al2O3", r.al2o3WtPct), ...oxide("caoWtPct", "CaO", r.caoWtPct),
      ...(noisy.length ? { oxidesWithheldAsNoise: noisy } : {}), ...(sharing.length ? { sharesCompositionPixelWith: sharing } : {}),
      ...(r.siteId === pickId ? { isRecommendedPick: true } : {}),
      horizon: info.kind, sharesAreUpperBounds: info.upperBound, flags,
    };
  });
  // Keep the result under the size limit: drop trailing rows, never the pick, and keep at least three.
  while (rows.length > 3 && JSON.stringify(rows).length > RANK_ROWS_BUDGET_CHARS) {
    const i = rows.map((r) => r.siteId).lastIndexOf(rows.filter((r) => !("isRecommendedPick" in r)).at(-1)!.siteId);
    rows.splice(i, 1);
  }
  if (active.some((c) => COMPOSITION_CRITERIA.includes(c)) || rows.some((r) => "feoWtPct" in r)) mustSay.add(COMPOSITION_WORDING);
  if (active.includes("ice")) mustSay.add(ICE_PROXY_WORDING);
  const windows = Number(interval.windows) || 1;
  const start = typeof interval.start === "string" ? interval.start : null;
  const out = ok("rank_sites", id, {
    site: `${all.length} catalog sites`, dataRange: start ? `${fmtUtc(start)}, ${windows} window${windows > 1 ? "s" : ""} of ${String(interval.durationHours)} h` : null,
    data: {
      criteria: asObj(asObj(b.method).criteria), weights: b.weights, interval: { start, durationHours: interval.durationHours, windows, windowStarts: interval.windowStarts },
      recommendedPick: pickId ? {
        siteId: pickId, rank: rec.rank, reason: clip(rec.reason, 220), allBlocked: rec.allBlocked === true,
        passedOver: rec.passedOver ?? null,
      } : null,
      ranked: all.length, shown: rows.length, sites: rows,
      skipped: (Array.isArray(b.skipped) ? (b.skipped as Json[]) : []).slice(0, 12).map((s) => s.siteId),
    },
    notes: [
      clip(asObj(b.method).normalisation, 300) ?? "Scores are min-max scaled across the candidates.",
      "Flags: slope-over-hls-10deg = steeper than the NASA HLS 10° landing limit; heritage-protection-zone = NASA 2011 heritage site; impact-site = crash site; missing:<criterion> = no data, scored as worst for that criterion.",
      "worstWindowSunlightPercent and longestDarknessHours (worst window) show how consistent the lighting is across windows.",
      "recommendedPick is the best-ranked site without a heritage-zone, impact-site or over-10-degree-slope flag: name it as your pick, and if passedOver is set, say that rank 1 was passed over and why. oxidesWithheldAsNoise lists oxide values below 2 sigma of their uncertainty: their numbers are withheld, so say they are too uncertain to use. sharesCompositionPixelWith lists sites inside the same 60 km pixel: say they share one composition value.",
      ...strings(b.assumptions, 6),
    ].filter((n): n is string => typeof n === "string"),
    adjustments, extraMustSay: [...mustSay],
  });
  out.record.horizonKind = worst(kinds);
  out.record.horizonLabel = kinds.length ? `${kinds.filter((k) => k === "site-lola-mask").length} of ${kinds.length} shown sites use a site LOLA mask` : null;
  return out;
}

export function shapeComposition(id: string, site: string, raw: unknown): ToolOutcome {
  const b = asObj(raw), pixel = asObj(b.pixel), source = asObj(b.source);
  const table = (o: unknown) => Object.fromEntries(Object.entries(asObj(o)).map(([k, v]) => [k, r2(v)]));
  const approx = b.locationQuality === "approximate-region";
  const out = ok("get_surface_composition", id, {
    site, dataRange: "Lunar Prospector GRS (1998-1999), regional average",
    data: {
      locationQuality: b.locationQuality, oxidesWtPct: table(b.oxidesWtPct), sigmaWtPct: table(b.sigmaWtPct),
      pixel: { centerLatDeg: r2(pixel.centerLatDeg), centerLonDeg: r2(pixel.centerLonDeg), sizeDeg: pixel.sizeDeg, distanceFromPointKm: r2(pixel.distanceKm) },
      resolutionKm: b.resolutionKm, source: clip(source.citation, 160),
    },
    notes: strings(b.assumptions, 5),
    extraMustSay: [COMPOSITION_WORDING, ...(approx ? [APPROXIMATE_POINT_WORDING] : [])],
  });
  out.record.horizonLabel = "Lunar Prospector GRS 2° oxide map";
  return out;
}

export function shapeSavedSites(id: string, sites: SavedSiteRef[]): ToolOutcome {
  return ok("list_saved_sites", id, {
    site: null, dataRange: null,
    data: {
      count: sites.length,
      sites: sites.slice(0, 30).map((s) => ({
        id: s.id, name: clip(s.name, 60), latDeg: r2(s.latitudeDeg), lonDeg: r2(s.longitudeDeg), radiusKm: r2(s.radiusKm),
      })),
    },
    notes: ["Use a saved preset id in compare_sites siteIds or in show_in_freeplay savedSiteId, compareSiteA and compareSiteB."],
    extraMustSay: [SAVED_SITE_WORDING],
  });
}

export function shapeLaunchPlan(id: string, site: string, data: LaunchPlanData): ToolOutcome {
  const plan = data.plan;
  const estimate = data.estimate;
  return ok("get_launch_plan", id, {
    site, dataRange: plan ? `${fmtUtc(plan.launchIso)} to ${fmtUtc(plan.arrivalIso)}` : null,
    data: {
      outOfCoverage: data.outOfCoverage,
      plan: plan ? {
        launchUtc: plan.launchIso, arrivalUtc: plan.arrivalIso, transitHours: r2(plan.transitHours),
        arrivalDistanceKm: r2(plan.arrivalDistanceKm), apogeeKm: r2(plan.apogeeKm), eccentricity: r2(plan.eccentricity),
        arrivalLighting: plan.alignment ? {
          sunUpAtArrival: plan.alignment.sunUpAtArrival, nearSunrise: plan.alignment.nearSunrise,
          hoursSincePrevSunrise: r2(plan.alignment.hoursSincePrevSunrise), hoursUntilNextSunrise: r2(plan.alignment.hoursUntilNextSunrise),
          summary: plan.alignment.summary,
        } : null,
      } : null,
      deltaV: {
        totalKmS: r2(estimate.totalKmS), totalLowKmS: r2(estimate.totalLowKmS), totalHighKmS: r2(estimate.totalHighKmS),
        phases: estimate.phases.map((p) => ({ id: p.id, label: p.label, kmS: r2(p.kmS), lowKmS: r2(p.lowKmS), highKmS: r2(p.highKmS) })),
      },
      mass: {
        propellantKg: Math.round(estimate.propellantKg), leoMassKg: Math.round(estimate.leoMassKg),
        leoMassRangeKg: { low: Math.round(estimate.leoMassRangeKg.low), high: Math.round(estimate.leoMassRangeKg.high) },
      },
      launchCost: estimate.cost ? {
        lowUsd: Math.round(estimate.cost.lowUsd), highUsd: Math.round(estimate.cost.highUsd),
        launchClass: estimate.cost.classLabel, reference: estimate.cost.reference,
      } : null,
      artemisReference: data.artemis ? { hoursToFlyby: r2(data.artemis.hoursToFlyby), flybyAltitudeKm: r2(data.artemis.flybyAltitudeKm) } : null,
    },
    notes: [
      "Delta-v is an impulsive patched-conic budget and mass is the rocket equation with one Isp for all phases. The low-energy path is illustrative, not a weak-stability-boundary design.",
      "Launch cost is a published-figure range: the low end is a pro-rata share of one launch and the high end a whole dedicated launch at list price; it excludes the spacecraft, operations and insurance.",
      "Arrival lighting comes from the site's own horizon mask over the arrival time; 'near sunrise' means within 3 days of a local sunrise.",
      ...(estimate.cost ? [] : ["The LEO mass is beyond the largest launcher in the stored table, so no cost range is given."]),
    ],
    extraMustSay: [LAUNCH_PLAN_WORDING],
  });
}

export function shapeSolarPower(id: string, site: string, data: PowerEstimateData, adjustments: string[]): ToolOutcome {
  const info = horizonInfo(data.horizonSource);
  return ok("get_solar_power", id, {
    site, horizon: info, dataRange: range(data.startIso, data.endIso),
    data: {
      panelAreaM2: r2(data.panelAreaM2), panelEfficiency: r2(data.panelEfficiency),
      peakW: r2(data.peakW), meanW: r2(data.meanW), energyKWh: r2(data.energyKWh),
      sunlitSharePercent: r2(data.litSharePercent), sampledHours: data.hours, sharesAreUpperBounds: info.upperBound,
    },
    notes: ["A flat panel: P = area × efficiency × 1361 W/m² / (Sun distance in AU)² × sin(Sun elevation), and zero when the terrain horizon blocks the Sun. The app's graphs and Mission comparison use the same model."],
    adjustments, extraMustSay: [SOLAR_POWER_WORDING],
  });
}

export function shapeMeteorStreams(id: string, requested: string | null, site: string | null, data: MeteorExposureData): ToolOutcome {
  return ok("get_meteor_stream_exposure", id, {
    site, dataRange: "2026 reference snapshots",
    data: {
      requestedStream: requested,
      streams: data.streams.map((s) => ({
        name: s.name, referenceUtc: s.referenceIso,
        subRadiantLatDeg: r2(s.subRadiantLatDeg), subRadiantLonDeg: r2(s.subRadiantLonDeg),
        incidence: s.incidence, facingHemisphere: s.facingHemisphere,
      })),
    },
    notes: [
      "incidence is the parallel-stream incidence on a smooth sphere: 1 means the stream comes straight down on that point, 0 means it grazes the horizon or the point faces away. The orange globe layer shows the whole facing hemisphere.",
      "The reference snapshot is a published 2026 epoch, independent of the simulation clock. The layer is a geometry aid, not a map of storms or measured impact rates.",
    ],
    extraMustSay: [METEOR_STREAM_WORDING],
  });
}

/** Reads the point out of a /catalog/sites/{id} response. Null when the document has no usable coordinates. */export function catalogFromDetail(raw: unknown, requestedId: string): CatalogSite | null {
  const body = asObj(raw), site = asObj(body.site);
  const point = asObj(site.coordinates).latDeg !== undefined ? asObj(site.coordinates) : asObj(site.representativePoint);
  if (typeof point.latDeg !== "number" || typeof point.lonDeg !== "number" || typeof site.name !== "string") return null;
  return {
    id: typeof site.id === "string" ? site.id : requestedId,
    name: site.name,
    latDeg: point.latDeg,
    lonDeg: point.lonDeg,
    family: typeof site.family === "string" ? site.family : undefined,
    pointIsApproximate: site.pointIsApproximate === true,
    coordsVerified: site.coordsVerified === true,
  };
}

/** Result of a Open Exploration view change. Carries no science data and no horizon claim. */
export function uiOutcome(id: string, ui: UiChange, tool: "show_in_freeplay" | "edit_surface_setup" = "show_in_freeplay"): ToolOutcome {
  const response: Json = {
    ok: true, tool, applied: ui.changes,
    ...(ui.link ? { pageLink: `The user can open "${ui.link.label}" from a button under your reply.` } : {}),
    notes: [tool === "edit_surface_setup"
      ? "The surface setup was changed. Lines starting with Could not were refused by the planner's placement rules (walls, slope, overlap): tell the user which and why. This result has no science data, so do not quote figures from it; use get_solar_power or the setup the user sends for numbers."
      : "The on-screen view was changed. Say briefly what is now showing; this result has no science data, so do not quote figures from it."],
  };
  return { response, record: { id, tool, label: TOOL_LABELS[tool], ok: true, site: null, horizonKind: null, horizonLabel: null, dataRange: null, mustSay: [], ui } };
}

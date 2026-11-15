/**
 * Validation for model-supplied tool calls. Model output is untrusted: tool names are allowlisted,
 * unknown keys are rejected, ids are pattern-checked, ranges are clamped (and the clamp is reported)
 * and dates outside stored coverage are refused rather than silently moved.
 */
import { SITE_FAMILIES } from "@/lib/model/types";
import { MAX_WEIGHT, RANK_CRITERIA, type RankCriterion } from "@/lib/science/rank";
import {
  COVERAGE_END_ISO, COVERAGE_START_ISO, DEFAULT_STEP_MINUTES, MAX_RANK_SITE_IDS, MAX_RANK_WINDOWS, MAX_WINDOW_HOURS, MIN_WINDOW_HOURS,
  NO_COVERAGE_WORDING, RANK_WINDOW_SPACING_HOURS, UI_GRAPH_TABS, UI_LAYERS, UI_PAGES, UI_SCREENS, UI_SPEEDS, isToolName, type ToolName,
} from "./constants";

/** The slice of Freeplay state the tools need to resolve "this site" and "now". */
export type ToolContext = {
  site: { name: string; latitudeDeg: number; longitudeDeg: number; kind: string; catalogId?: string; catalogPointVerified?: boolean } | null;
  missionStartIso: string;
  missionDurationHours: number;
  /** Current Freeplay mission time (not the wall clock). */
  currentTimeMs: number;
};

export type Location =
  | { kind: "catalog"; siteId: string; label: string }
  | { kind: "point"; latDeg: number; lonDeg: number; label: string };

/** A validated request to change the Freeplay view. Every field is optional; at least one is set. */
export type UiPlan = {
  screen?: (typeof UI_SCREENS)[number];
  page?: (typeof UI_PAGES)[number];
  siteId?: string;
  point?: { latDeg: number; lonDeg: number };
  timeIso?: string;
  playing?: boolean;
  speed?: (typeof UI_SPEEDS)[number];
  layersOn?: (typeof UI_LAYERS)[number][];
  layersOff?: (typeof UI_LAYERS)[number][];
  showCatalog?: boolean;
  graphTab?: (typeof UI_GRAPH_TABS)[number];
};

export type ToolRequest =
  | { tool: "list_catalog_sites"; query?: string; family?: string }
  | { tool: "get_catalog_site"; siteId: string }
  | { tool: "list_story_chapters" }
  | { tool: "get_sun_earth_position"; location: Location; timeIso: string }
  | { tool: "get_horizon_profile"; location: Location }
  | { tool: "get_sunlight_and_earth_visibility"; location: Location; startIso: string; durationHours: number; adjustments: string[] }
  | { tool: "get_sun_earth_rise_set"; location: Location; startIso: string; stepMinutes: number; adjustments: string[] }
  | { tool: "compare_sites"; siteIds: string[]; startIso: string; durationHours: number; adjustments: string[] }
  | { tool: "rank_sites"; startIso: string; durationHours: number; windows: number; family?: string; siteIds?: string[]; weights: Partial<Record<RankCriterion, number>> | null; adjustments: string[] }
  | { tool: "get_surface_composition"; location: Location }
  | { tool: "show_in_freeplay"; plan: UiPlan };

export type ToolErrorCode =
  | "unknown_tool" | "invalid_arguments" | "no_site_selected" | "out_of_coverage" | "site_unverified"
  | "not_found" | "unavailable" | "timeout" | "result_too_large";
export type ToolError = { code: ToolErrorCode; message: string; mustSay?: string };
export type Validation = { ok: true; request: ToolRequest } | { ok: false; error: ToolError };

const ID_RE = /^[a-zA-Z0-9_-]{1,120}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const HOUR_MS = 3_600_000;
const COVERAGE_START_MS = Date.parse(COVERAGE_START_ISO);
const COVERAGE_END_MS = Date.parse(COVERAGE_END_ISO);

const bad = (message: string): Validation => ({ ok: false, error: { code: "invalid_arguments", message } });

const LOCATION_KEYS = ["useCurrentSite", "siteId", "latDeg", "lonDeg"];
const ALLOWED_KEYS: Record<ToolName, string[]> = {
  list_catalog_sites: ["query", "family"],
  get_catalog_site: ["siteId"],
  list_story_chapters: [],
  get_sun_earth_position: [...LOCATION_KEYS, "time"],
  get_horizon_profile: [...LOCATION_KEYS],
  get_sunlight_and_earth_visibility: [...LOCATION_KEYS, "start", "durationHours"],
  get_sun_earth_rise_set: [...LOCATION_KEYS, "start", "stepMinutes"],
  compare_sites: ["siteIds", "start", "durationHours"],
  rank_sites: ["start", "durationHours", "windows", "family", "siteIds", "weights"],
  get_surface_composition: [...LOCATION_KEYS],
  show_in_freeplay: ["screen", "page", "siteId", "latDeg", "lonDeg", "time", "playing", "speed", "layersOn", "layersOff", "showCatalog", "graphTab"],
};

/** Strict ISO 8601 parse. A timestamp without an offset is read as UTC. */
export function parseIsoUtc(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_RE.test(value.trim())) return null;
  let v = value.trim().replace(" ", "T");
  if (!v.includes("T")) v += "T00:00:00Z";
  else if (!/(Z|[+-]\d{2}:?\d{2})$/.test(v)) v += "Z";
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

const coverageError = (what: string): Validation => ({
  ok: false,
  error: { code: "out_of_coverage", message: `${what} is outside stored coverage (${COVERAGE_START_ISO.slice(0, 10)} to ${COVERAGE_END_ISO.slice(0, 10)}).`, mustSay: NO_COVERAGE_WORDING },
});

/** The same rule Freeplay uses to pick siteId vs lat/lon (see lib/drive-link.ts). */
function currentSiteLocation(ctx: ToolContext): Location | Validation {
  const s = ctx.site;
  if (!s) return { ok: false, error: { code: "no_site_selected", message: "No site is selected in Freeplay. Ask the user to click the Moon or pick a preset, or name a catalog site." } };
  if (s.catalogId && s.catalogPointVerified !== false) return { kind: "catalog", siteId: s.catalogId, label: `${s.name} (catalog site ${s.catalogId})` };
  return { kind: "point", latDeg: s.latitudeDeg, lonDeg: s.longitudeDeg, label: `${s.name} (${s.latitudeDeg.toFixed(3)}°, ${s.longitudeDeg.toFixed(3)}°E)` };
}

function parseLocation(args: Record<string, unknown>, ctx: ToolContext): Location | Validation {
  const wantsCurrent = args.useCurrentSite === true;
  if (args.useCurrentSite !== undefined && typeof args.useCurrentSite !== "boolean") return bad("useCurrentSite must be a boolean");
  const hasId = args.siteId !== undefined && args.siteId !== null;
  const hasLat = args.latDeg !== undefined && args.latDeg !== null;
  const hasLon = args.lonDeg !== undefined && args.lonDeg !== null;
  const modes = Number(wantsCurrent) + Number(hasId) + Number(hasLat || hasLon);
  if (modes !== 1) {
    const given = LOCATION_KEYS.filter((k) => args[k] !== undefined && args[k] !== null);
    return bad(`Give exactly one location: useCurrentSite=true, or siteId, or both latDeg and lonDeg, and leave the other location arguments out entirely (no empty strings or 0 placeholders). You provided: ${given.join(", ") || "no location"}.`);
  }
  if (wantsCurrent) return currentSiteLocation(ctx);
  if (hasId) {
    if (typeof args.siteId !== "string" || !ID_RE.test(args.siteId)) return bad("siteId must be a catalog site id (letters, digits, - and _ only)");
    return { kind: "catalog", siteId: args.siteId, label: `catalog site ${args.siteId}` };
  }
  const { latDeg, lonDeg } = args;
  if (typeof latDeg !== "number" || typeof lonDeg !== "number" || !Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return bad("latDeg and lonDeg must both be finite numbers");
  if (latDeg < -90 || latDeg > 90) return bad("latDeg must be between -90 and 90");
  if (lonDeg < -180 || lonDeg > 360) return bad("lonDeg must be between -180 and 360 (east-positive)");
  const lat = Number(latDeg.toFixed(4)), lon = Number(lonDeg.toFixed(4));
  return { kind: "point", latDeg: lat, lonDeg: lon, label: `point ${lat.toFixed(3)}°, ${lon.toFixed(3)}°E` };
}

/**
 * Models often fill optional parameters with placeholders (null, "", false, 0). Those mean "not given", so they
 * are dropped before validating. (0, 0) coordinates are dropped only when another location mode is also present.
 */
function cleanArgs(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined || v === "") continue;
    if (k === "useCurrentSite" && v === false) continue;
    if ((k === "durationHours" || k === "stepMinutes" || k === "windows") && v === 0) continue;
    if ((k === "siteIds" || k === "weights") && typeof v === "object" && Object.keys(v as object).length === 0) continue;
    out[k] = v;
  }
  if ((out.useCurrentSite === true || out.siteId !== undefined) && out.latDeg === 0 && out.lonDeg === 0) {
    delete out.latDeg;
    delete out.lonDeg;
  }
  return out;
}

const isValidation = (v: unknown): v is Validation => typeof v === "object" && v !== null && "ok" in v;

/** Optional time argument: defaults to `fallbackMs`. Dates are never clamped, only refused outside coverage. */
function parseTime(raw: unknown, name: string, fallbackMs: number): number | Validation {
  if (raw === undefined || raw === null) return fallbackMs;
  const ms = parseIsoUtc(raw);
  if (ms === null) return bad(`${name} must be an ISO 8601 timestamp such as 2027-03-01T12:00:00Z`);
  return ms;
}

/** Clamp the window to 1–720 h and to the end of stored coverage; every change is reported. */
function fitWindow(startMs: number, rawHours: unknown, ctx: ToolContext): { hours: number; adjustments: string[] } | Validation {
  const adjustments: string[] = [];
  let hours = ctx.missionDurationHours;
  if (rawHours !== undefined && rawHours !== null) {
    if (typeof rawHours !== "number" || !Number.isFinite(rawHours)) return bad("durationHours must be a finite number");
    hours = rawHours;
  }
  const requested = hours;
  hours = Math.min(MAX_WINDOW_HOURS, Math.max(MIN_WINDOW_HOURS, hours));
  if (hours !== requested) adjustments.push(`durationHours ${requested} was clamped to ${hours} (allowed ${MIN_WINDOW_HOURS}–${MAX_WINDOW_HOURS}).`);
  if (startMs < COVERAGE_START_MS || startMs > COVERAGE_END_MS - MIN_WINDOW_HOURS * HOUR_MS) return coverageError(`Start ${new Date(startMs).toISOString()}`);
  const room = (COVERAGE_END_MS - startMs) / HOUR_MS;
  if (hours > room) {
    adjustments.push(`The window was shortened from ${hours} h to ${Math.floor(room)} h to end at the last stored data (${COVERAGE_END_ISO}).`);
    hours = Math.floor(room);
  }
  return { hours, adjustments };
}

function enumArg<T extends string | number>(raw: unknown, allowed: readonly T[], name: string): T | undefined | Validation {
  if (raw === undefined) return undefined;
  return (allowed as readonly unknown[]).includes(raw) ? (raw as T) : bad(`${name} must be one of: ${allowed.join(", ")}`);
}

function layerList(raw: unknown, name: string): (typeof UI_LAYERS)[number][] | undefined | Validation {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > UI_LAYERS.length) return bad(`${name} must be a list of layer names from: ${UI_LAYERS.join(", ")}`);
  const out: (typeof UI_LAYERS)[number][] = [];
  for (const item of raw) {
    if (!(UI_LAYERS as readonly unknown[]).includes(item)) return bad(`${name} entries must be from: ${UI_LAYERS.join(", ")}`);
    if (!out.includes(item as never)) out.push(item as never);
  }
  return out;
}

/** rank_sites weights: known criteria only, numbers clamped to 0–MAX_WEIGHT (reported), at least one above 0. */
function rankWeights(raw: unknown, adjustments: string[]): Partial<Record<RankCriterion, number>> | null | Validation {
  if (raw === undefined) return null;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return bad(`weights must be an object with numeric fields from: ${RANK_CRITERIA.join(", ")}`);
  const out: Partial<Record<RankCriterion, number>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    if (!(RANK_CRITERIA as readonly string[]).includes(key)) return bad(`Unknown weight "${key}". Allowed: ${RANK_CRITERIA.join(", ")}`);
    if (typeof value !== "number" || !Number.isFinite(value)) return bad(`weight for ${key} must be a number`);
    const w = Math.min(MAX_WEIGHT, Math.max(0, value));
    if (w !== value) adjustments.push(`Weight ${key} ${value} was clamped to ${w} (allowed 0–${MAX_WEIGHT}).`);
    out[key as RankCriterion] = Number(w.toFixed(2));
  }
  if (!Object.values(out).some((w) => (w ?? 0) > 0)) return bad("weights needs at least one criterion above 0, or leave weights out for the default");
  return out;
}

function validateRank(args: Record<string, unknown>, ctx: ToolContext): Validation {
  const adjustments: string[] = [];
  const { family } = args;
  if (family !== undefined && !(typeof family === "string" && (SITE_FAMILIES as readonly string[]).includes(family))) return bad(`family must be one of: ${SITE_FAMILIES.join(", ")}`);
  let siteIds: string[] | undefined;
  if (args.siteIds !== undefined) {
    const raw = args.siteIds;
    if (!Array.isArray(raw) || raw.length > MAX_RANK_SITE_IDS || raw.some((x) => typeof x !== "string" || !ID_RE.test(x))) return bad(`siteIds must list up to ${MAX_RANK_SITE_IDS} catalog site ids`);
    siteIds = [...new Set(raw as string[])];
  }
  if (family !== undefined && siteIds) return bad("Give family or siteIds, not both");
  const weights = rankWeights(args.weights, adjustments);
  if (isValidation(weights)) return weights;
  const start = parseTime(args.start, "start", Date.parse(ctx.missionStartIso));
  if (typeof start !== "number") return start;
  const win = fitWindow(start, args.durationHours ?? MAX_WINDOW_HOURS, ctx);
  if (isValidation(win)) return win;
  adjustments.push(...win.adjustments);
  let windows = 1;
  if (args.windows !== undefined) {
    if (typeof args.windows !== "number" || !Number.isFinite(args.windows)) return bad("windows must be a number");
    windows = Math.min(MAX_RANK_WINDOWS, Math.max(1, Math.round(args.windows)));
    if (windows !== args.windows) adjustments.push(`windows ${args.windows} was adjusted to ${windows} (integer 1–${MAX_RANK_WINDOWS}).`);
  }
  const requested = windows;
  while (windows > 1 && start + ((windows - 1) * RANK_WINDOW_SPACING_HOURS + win.hours) * HOUR_MS > COVERAGE_END_MS) windows--;
  if (windows !== requested) adjustments.push(`Only ${windows} of ${requested} seasonal windows fit before the end of stored data (${COVERAGE_END_ISO}).`);
  return {
    ok: true,
    request: {
      tool: "rank_sites", startIso: new Date(start).toISOString(), durationHours: win.hours, windows,
      ...(typeof family === "string" ? { family } : {}), ...(siteIds ? { siteIds } : {}), weights, adjustments,
    },
  };
}

/** show_in_freeplay: only whitelisted Freeplay controls, with enums and bounds checked here, never trusting the model. */
function validateUiPlan(args: Record<string, unknown>): Validation {
  const plan: UiPlan = {};
  for (const [key, list] of [["screen", UI_SCREENS], ["page", UI_PAGES], ["graphTab", UI_GRAPH_TABS], ["speed", UI_SPEEDS]] as const) {
    const v = enumArg(args[key], list as readonly (string | number)[], key);
    if (isValidation(v)) return v;
    if (v !== undefined) (plan as Record<string, unknown>)[key] = v;
  }
  for (const key of ["playing", "showCatalog"] as const) {
    if (args[key] === undefined) continue;
    if (typeof args[key] !== "boolean") return bad(`${key} must be a boolean`);
    plan[key] = args[key] as boolean;
  }
  for (const [key, target] of [["layersOn", "layersOn"], ["layersOff", "layersOff"]] as const) {
    const v = layerList(args[key], key);
    if (isValidation(v)) return v;
    if (v?.length) plan[target] = v;
  }
  if (plan.layersOn?.some((l) => plan.layersOff?.includes(l))) return bad("A layer cannot be in both layersOn and layersOff");

  const hasLat = args.latDeg !== undefined, hasLon = args.lonDeg !== undefined;
  if (args.siteId !== undefined && (hasLat || hasLon)) return bad("Give either siteId or both latDeg and lonDeg, not both");
  if (args.siteId !== undefined) {
    if (typeof args.siteId !== "string" || !ID_RE.test(args.siteId)) return bad("siteId must be a catalog site id (letters, digits, - and _ only)");
    plan.siteId = args.siteId;
  } else if (hasLat || hasLon) {
    const { latDeg, lonDeg } = args;
    if (typeof latDeg !== "number" || typeof lonDeg !== "number" || !Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return bad("latDeg and lonDeg must both be finite numbers");
    if (latDeg < -90 || latDeg > 90) return bad("latDeg must be between -90 and 90");
    if (lonDeg < -180 || lonDeg > 360) return bad("lonDeg must be between -180 and 360 (east-positive)");
    plan.point = { latDeg: Number(latDeg.toFixed(4)), lonDeg: Number(lonDeg.toFixed(4)) };
  }
  if (args.time !== undefined) {
    const t = parseIsoUtc(args.time);
    if (t === null) return bad("time must be an ISO 8601 timestamp such as 2027-03-01T12:00:00Z");
    if (t < COVERAGE_START_MS || t > COVERAGE_END_MS) return coverageError(`Time ${new Date(t).toISOString()}`);
    plan.timeIso = new Date(t).toISOString();
  }
  if (Object.keys(plan).length === 0) return bad("Give at least one thing to change: screen, page, siteId or latDeg+lonDeg, time, playing, speed, layersOn, layersOff, showCatalog or graphTab");
  return { ok: true, request: { tool: "show_in_freeplay", plan } };
}

export function validateToolCall(name: unknown, rawArgs: unknown, ctx: ToolContext): Validation {
  if (!isToolName(name)) return { ok: false, error: { code: "unknown_tool", message: "That tool does not exist." } };
  if (rawArgs !== undefined && rawArgs !== null && (typeof rawArgs !== "object" || Array.isArray(rawArgs))) return bad("Arguments must be an object");
  const args = cleanArgs((rawArgs ?? {}) as Record<string, unknown>);
  const extra = Object.keys(args).filter((k) => !ALLOWED_KEYS[name].includes(k));
  if (extra.length) return bad(`Unknown argument(s): ${extra.slice(0, 5).join(", ")}`);

  switch (name) {
    case "list_catalog_sites": {
      const { query, family } = args;
      if (query !== undefined && query !== null && (typeof query !== "string" || query.length > 60)) return bad("query must be a string of at most 60 characters");
      if (family !== undefined && family !== null && !(typeof family === "string" && (SITE_FAMILIES as readonly string[]).includes(family))) return bad(`family must be one of: ${SITE_FAMILIES.join(", ")}`);
      const q = typeof query === "string" ? query.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
      return { ok: true, request: { tool: name, ...(q ? { query: q } : {}), ...(typeof family === "string" ? { family } : {}) } };
    }
    case "get_catalog_site": {
      if (typeof args.siteId !== "string" || !ID_RE.test(args.siteId)) return bad("siteId must be a catalog site id (letters, digits, - and _ only)");
      return { ok: true, request: { tool: name, siteId: args.siteId } };
    }
    case "list_story_chapters":
      return { ok: true, request: { tool: name } };
    case "show_in_freeplay":
      return validateUiPlan(args);
    case "get_horizon_profile": {
      const location = parseLocation(args, ctx);
      return isValidation(location) ? location : { ok: true, request: { tool: name, location } };
    }
    case "get_sun_earth_position": {
      const location = parseLocation(args, ctx);
      if (isValidation(location)) return location;
      const t = parseTime(args.time, "time", ctx.currentTimeMs);
      if (typeof t !== "number") return t;
      if (t < COVERAGE_START_MS || t > COVERAGE_END_MS) return coverageError(`Time ${new Date(t).toISOString()}`);
      return { ok: true, request: { tool: name, location, timeIso: new Date(t).toISOString() } };
    }
    case "get_sunlight_and_earth_visibility": {
      const location = parseLocation(args, ctx);
      if (isValidation(location)) return location;
      const start = parseTime(args.start, "start", Date.parse(ctx.missionStartIso));
      if (typeof start !== "number") return start;
      const win = fitWindow(start, args.durationHours, ctx);
      if (isValidation(win)) return win;
      return { ok: true, request: { tool: name, location, startIso: new Date(start).toISOString(), durationHours: win.hours, adjustments: win.adjustments } };
    }
    case "get_sun_earth_rise_set": {
      const location = parseLocation(args, ctx);
      if (isValidation(location)) return location;
      const start = parseTime(args.start, "start", ctx.currentTimeMs);
      if (typeof start !== "number") return start;
      if (start < COVERAGE_START_MS || start >= COVERAGE_END_MS) return coverageError(`Start ${new Date(start).toISOString()}`);
      const adjustments: string[] = [];
      let step = DEFAULT_STEP_MINUTES;
      if (args.stepMinutes !== undefined && args.stepMinutes !== null) {
        if (typeof args.stepMinutes !== "number" || !Number.isFinite(args.stepMinutes)) return bad("stepMinutes must be a number");
        step = Math.min(60, Math.max(1, Math.round(args.stepMinutes)));
        if (step !== args.stepMinutes) adjustments.push(`stepMinutes ${args.stepMinutes} was adjusted to ${step} (integer 1–60).`);
      }
      return { ok: true, request: { tool: name, location, startIso: new Date(start).toISOString(), stepMinutes: step, adjustments } };
    }
    case "rank_sites":
      return validateRank(args, ctx);
    case "get_surface_composition": {
      const location = parseLocation(args, ctx);
      return isValidation(location) ? location : { ok: true, request: { tool: name, location } };
    }
    case "compare_sites": {
      const raw = args.siteIds;
      if (!Array.isArray(raw) || raw.length < 2 || raw.length > 3) return bad("siteIds must list two or three catalog site ids");
      const ids: string[] = [];
      for (const item of raw) {
        if (item === "current") {
          const loc = currentSiteLocation(ctx);
          if (isValidation(loc)) return loc;
          if (loc.kind !== "catalog") return bad("The current Freeplay site is not a catalog site, so it cannot be compared by id. Use get_sunlight_and_earth_visibility with useCurrentSite for it.");
          ids.push(loc.siteId);
        } else if (typeof item === "string" && ID_RE.test(item)) ids.push(item);
        else return bad("Each siteIds entry must be a catalog site id (letters, digits, - and _ only)");
      }
      if (new Set(ids).size !== ids.length) return bad("siteIds must be distinct");
      const start = parseTime(args.start, "start", Date.parse(ctx.missionStartIso));
      if (typeof start !== "number") return start;
      const win = fitWindow(start, args.durationHours, ctx);
      if (isValidation(win)) return win;
      return { ok: true, request: { tool: name, siteIds: ids, startIso: new Date(start).toISOString(), durationHours: win.hours, adjustments: win.adjustments } };
    }
  }
}

/**
 * Tool execution. Runs in the browser against same-origin, read-only GET endpoints of /api/v1 (the
 * Firebase AI Logic loop is client-side anyway, the endpoints are public and cached, and no tool needs
 * a secret). The model never supplies a URL or path: every request is built here from validated fields.
 */
import { scienceGet } from "@/integrations/science/api-provider";
import { meteorStreamsFromFacts, streamIncidence } from "@/lib/science/meteor-streams";
import { METEOR_STREAM_FACT_ID, TOOL_TIMEOUT_MS } from "./constants";
import {
  catalogFromDetail, classifyError, failure, shapeChapters, shapeCompare, shapeComposition, shapeHorizon, shapeLaunchPlan, shapeMeteorStreams,
  shapeMetrics, shapePosition, shapeRank, shapeRiseSet, shapeSavedSites, shapeSiteDetail, shapeSites, shapeSolarPower, uiOutcome,
  type LaunchPlanData, type MeteorExposureData, type PowerEstimateData, type ToolOutcome, type UiChange,
} from "./tool-results";
import type { CatalogSite } from "@/data/sites";
import { validateToolCall, type Location, type SurfacePlan, type ToolContext, type ToolRequest, type UiPlan } from "./tool-validation";

export type ScienceGet = <T>(path: string, params: URLSearchParams, init?: { signal?: AbortSignal }) => Promise<T>;
/** Applies a validated view change to the Freeplay UI (supplied by the browser store; absent in pure tests). */
export type ApplyUi = (plan: UiPlan, catalog: CatalogSite | null) => UiChange;

/** A launch plan request; the browser supplies ephemeris-backed planning, tests can inject a fake. */
export type LaunchPlanInput = {
  site: { name: string; latitudeDeg: number; longitudeDeg: number; catalogId?: string; catalogPointVerified?: boolean };
  launchIso: string;
  trajectoryType: "direct" | "low-energy";
  payloadKg: number;
  ispS: number;
  includeArtemisReference: boolean;
};
/** A solar-power request over one location and window. */
export type SolarPowerInput = {
  location: Location;
  startIso: string;
  durationHours: number;
  panelAreaM2: number;
  panelEfficiency: number;
};
/** Applies a validated surface-setup edit in the open surface drive; returns null when the drive is not open and ready. */
export type ApplySurface = (plan: SurfacePlan) => UiChange | null;
export type ExecuteDeps = {
  get?: ScienceGet;
  signal?: AbortSignal;
  timeoutMs?: number;
  applyUi?: ApplyUi;
  applySurface?: ApplySurface;
  /** Ephemeris-backed launch planning (assistant store supplies this in the browser). */
  planLaunch?: (input: LaunchPlanInput) => Promise<LaunchPlanData | null>;
  /** Ephemeris-backed solar power estimate (assistant store supplies this in the browser). */
  estimatePower?: (input: SolarPowerInput) => Promise<PowerEstimateData | null>;
};

function locationParams(l: Location): URLSearchParams {
  const p = new URLSearchParams();
  if (l.kind === "catalog") p.set("siteId", l.siteId);
  else { p.set("lat", String(l.latDeg)); p.set("lon", String(l.lonDeg)); }
  return p;
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout;
}

async function run(req: ToolRequest, id: string, get: ScienceGet, signal: AbortSignal, ctx: ToolContext, deps: ExecuteDeps): Promise<ToolOutcome> {
  const init = { signal };
  switch (req.tool) {
    case "list_catalog_sites": {
      const p = new URLSearchParams();
      if (req.query) p.set("q", req.query);
      if (req.family) p.set("family", req.family);
      return shapeSites(id, await get("catalog/sites", p, init));
    }
    case "get_catalog_site":
      return shapeSiteDetail(id, await get(`catalog/sites/${encodeURIComponent(req.siteId)}`, new URLSearchParams(), init));
    case "list_story_chapters":
      return shapeChapters(id, await get("chapters", new URLSearchParams({ limit: "10" }), init));
    case "list_saved_sites":
      return shapeSavedSites(id, ctx.savedSites ?? []);
    case "get_sun_earth_position": {
      const p = locationParams(req.location);
      p.set("time", req.timeIso);
      return shapePosition(id, req.location.label, await get("science/celestial", p, init));
    }
    case "get_horizon_profile":
      return shapeHorizon(id, req.location.label, await get("science/horizon", locationParams(req.location), init));
    case "get_sunlight_and_earth_visibility": {
      const p = locationParams(req.location);
      p.set("start", req.startIso);
      p.set("durationHours", String(req.durationHours));
      return shapeMetrics(id, req.location.label, await get("science/metrics", p, init), req.adjustments);
    }
    case "get_sun_earth_rise_set": {
      const p = locationParams(req.location);
      p.set("start", req.startIso);
      p.set("stepMinutes", String(req.stepMinutes));
      return shapeRiseSet(id, req.location.label, await get("science/timeline", p, init), req.adjustments);
    }
    case "show_in_freeplay": {
      if (!deps.applyUi) return failure(req.tool, id, { code: "unavailable", message: "The Freeplay view cannot be changed here." });
      let catalog: CatalogSite | null = null;
      if (req.plan.siteId) {
        catalog = catalogFromDetail(await get(`catalog/sites/${encodeURIComponent(req.plan.siteId)}`, new URLSearchParams(), init), req.plan.siteId);
        if (!catalog) return failure(req.tool, id, { code: "not_found", message: `Catalog site ${req.plan.siteId} has no point to show on the globe.` });
      }
      return uiOutcome(id, deps.applyUi(req.plan, catalog));
    }
    case "edit_surface_setup": {
      const change = deps.applySurface?.(req.plan) ?? null;
      if (!change) return failure(req.tool, id, { code: "unavailable", message: "The surface drive is not open, so nothing could be placed. Offer the user the Open surface drive button (show_in_freeplay with page: drive), then ask again once they are in the explore view with the terrain loaded." });
      return uiOutcome(id, change, "edit_surface_setup");
    }
    case "compare_sites": {
      // Per-site metrics calls: this also supports the user's saved presets and custom points, which
      // /science/compare (catalog ids only) cannot. One failing site never hides the others.
      const results = await Promise.all(req.siteIds.map(async (siteId) => {
        const saved = ctx.savedSites?.find((s) => s.id === siteId);
        const p = saved ? new URLSearchParams({ lat: String(saved.latitudeDeg), lon: String(saved.longitudeDeg) }) : new URLSearchParams({ siteId });
        p.set("start", req.startIso);
        p.set("durationHours", String(req.durationHours));
        try {
          return { siteId, status: 200, result: await get("science/metrics", p, init) };
        } catch (err) {
          const status = typeof (err as { status?: unknown }).status === "number" ? (err as { status: number }).status : 0;
          return { siteId, status, result: { error: { message: err instanceof Error ? err.message : String(err) } } };
        }
      }));
      return shapeCompare(id, { sites: results, interval: { start: req.startIso, durationHours: req.durationHours } }, req.adjustments);
    }
    case "rank_sites": {
      const p = new URLSearchParams({ start: req.startIso, durationHours: String(req.durationHours), windows: String(req.windows) });
      if (req.family) p.set("family", req.family);
      if (req.siteIds?.length) p.set("siteIds", req.siteIds.join(","));
      if (req.weights) p.set("weights", Object.entries(req.weights).map(([k, v]) => `${k}:${v}`).join(","));
      return shapeRank(id, await get("science/rank", p, init), req.weights, req.adjustments);
    }
    case "get_surface_composition":
      return shapeComposition(id, req.location.label, await get("science/composition", locationParams(req.location), init));
    case "get_launch_plan": {
      if (!deps.planLaunch) return failure(req.tool, id, { code: "unavailable", message: "The launch planner is not available here." });
      if (!ctx.site) return failure(req.tool, id, { code: "no_site_selected", message: "No site is selected, so there is no landing site to plan a launch to." });
      const site = ctx.site;
      const data = await deps.planLaunch({
        site: { name: site.name, latitudeDeg: site.latitudeDeg, longitudeDeg: site.longitudeDeg, catalogId: site.catalogId, catalogPointVerified: site.catalogPointVerified },
        launchIso: req.launchIso, trajectoryType: req.trajectoryType, payloadKg: req.payloadKg, ispS: req.ispS, includeArtemisReference: req.includeArtemisReference,
      });
      return data
        ? (data.plan ? shapeLaunchPlan(id, site.name, data) : failure(req.tool, id, { code: "out_of_coverage", message: "The Moon's position at arrival is outside the stored ephemeris, so no transfer can be planned for that launch date." }, site.name))
        : failure(req.tool, id, { code: "unavailable", message: "The Moon positions needed for the launch plan could not be loaded." }, site.name);
    }
    case "get_solar_power": {
      if (!deps.estimatePower) return failure(req.tool, id, { code: "unavailable", message: "The solar power estimate is not available here." });
      const data = await deps.estimatePower({
        location: req.location, startIso: req.startIso, durationHours: req.durationHours,
        panelAreaM2: req.panelAreaM2, panelEfficiency: req.panelEfficiency,
      });
      return data
        ? shapeSolarPower(id, req.location.label, data, req.adjustments)
        : failure(req.tool, id, { code: "unavailable", message: "The Sun and horizon samples needed for the power estimate could not be loaded." }, req.location.label);
    }
    case "get_meteor_stream_exposure": {
      const raw = await get<Record<string, unknown>>(`facts/${METEOR_STREAM_FACT_ID}`, new URLSearchParams(), init);
      const streams = meteorStreamsFromFacts(raw as never);
      let exposure: MeteorExposureData["streams"] = streams.map((s) => ({ name: s.name, referenceIso: s.referenceUtc, subRadiantLatDeg: s.latitudeDeg, subRadiantLonDeg: s.longitudeDeg, incidence: null, facingHemisphere: null }));
      if (req.stream && req.location) {
        const stream = streams.find((s) => s.name.toLowerCase() === req.stream!.toLowerCase());
        if (!stream) {
          return failure(req.tool, id, { code: "not_found", message: `No ${req.stream} reference snapshot is stored. Known streams: ${streams.map((s) => s.name).join(", ")}.` }, req.location.label);
        }
        let point: { latDeg: number; lonDeg: number } | null = null;
        if (req.location.kind === "point") point = { latDeg: req.location.latDeg, lonDeg: req.location.lonDeg };
        else {
          const detail = catalogFromDetail(await get(`catalog/sites/${encodeURIComponent(req.location.siteId)}`, new URLSearchParams(), init), req.location.siteId);
          if (detail) point = { latDeg: detail.latDeg, lonDeg: detail.lonDeg };
        }
        const incidence = point ? streamIncidence(point.latDeg, point.lonDeg, stream) : null;
        exposure = exposure.map((e) => e.name === stream.name && incidence !== null
          ? { ...e, incidence: Number(incidence.toFixed(3)), facingHemisphere: incidence > 0 }
          : e);
      }
      return shapeMeteorStreams(id, req.stream, req.location?.label ?? null, { streams: exposure });
    }
  }
}

/** Validates, executes and shapes one model-requested tool call. Never throws. */
export async function executeToolCall(call: { name: unknown; args: unknown }, id: string, ctx: ToolContext, deps: ExecuteDeps = {}): Promise<ToolOutcome> {
  const checked = validateToolCall(call.name, call.args, ctx);
  if (!checked.ok) return failure(typeof call.name === "string" && checked.error.code !== "unknown_tool" ? (call.name as never) : "unknown", id, checked.error);
  try {
    return await run(checked.request, id, deps.get ?? scienceGet, withTimeout(deps.signal, deps.timeoutMs ?? TOOL_TIMEOUT_MS), ctx, deps);
  } catch (err) {
    const siteLabel = "location" in checked.request ? checked.request.location?.label ?? null : null;
    return failure(checked.request.tool, id, classifyError(err), siteLabel);
  }
}

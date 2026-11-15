/**
 * Tool execution. Runs in the browser against same-origin, read-only GET endpoints of /api/v1 (the
 * Firebase AI Logic loop is client-side anyway, the endpoints are public and cached, and no tool needs
 * a secret). The model never supplies a URL or path: every request is built here from validated fields.
 */
import { scienceGet } from "@/integrations/science/api-provider";
import { TOOL_TIMEOUT_MS } from "./constants";
import {
  catalogFromDetail, classifyError, failure, shapeChapters, shapeCompare, shapeHorizon, shapeMetrics, shapePosition, shapeRiseSet,
  shapeSiteDetail, shapeSites, uiOutcome, type ToolOutcome, type UiChange,
} from "./tool-results";
import type { CatalogSite } from "@/data/sites";
import { validateToolCall, type Location, type ToolContext, type ToolRequest, type UiPlan } from "./tool-validation";

export type ScienceGet = <T>(path: string, params: URLSearchParams, init?: { signal?: AbortSignal }) => Promise<T>;
/** Applies a validated view change to the Freeplay UI (supplied by the browser store; absent in pure tests). */
export type ApplyUi = (plan: UiPlan, catalog: CatalogSite | null) => UiChange;
export type ExecuteDeps = { get?: ScienceGet; signal?: AbortSignal; timeoutMs?: number; applyUi?: ApplyUi };

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

async function run(req: ToolRequest, id: string, get: ScienceGet, signal: AbortSignal, applyUi?: ApplyUi): Promise<ToolOutcome> {
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
      if (!applyUi) return failure(req.tool, id, { code: "unavailable", message: "The Freeplay view cannot be changed here." });
      let catalog: CatalogSite | null = null;
      if (req.plan.siteId) {
        catalog = catalogFromDetail(await get(`catalog/sites/${encodeURIComponent(req.plan.siteId)}`, new URLSearchParams(), init), req.plan.siteId);
        if (!catalog) return failure(req.tool, id, { code: "not_found", message: `Catalog site ${req.plan.siteId} has no point to show on the globe.` });
      }
      return uiOutcome(id, applyUi(req.plan, catalog));
    }
    case "compare_sites": {
      const p = new URLSearchParams({ siteIds: req.siteIds.join(","), start: req.startIso, durationHours: String(req.durationHours) });
      return shapeCompare(id, await get("science/compare", p, init), req.adjustments);
    }
  }
}

/** Validates, executes and shapes one model-requested tool call. Never throws. */
export async function executeToolCall(call: { name: unknown; args: unknown }, id: string, ctx: ToolContext, deps: ExecuteDeps = {}): Promise<ToolOutcome> {
  const checked = validateToolCall(call.name, call.args, ctx);
  if (!checked.ok) return failure(typeof call.name === "string" && checked.error.code !== "unknown_tool" ? (call.name as never) : "unknown", id, checked.error);
  try {
    return await run(checked.request, id, deps.get ?? scienceGet, withTimeout(deps.signal, deps.timeoutMs ?? TOOL_TIMEOUT_MS), deps.applyUi);
  } catch (err) {
    const siteLabel = "location" in checked.request ? checked.request.location.label : null;
    return failure(checked.request.tool, id, classifyError(err), siteLabel);
  }
}

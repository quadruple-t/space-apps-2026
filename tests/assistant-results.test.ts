import { describe, expect, it, vi } from "vitest";
import { ScienceApiError } from "@/integrations/science/api-provider";
import {
  FALLBACK_WORDING, GRID_CELL_WORDING, LAUNCH_PLAN_WORDING, MAX_TOOL_RESULT_CHARS, METEOR_STREAM_WORDING, NO_COVERAGE_WORDING, SAVED_SITE_WORDING, SOLAR_POWER_WORDING, failureWording,
} from "@/lib/assistant/constants";
import { turnNotices } from "@/lib/assistant/guards";
import {
  classifyHorizonSource, shapeCompare, shapeHorizon, shapeLaunchPlan, shapeMetrics, shapeMeteorStreams, shapeRiseSet, shapeSavedSites, shapeSites, shapeSolarPower,
} from "@/lib/assistant/tool-results";
import { executeToolCall, type ScienceGet } from "@/lib/assistant/tools";
import { ctxWithCatalogSite, ctxWithCustomSite, ctxWithSavedSites, metricsApi, timelineApi } from "./helpers/assistant-fixtures";

const FALLBACK = "none — smooth horizon";
const GRID = "LOLA DEM grid · 0.5 km cell, 0.3 km from point";

describe("horizon source classification", () => {
  it("maps every API source label to a kind", () => {
    expect(classifyHorizonSource("LOLA DEM")).toBe("site-lola-mask");
    expect(classifyHorizonSource(GRID)).toBe("lola-polar-grid");
    expect(classifyHorizonSource(FALLBACK)).toBe("smooth-sphere-fallback");
    expect(classifyHorizonSource("something new")).toBe("unrecognised");
    expect(classifyHorizonSource(undefined)).toBe("unrecognised");
  });
});

describe("result shaping and labelling", () => {
  it("labels a site-mask metrics result with horizon source, data range and no caveat wording", () => {
    const { response, record } = shapeMetrics("c1", "Apollo 17", metricsApi("LOLA DEM"), []);
    expect(response).toMatchObject({ ok: true, site: "Apollo 17", horizon: { kind: "site-lola-mask", upperBound: false }, data: { sunlightPercent: 72, sharesAreUpperBounds: false } });
    expect(response.dataRange).toBe("2027-03-01 00:00 UTC to 2027-03-02 00:00 UTC");
    expect(String(response.ephemeris)).toMatch(/JPL Horizons/);
    expect(record).toMatchObject({ ok: true, horizonKind: "site-lola-mask", mustSay: [] });
  });

  it("marks fallback-horizon results as upper bounds and attaches the required wording", () => {
    const { response, record } = shapeMetrics("c1", "custom point", metricsApi(FALLBACK), []);
    expect(response).toMatchObject({ horizon: { kind: "smooth-sphere-fallback", upperBound: true }, data: { sharesAreUpperBounds: true }, mustSay: [FALLBACK_WORDING] });
    expect(record.mustSay).toEqual([FALLBACK_WORDING]);
    expect(FALLBACK_WORDING).toMatch(/smooth-sphere/);
    expect(FALLBACK_WORDING).toMatch(/not terrain-derived/);
    expect(FALLBACK_WORDING).toMatch(/upper bounds/);
  });

  it("says a polar grid cell is a nearby cell, not the exact point", () => {
    const { response } = shapeMetrics("c1", "pole", metricsApi(GRID), []);
    expect(response.mustSay).toEqual([GRID_CELL_WORDING]);
    expect(response.horizon).toMatchObject({ kind: "lola-polar-grid", upperBound: false });
  });

  it("summarises the horizon instead of returning 360 samples", () => {
    const elevationsDeg = Array.from({ length: 360 }, (_, i) => (i === 90 ? 8 : 1));
    const { response } = shapeHorizon("c1", "x", { horizon: { azimuthStepDeg: 1, elevationsDeg }, source: "LOLA DEM", provenance: "scientific" });
    const data = response.data as { maxElevationDeg: number; azimuthOfMaxDeg: number; sectorMaxElevation: { sector: string; maxElevationDeg: number }[]; samples: number };
    expect(data).toMatchObject({ maxElevationDeg: 8, azimuthOfMaxDeg: 90, samples: 360 });
    expect(data.sectorMaxElevation.find((s) => s.sector === "E")?.maxElevationDeg).toBe(8);
    expect(JSON.stringify(response).length).toBeLessThan(1500);
  });

  it("reports a null horizon (no mask) as the smooth-sphere fallback", () => {
    const { response, record } = shapeHorizon("c1", "x", { horizon: null, source: FALLBACK, provenance: "scientific" });
    expect(response).toMatchObject({ data: { profileAvailable: false }, horizon: { kind: "smooth-sphere-fallback" }, mustSay: [FALLBACK_WORDING] });
    expect(record.horizonKind).toBe("smooth-sphere-fallback");
  });

  it("turns a timeline into rise/set intervals with the step resolution", () => {
    const { response } = shapeRiseSet("c1", "x", timelineApi(), []);
    const data = response.data as { sunClearOfHorizonIntervals: { from: string; to: string; continuesFromBeforeWindow: boolean; continuesAfterWindow: boolean }[]; earthClearOfHorizonIntervals: unknown[]; stepMinutes: number };
    expect(data.stepMinutes).toBe(60);
    expect(data.sunClearOfHorizonIntervals).toEqual([{ from: "2027-03-02T06:00:00.000Z", to: "2027-03-02T17:00:00.000Z", continuesFromBeforeWindow: false, continuesAfterWindow: false }]);
    expect((data.earthClearOfHorizonIntervals[0] as { continuesFromBeforeWindow: boolean }).continuesFromBeforeWindow).toBe(true);
    expect((response.notes as string[])[0]).toMatch(/60-minute resolution/);
  });

  it("limits catalog rows and flags truncation", () => {
    const sites = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, name: `Site ${i}`, family: "apollo", latDeg: 1.234567, lonDeg: 2, coordsVerified: true }));
    const { response } = shapeSites("c1", { sites, count: 40 });
    expect(response.data).toMatchObject({ count: 40, shown: 25, truncated: true });
    expect(JSON.stringify(response).length).toBeLessThan(MAX_TOOL_RESULT_CHARS);
  });

  it("compare: keeps per-site horizon labels and reports a failing site without hiding the others", () => {
    const raw = { sites: [
      { siteId: "apollo-17", status: 200, result: metricsApi("LOLA DEM") },
      { siteId: "luna-9", status: 422, result: { error: { message: "The selected site's coordinates are not verified, so scientific results are not available for it" } } },
      { siteId: "pole", status: 200, result: metricsApi(FALLBACK) },
    ], interval: {} };
    const { response, record } = shapeCompare("c1", raw, []);
    const sites = (response.data as { sites: Record<string, unknown>[] }).sites;
    expect(sites.map((s) => s.ok)).toEqual([true, false, true]);
    expect(sites[2]).toMatchObject({ horizon: { upperBound: true } });
    expect(record.horizonKind).toBe("smooth-sphere-fallback");
    expect(record.ok).toBe(true);
    expect(record.mustSay).toContain(FALLBACK_WORDING);
    expect(record.mustSay.join(" ")).toMatch(/luna-9.*not verified.*won't fill the gap from memory/);
  });
});

describe("tool execution against the API (mock fetch)", () => {
  const mk = (impl: (path: string, p: URLSearchParams) => unknown) => vi.fn(async (path: string, p: URLSearchParams) => impl(path, p)) as unknown as ScienceGet & ReturnType<typeof vi.fn>;

  it("builds the request from validated fields only", async () => {
    const get = mk(() => metricsApi("LOLA DEM"));
    await executeToolCall({ name: "get_sunlight_and_earth_visibility", args: { useCurrentSite: true, durationHours: 99999 } }, "c1", ctxWithCatalogSite, { get });
    const [path, params] = get.mock.calls[0] as [string, URLSearchParams];
    expect(path).toBe("science/metrics");
    expect(Object.fromEntries(params)).toEqual({ siteId: "apollo-17", start: "2027-03-01T00:00:00.000Z", durationHours: "720" });
  });

  it("uses lat/lon for a custom site", async () => {
    const get = mk(() => ({ horizon: null, source: FALLBACK }));
    await executeToolCall({ name: "get_horizon_profile", args: { useCurrentSite: true } }, "c1", ctxWithCustomSite, { get });
    expect(Object.fromEntries((get.mock.calls[0] as [string, URLSearchParams])[1])).toEqual({ lat: "-85.1", lon: "20.5" });
  });

  it("never calls the API for an invalid call", async () => {
    const get = mk(() => ({}));
    const out = await executeToolCall({ name: "get_catalog_site", args: { siteId: "../../users/abc" } }, "c1", ctxWithCatalogSite, { get });
    expect(get).not.toHaveBeenCalled();
    expect(out.record.ok).toBe(false);
  });

  it.each([
    [new ScienceApiError("Stored JPL Horizons ephemeris covers 2026-01-01 through 2030-12-31", 422), "out_of_coverage", NO_COVERAGE_WORDING],
    [new ScienceApiError("The selected site's coordinates are not verified, so scientific results are not available for it", 422), "site_unverified", undefined],
    [new ScienceApiError("Site not found", 404), "not_found", undefined],
    [new ScienceApiError("Data service unavailable", 503), "unavailable", undefined],
    [new TypeError("Failed to fetch"), "unavailable", undefined],
    [new DOMException("timed out", "TimeoutError"), "timeout", undefined],
  ])("turns %s into a plain failure with the required wording", async (error, code, wording) => {
    const get = mk(() => { throw error; });
    const out = await executeToolCall({ name: "get_sun_earth_position", args: { useCurrentSite: true } }, "c1", ctxWithCatalogSite, { get });
    expect(out.response).toMatchObject({ ok: false, error: { code } });
    const said = (out.response.mustSay as string[])[0];
    expect(said).toBe(wording ?? failureWording((out.response.error as { message: string }).message));
    expect(said).toMatch(wording ? /no data for it/ : /won't fill the gap from memory/);
    expect(String(out.response.instruction)).toMatch(/Do not answer from your own knowledge/);
    expect(turnNotices([out.record], "")).toContain(said);
  });

  it("returns an error instead of an oversized result", async () => {
    const get = mk(() => ({ items: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, title: "t".repeat(5000), concept: "c".repeat(5000) })) }));
    const out = await executeToolCall({ name: "list_story_chapters", args: {} }, "c1", ctxWithCatalogSite, { get });
    expect(JSON.stringify(out.response).length).toBeLessThan(MAX_TOOL_RESULT_CHARS);
  });
});

describe("launch, power, saved-preset and meteor results", () => {
  const mk = (impl: (path: string, p: URLSearchParams) => unknown) => vi.fn(async (path: string, p: URLSearchParams) => impl(path, p)) as unknown as ScienceGet & ReturnType<typeof vi.fn>;
  const catalogDetail = { site: { id: "apollo-17", name: "Apollo 17", coordinates: { latDeg: 20.19, lonDeg: 30.77 }, coordsVerified: true } };
  const launch: Parameters<typeof shapeLaunchPlan>[2] = {
    plan: {
      launchIso: "2027-04-01T00:00:00.000Z", arrivalIso: "2027-04-04T06:00:00.000Z", transitHours: 78,
      arrivalDistanceKm: 384_400, apogeeKm: 422_840, eccentricity: 0.964,
      alignment: { sunUpAtArrival: true, hoursSincePrevSunrise: 12, hoursUntilNextSunrise: null, nearSunrise: true, summary: "Sun is up at arrival." },
    },
    outOfCoverage: false,
    estimate: {
      totalKmS: 5.6, totalLowKmS: 5.2, totalHighKmS: 6.1,
      phases: [{ id: "tli", label: "Trans-lunar injection (from LEO)", kmS: 3.1, lowKmS: 3.05, highKmS: 3.2 }],
      propellantKg: 12_345, leoMassKg: 14_000, leoMassRangeKg: { low: 13_000, high: 15_000 },
      cost: { lowUsd: 41_000_000, highUsd: 75_000_000, classLabel: "Medium-lift launcher", reference: "Falcon 9-class" },
    },
    artemis: { hoursToFlyby: 120, flybyAltitudeKm: 130 },
  };

  it("shapes a launch plan with the approximation wording and rounded numbers", () => {
    const { response, record } = shapeLaunchPlan("c1", "Apollo 17", launch);
    expect(response).toMatchObject({
      ok: true, site: "Apollo 17",
      data: {
        outOfCoverage: false,
        plan: { transitHours: 78, arrivalLighting: { nearSunrise: true } },
        deltaV: { totalKmS: 5.6 },
        mass: { propellantKg: 12_345, leoMassKg: 14_000 },
        launchCost: { launchClass: "Medium-lift launcher" },
        artemisReference: { hoursToFlyby: 120, flybyAltitudeKm: 130 },
      },
      mustSay: [LAUNCH_PLAN_WORDING],
    });
    expect(record.mustSay).toContain(LAUNCH_PLAN_WORDING);
  });

  it("shapes a flat-panel power estimate with its horizon source and caveat", () => {
    const { response } = shapeSolarPower("c1", "custom point", {
      peakW: 300, meanW: 120, energyKWh: 24, litSharePercent: 55, hours: 200,
      horizonSource: FALLBACK, startIso: "2027-03-01T00:00:00.000Z", endIso: "2027-03-09T08:00:00.000Z",
      panelAreaM2: 1, panelEfficiency: 0.3,
    }, []);
    expect(response).toMatchObject({
      horizon: { kind: "smooth-sphere-fallback", upperBound: true },
      data: { peakW: 300, energyKWh: 24, sharesAreUpperBounds: true },
    });
    expect((response.mustSay as string[])).toEqual(expect.arrayContaining([FALLBACK_WORDING, SOLAR_POWER_WORDING]));
  });

  it("shapes saved presets without calling them verified", () => {
    const { response, record } = shapeSavedSites("c1", ctxWithSavedSites.savedSites!);
    expect(response.data).toMatchObject({ count: 2 });
    expect((response.data as { sites: { id: string; name: string }[] }).sites[0]).toMatchObject({ id: "saved-ridge", name: "Ridge camp" });
    expect(response.mustSay).toEqual([SAVED_SITE_WORDING]);
    expect(record.site).toBeNull();
  });

  it("shapes meteor streams with incidence geometry and its caveat", () => {
    const { response } = shapeMeteorStreams("c1", "Geminids", "Apollo 17", {
      streams: [{ name: "Geminids", referenceIso: "2026-12-14T00:00:00.000Z", subRadiantLatDeg: 32.3, subRadiantLonDeg: 112.3, incidence: 0.84, facingHemisphere: true }],
    });
    expect(response).toMatchObject({ data: { requestedStream: "Geminids", streams: [{ name: "Geminids", incidence: 0.84, facingHemisphere: true }] } });
    expect(response.mustSay).toEqual([METEOR_STREAM_WORDING]);
  });

  it("executes the new tools with injected estimators", async () => {
    const saved = await executeToolCall({ name: "list_saved_sites", args: {} }, "c1", ctxWithSavedSites, {});
    expect(saved.response).toMatchObject({ ok: true, data: { count: 2 } });

    const launchOut = await executeToolCall({ name: "get_launch_plan", args: {} }, "c2", ctxWithCatalogSite, {
      planLaunch: async () => launch,
    });
    expect(launchOut.response).toMatchObject({ ok: true, data: { plan: { transitHours: 78 } } });

    const missing = await executeToolCall({ name: "get_launch_plan", args: {} }, "c3", ctxWithCatalogSite, {
      planLaunch: async () => ({ ...launch, plan: null, outOfCoverage: true, artemis: null }),
    });
    expect(missing.response).toMatchObject({ ok: false, error: { code: "out_of_coverage" } });

    const powerOut = await executeToolCall({ name: "get_solar_power", args: { useCurrentSite: true } }, "c4", ctxWithCatalogSite, {
      estimatePower: async () => ({
        peakW: 300, meanW: 120, energyKWh: 24, litSharePercent: 55, hours: 200, horizonSource: "LOLA DEM",
        startIso: "2027-03-01T00:00:00.000Z", endIso: "2027-03-09T08:00:00.000Z", panelAreaM2: 1, panelEfficiency: 0.3,
      }),
    });
    expect(powerOut.response).toMatchObject({ ok: true, horizon: { kind: "site-lola-mask" }, data: { energyKWh: 24 } });
  });

  it("reads meteor streams from the facts API and resolves a catalog point for incidence", async () => {
    const get = mk((path) => path === "facts/meteor-streams-2026"
      ? { rows: [
        { label: "Geminids", unit: "UTC", value: "2026-12-14T00:00:00.000Z" },
        { label: "Geminids", unit: "latitude deg", value: 32.3 },
        { label: "Geminids", unit: "longitude deg", value: 112.3 },
      ] }
      : catalogDetail);
    const out = await executeToolCall({ name: "get_meteor_stream_exposure", args: { stream: "Geminids", useCurrentSite: true } }, "c1", ctxWithCatalogSite, { get });
    expect(get.mock.calls.map((c) => c[0])).toEqual(["facts/meteor-streams-2026", "catalog/sites/apollo-17"]);
    const data = out.response.data as { streams: { name: string; incidence: number | null; facingHemisphere: boolean | null }[] };
    expect(data.streams[0].incidence).not.toBeNull();
    expect(typeof data.streams[0].facingHemisphere).toBe("boolean");
  });
});

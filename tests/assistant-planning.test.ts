import { describe, expect, it, vi } from "vitest";
import {
  APPROXIMATE_POINT_WORDING, COMPOSITION_WORDING, FALLBACK_WORDING, ICE_PROXY_WORDING, MAX_TOOL_RESULT_CHARS, RANK_ROWS_SHOWN,
} from "@/lib/assistant/constants";
import { validateToolCall } from "@/lib/assistant/tool-validation";
import { executeToolCall, type ScienceGet } from "@/lib/assistant/tools";
import { ctxWithCatalogSite } from "./helpers/assistant-fixtures";

const v = (args: unknown, name = "rank_sites") => validateToolCall(name, args, ctxWithCatalogSite);

const rankRow = (i: number, over: Record<string, unknown> = {}) => ({
  siteId: `site-${i}`, name: `Site ${i}`, family: "artemis-candidate", latDeg: -85 - i / 10, lonDeg: i, locationQuality: "verified",
  horizonSource: "LOLA DEM", insidePsr: false, sunlightPercent: 70 - i, worstWindowSunlightPercent: 55 - i, longestDarknessHours: 100 + i,
  earthVisibilityPercent: 90, slope100mDeg: 4 + i / 10, nearestColdTrapKm: 10 + i, feoWtPct: 5, tio2WtPct: 0.4, al2o3WtPct: 28, caoWtPct: 16,
  scores: { sunlight: 1 - i / 40, darkness: 1 - i / 40 }, score: 1 - i / 40, weightCoverage: 1, rank: i + 1, flags: [], ...over,
});
const rankApi = (rows: Record<string, unknown>[]) => ({
  interval: { start: "2027-03-01T00:00:00.000Z", durationHours: 720, windows: 4, windowStarts: [] },
  weights: { sunlight: 3, darkness: 2, slope: 2, iron: 1, ice: 1 },
  method: { normalisation: "min-max", criteria: { sunlight: "sun", darkness: "dark", slope: "slope", iron: "FeO", ice: "ice" } },
  count: rows.length, sites: rows, skipped: [{ siteId: "luna-9", reason: "unverified" }], assumptions: ["a"], provenance: "scientific",
});

describe("rank_sites validation", () => {
  it("defaults to the mission start, one 720 h window and the API's default weights", () => {
    expect(v({})).toEqual({ ok: true, request: { tool: "rank_sites", startIso: "2027-03-01T00:00:00.000Z", durationHours: 720, windows: 1, weights: null, adjustments: [] } });
  });

  it("checks weights against the criteria and clamps out-of-range numbers", () => {
    expect(v({ weights: { gold: 3 } }).ok).toBe(false);
    expect(v({ weights: { sunlight: "high" } }).ok).toBe(false);
    expect(v({ weights: { sunlight: 0 } }).ok).toBe(false);
    const r = v({ weights: { sunlight: 30, iron: 1 } });
    expect(r.ok && r.request.tool === "rank_sites" && r.request.weights).toEqual({ sunlight: 10, iron: 1 });
    expect(r.ok && r.request.tool === "rank_sites" && r.request.adjustments[0]).toMatch(/clamped/);
  });

  it("drops seasonal windows that do not fit before the end of stored data and says so", () => {
    const r = v({ start: "2030-07-01T00:00:00Z", windows: 4 });
    expect(r.ok && r.request.tool === "rank_sites" && r.request.windows).toBe(2);
    expect(r.ok && r.request.tool === "rank_sites" && r.request.adjustments.join(" ")).toMatch(/Only 2 of 4/);
  });

  it("validates the site filter", () => {
    expect(v({ family: "klingon" }).ok).toBe(false);
    expect(v({ siteIds: ["../users"] }).ok).toBe(false);
    expect(v({ siteIds: Array.from({ length: 26 }, (_, i) => `s${i}`) }).ok).toBe(false);
    expect(v({ family: "apollo", siteIds: ["apollo-11"] }).ok).toBe(false);
    expect(v({ start: "2025-01-01T00:00:00Z" }).ok).toBe(false);
  });
});

describe("rank_sites results", () => {
  it("sends the validated request as query parameters", async () => {
    const get = vi.fn(async () => rankApi([rankRow(0)])) as unknown as ScienceGet;
    await executeToolCall({ name: "rank_sites", args: { windows: 4, weights: { sunlight: 3, iron: 1 }, family: "artemis-candidate" } }, "c1", ctxWithCatalogSite, { get });
    const [path, params] = (get as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, URLSearchParams];
    expect(path).toBe("science/rank");
    expect(Object.fromEntries(params)).toEqual({ start: "2027-03-01T00:00:00.000Z", durationHours: "720", windows: "4", family: "artemis-candidate", weights: "sunlight:3,iron:1" });
  });

  it("returns a bounded shortlist with every caveat that applies to a shown site", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => rankRow(i, i === 0 ? { locationQuality: "approximate-region", flags: ["approximate-region-point"] } : i === 2 ? { horizonSource: "none — smooth horizon", flags: ["smooth-horizon-upper-bound"] } : {}));
    const get = vi.fn(async () => rankApi(rows)) as unknown as ScienceGet;
    const out = await executeToolCall({ name: "rank_sites", args: { weights: { sunlight: 3, iron: 1, ice: 1 } } }, "c1", ctxWithCatalogSite, { get });
    expect(out.record.ok).toBe(true);
    expect(JSON.stringify(out.response).length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
    const data = out.response.data as { sites: { siteId: string; locationQuality: string }[]; ranked: number; skipped: string[] };
    expect(data.sites).toHaveLength(RANK_ROWS_SHOWN);
    expect(data.ranked).toBe(40);
    expect(data.skipped).toEqual(["luna-9"]);
    expect(out.record.mustSay).toEqual(expect.arrayContaining([APPROXIMATE_POINT_WORDING, FALLBACK_WORDING, COMPOSITION_WORDING, ICE_PROXY_WORDING]));
    expect(out.record.horizonKind).toBe("smooth-sphere-fallback");
  });

  it("omits caveats that do not apply", async () => {
    const rows = [rankRow(0, { feoWtPct: null, tio2WtPct: null, al2o3WtPct: null, caoWtPct: null })];
    const get = vi.fn(async () => rankApi(rows)) as unknown as ScienceGet;
    const out = await executeToolCall({ name: "rank_sites", args: { weights: { sunlight: 1 } } }, "c1", ctxWithCatalogSite, { get });
    expect(out.record.mustSay).toEqual([]);
  });
});

describe("rank_sites pick, noise and shared pixels", () => {
  const pickApi = () => ({
    ...rankApi([
      rankRow(0, { siteId: "top", name: "Top", flags: ["heritage-protection-zone"], oxidesLowConfidence: ["Al2O3"] }),
      ...Array.from({ length: 11 }, (_, i) => rankRow(i + 1, i === 2 ? { siteId: "twin-a", sharesCompositionPixelWith: ["twin-b"] } : i === 3 ? { siteId: "twin-b", sharesCompositionPixelWith: ["twin-a"] } : {})),
      rankRow(12, { siteId: "clean", name: "Clean", oxidesLowConfidence: [] }),
    ]),
    recommendation: { siteId: "clean", rank: 13, reason: "Best-ranked site with no blocking flag.", passedOver: { siteId: "top", blockingFlags: ["heritage-protection-zone"] }, allBlocked: false },
  });
  const run = () => executeToolCall({ name: "rank_sites", args: { weights: { sunlight: 1, iron: 1 } } }, "c1", ctxWithCatalogSite, { get: vi.fn(async () => pickApi()) as unknown as ScienceGet });

  it("always shows the recommended pick, even below the cut, and reports what it passed over", async () => {
    const data = (await run()).response.data as { recommendedPick: { siteId: string; passedOver: { siteId: string } }; sites: { siteId: string; isRecommendedPick?: boolean }[] };
    expect(data.recommendedPick).toMatchObject({ siteId: "clean", passedOver: { siteId: "top" } });
    expect(data.sites).toHaveLength(RANK_ROWS_SHOWN + 1);
    expect(data.sites.find((s) => s.siteId === "clean")!.isRecommendedPick).toBe(true);
  });

  it("withholds oxide values that are below their uncertainty and says which", async () => {
    const top = ((await run()).response.data as { sites: Record<string, unknown>[] }).sites.find((s) => s.siteId === "top")!;
    expect(top.oxidesWithheldAsNoise).toEqual(["Al2O3"]);
    expect(top).not.toHaveProperty("al2o3WtPct");
    expect(top).toHaveProperty("feoWtPct");
  });

  it("passes on which sites share a composition pixel", async () => {
    const sites = ((await run()).response.data as { sites: Record<string, unknown>[] }).sites;
    expect(sites.find((s) => s.siteId === "twin-a")!.sharesCompositionPixelWith).toEqual(["twin-b"]);
  });

  it("stays within the result size limit", async () => {
    expect(JSON.stringify((await run()).response).length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
  });
});

describe("get_surface_composition", () => {
  const api = (locationQuality: string) => ({
    latDeg: -86, lonDeg: -0.24, locationQuality, oxidesWtPct: { FeO: 5.12, TiO2: 0.41 }, sigmaWtPct: { FeO: 0.6, TiO2: 0.2 },
    pixel: { index: 1, centerLatDeg: -87, centerLonDeg: 0, sizeDeg: 2, distanceKm: 30.1 }, resolutionKm: 60,
    source: { citation: "Prettyman et al. (2006)" }, assumptions: ["Regional average"], provenance: "scientific",
  });

  it("always carries the regional-average wording, plus the approximate-point wording for Artemis regions", async () => {
    const get = vi.fn(async () => api("approximate-region")) as unknown as ScienceGet;
    const out = await executeToolCall({ name: "get_surface_composition", args: { siteId: "artemis-malapert-massif" } }, "c1", ctxWithCatalogSite, { get });
    expect((get as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("science/composition");
    expect(out.record.mustSay).toEqual([COMPOSITION_WORDING, APPROXIMATE_POINT_WORDING]);
    expect((out.response.data as { oxidesWtPct: Record<string, number> }).oxidesWtPct.FeO).toBe(5.12);

    const verified = await executeToolCall({ name: "get_surface_composition", args: { useCurrentSite: true } }, "c2", ctxWithCatalogSite, { get: vi.fn(async () => api("verified")) as unknown as ScienceGet });
    expect(verified.record.mustSay).toEqual([COMPOSITION_WORDING]);
  });

  it("needs exactly one location", () => {
    expect(v({}, "get_surface_composition").ok).toBe(false);
    expect(v({ siteId: "a", latDeg: 1, lonDeg: 2 }, "get_surface_composition").ok).toBe(false);
  });
});

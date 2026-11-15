import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "@/lib/assistant/constants";
import { parseIsoUtc, validateToolCall } from "@/lib/assistant/tool-validation";
import { ctxNoSite, ctxWithCatalogSite, ctxWithCustomSite } from "./helpers/assistant-fixtures";

const v = (name: unknown, args: unknown, ctx = ctxWithCatalogSite) => validateToolCall(name, args, ctx);
const errCode = (r: ReturnType<typeof v>) => (r.ok ? null : r.error.code);

describe("tool-call validation", () => {
  it("allowlists tool names", () => {
    expect(errCode(v("delete_everything", {}))).toBe("unknown_tool");
    expect(errCode(v("constructor", {}))).toBe("unknown_tool");
    expect(errCode(v(undefined, {}))).toBe("unknown_tool");
    for (const name of TOOL_NAMES) expect(errCode(v(name, {}))).not.toBe("unknown_tool");
  });

  it("rejects non-object args and unknown keys", () => {
    expect(errCode(v("list_story_chapters", "x"))).toBe("invalid_arguments");
    expect(errCode(v("list_story_chapters", [1]))).toBe("invalid_arguments");
    expect(errCode(v("get_catalog_site", { siteId: "apollo-17", path: "/../users" }))).toBe("invalid_arguments");
    expect(v("list_story_chapters", undefined).ok).toBe(true);
  });

  it("pattern-checks ids so the model cannot steer the request path", () => {
    for (const siteId of ["../users/x", "a/b", "a b", "", "x".repeat(121), 5, null]) expect(errCode(v("get_catalog_site", { siteId }))).toBe("invalid_arguments");
    expect(v("get_catalog_site", { siteId: "apollo-17" }).ok).toBe(true);
  });

  it("validates list_catalog_sites filters against the family enum", () => {
    expect(errCode(v("list_catalog_sites", { family: "klingon" }))).toBe("invalid_arguments");
    expect(errCode(v("list_catalog_sites", { query: "x".repeat(61) }))).toBe("invalid_arguments");
    const r = v("list_catalog_sites", { query: "  apollo\u0000 ", family: "apollo" });
    expect(r.ok && r.request).toEqual({ tool: "list_catalog_sites", query: "apollo", family: "apollo" });
  });

  it("requires exactly one location mode and resolves the current site", () => {
    expect(errCode(v("get_horizon_profile", {}))).toBe("invalid_arguments");
    expect(errCode(v("get_horizon_profile", { useCurrentSite: true, siteId: "apollo-17" }))).toBe("invalid_arguments");
    expect(errCode(v("get_horizon_profile", { latDeg: -85 }))).toBe("invalid_arguments");
    const cat = v("get_horizon_profile", { useCurrentSite: true });
    expect(cat.ok && cat.request).toMatchObject({ location: { kind: "catalog", siteId: "apollo-17" } });
    const custom = v("get_horizon_profile", { useCurrentSite: true }, ctxWithCustomSite);
    expect(custom.ok && custom.request).toMatchObject({ location: { kind: "point", latDeg: -85.1, lonDeg: 20.5 } });
    expect(errCode(v("get_horizon_profile", { useCurrentSite: true }, ctxNoSite))).toBe("no_site_selected");
  });

  it("treats placeholder values as 'not given' (models fill optional arguments with null, empty strings, false, 0)", () => {
    const filled = { useCurrentSite: true, siteId: "", latDeg: 0, lonDeg: 0, time: "", durationHours: 0, stepMinutes: 0, start: null };
    for (const tool of ["get_horizon_profile", "get_sun_earth_position", "get_sunlight_and_earth_visibility", "get_sun_earth_rise_set"]) {
      const r = v(tool, filled);
      expect(r.ok, tool).toBe(true);
      expect(r.ok && r.request).toMatchObject({ location: { kind: "catalog", siteId: "apollo-17" } });
    }
    const dur = v("get_sunlight_and_earth_visibility", { useCurrentSite: true, durationHours: 0 });
    expect(dur.ok && dur.request).toMatchObject({ durationHours: 709 });
    const named = v("get_horizon_profile", { useCurrentSite: false, siteId: "apollo-11", latDeg: 0, lonDeg: 0 });
    expect(named.ok && named.request).toMatchObject({ location: { kind: "catalog", siteId: "apollo-11" } });
  });

  it("still refuses genuinely ambiguous locations and says what was provided", () => {
    const both = v("get_horizon_profile", { useCurrentSite: true, siteId: "apollo-11" });
    expect(errCode(both)).toBe("invalid_arguments");
    expect(!both.ok && both.error.message).toMatch(/You provided: useCurrentSite, siteId/);
    expect(errCode(v("get_horizon_profile", { useCurrentSite: true, latDeg: 12, lonDeg: 0 }))).toBe("invalid_arguments");
    // A lone (0, 0) with no other location mode is a real point, not a placeholder.
    const origin = v("get_horizon_profile", { latDeg: 0, lonDeg: 0 });
    expect(origin.ok && origin.request).toMatchObject({ location: { kind: "point", latDeg: 0, lonDeg: 0 } });
  });

  it("does not send an unverified catalog point as a catalog id", () => {
    const ctx = { ...ctxWithCatalogSite, site: { ...ctxWithCatalogSite.site!, catalogPointVerified: false } };
    const r = v("get_horizon_profile", { useCurrentSite: true }, ctx);
    expect(r.ok && r.request).toMatchObject({ location: { kind: "point" } });
  });

  it("bounds coordinates", () => {
    expect(errCode(v("get_horizon_profile", { latDeg: 91, lonDeg: 0 }))).toBe("invalid_arguments");
    expect(errCode(v("get_horizon_profile", { latDeg: 0, lonDeg: 361 }))).toBe("invalid_arguments");
    expect(errCode(v("get_horizon_profile", { latDeg: 0, lonDeg: -181 }))).toBe("invalid_arguments");
    expect(errCode(v("get_horizon_profile", { latDeg: "0", lonDeg: 0 }))).toBe("invalid_arguments");
    expect(errCode(v("get_horizon_profile", { latDeg: Number.NaN, lonDeg: 0 }))).toBe("invalid_arguments");
    expect(v("get_horizon_profile", { latDeg: -89.99999, lonDeg: 359.5 }).ok).toBe(true);
  });

  it("parses ISO times strictly and reads offsetless times as UTC", () => {
    expect(parseIsoUtc("2027-03-01")).toBe(Date.UTC(2027, 2, 1));
    expect(parseIsoUtc("2027-03-01T12:00")).toBe(Date.UTC(2027, 2, 1, 12));
    expect(parseIsoUtc("2027-03-01T12:00:00+02:00")).toBe(Date.UTC(2027, 2, 1, 10));
    for (const bad of ["tomorrow", "1e9", "2027-13-45", "", 5, null, "2027-03-01; drop"]) expect(parseIsoUtc(bad)).toBeNull();
  });

  it("defaults time to the Open Exploration mission time and refuses (not clamps) out-of-coverage dates", () => {
    const now = v("get_sun_earth_position", { useCurrentSite: true });
    expect(now.ok && now.request).toMatchObject({ timeIso: "2027-03-02T06:00:00.000Z" });
    const early = v("get_sun_earth_position", { useCurrentSite: true, time: "2025-06-01T00:00:00Z" });
    expect(errCode(early)).toBe("out_of_coverage");
    expect(!early.ok && early.error.mustSay).toMatch(/outside the stored JPL Horizons/);
    expect(errCode(v("get_sun_earth_position", { useCurrentSite: true, time: "2031-01-01T00:00:00Z" }))).toBe("out_of_coverage");
    expect(errCode(v("get_sun_earth_position", { useCurrentSite: true, time: "soon" }))).toBe("invalid_arguments");
  });

  it("clamps durations to 1–720 h and reports it", () => {
    const big = v("get_sunlight_and_earth_visibility", { useCurrentSite: true, durationHours: 8760 });
    expect(big.ok && big.request).toMatchObject({ durationHours: 720 });
    expect(big.ok && big.request.tool === "get_sunlight_and_earth_visibility" && big.request.adjustments[0]).toMatch(/clamped to 720/);
    const tiny = v("get_sunlight_and_earth_visibility", { useCurrentSite: true, durationHours: 0.01 });
    expect(tiny.ok && tiny.request).toMatchObject({ durationHours: 1 });
    expect(errCode(v("get_sunlight_and_earth_visibility", { useCurrentSite: true, durationHours: "24" }))).toBe("invalid_arguments");
    expect(errCode(v("get_sunlight_and_earth_visibility", { useCurrentSite: true, durationHours: Infinity }))).toBe("invalid_arguments");
  });

  it("defaults the metrics window to the mission window, capped", () => {
    const r = v("get_sunlight_and_earth_visibility", { useCurrentSite: true });
    expect(r.ok && r.request).toMatchObject({ startIso: "2027-03-01T00:00:00.000Z", durationHours: 709 });
    const year = v("get_sunlight_and_earth_visibility", { useCurrentSite: true }, { ...ctxWithCatalogSite, missionDurationHours: 8760 });
    expect(year.ok && year.request).toMatchObject({ durationHours: 720 });
  });

  it("shortens a window that runs past the end of coverage, and refuses one that starts there", () => {
    const r = v("get_sunlight_and_earth_visibility", { useCurrentSite: true, start: "2030-12-30T00:00:00Z", durationHours: 100 });
    expect(r.ok && r.request).toMatchObject({ durationHours: 47 });
    expect(r.ok && r.request.tool === "get_sunlight_and_earth_visibility" && r.request.adjustments.join(" ")).toMatch(/shortened/);
    expect(errCode(v("get_sunlight_and_earth_visibility", { useCurrentSite: true, start: "2030-12-31T22:30:00Z" }))).toBe("out_of_coverage");
  });

  it("rounds and clamps the timeline step to an integer 1–60", () => {
    const r = v("get_sun_earth_rise_set", { useCurrentSite: true, stepMinutes: 500 });
    expect(r.ok && r.request).toMatchObject({ stepMinutes: 60 });
    expect(v("get_sun_earth_rise_set", { useCurrentSite: true, stepMinutes: 2.6 }).ok).toBe(true);
    const d = v("get_sun_earth_rise_set", { useCurrentSite: true });
    expect(d.ok && d.request).toMatchObject({ stepMinutes: 10, startIso: "2027-03-02T06:00:00.000Z" });
  });

  it("validates compare_sites ids, count, uniqueness and the 'current' token", () => {
    expect(errCode(v("compare_sites", { siteIds: ["apollo-17"] }))).toBe("invalid_arguments");
    expect(errCode(v("compare_sites", { siteIds: ["a", "b", "c", "d"] }))).toBe("invalid_arguments");
    expect(errCode(v("compare_sites", { siteIds: ["a", "a"] }))).toBe("invalid_arguments");
    expect(errCode(v("compare_sites", { siteIds: ["a", "../b"] }))).toBe("invalid_arguments");
    const ok = v("compare_sites", { siteIds: ["current", "apollo-11"] });
    expect(ok.ok && ok.request).toMatchObject({ siteIds: ["apollo-17", "apollo-11"] });
    expect(errCode(v("compare_sites", { siteIds: ["current", "apollo-11"] }, ctxWithCustomSite))).toBe("invalid_arguments");
  });
});

describe("show_in_freeplay validation", () => {
  const run = (args: unknown) => validateToolCall("show_in_freeplay", args, ctxWithCatalogSite);

  it("accepts a whitelisted plan and normalises time", () => {
    const r = run({ screen: "orbit", time: "2027-03-02T06:00:00Z", layersOn: ["psr", "psr"], graphTab: "daily", playing: false });
    expect(r).toEqual({ ok: true, request: { tool: "show_in_freeplay", plan: { screen: "orbit", graphTab: "daily", playing: false, layersOn: ["psr"], timeIso: "2027-03-02T06:00:00.000Z" } } });
  });
  it("accepts a catalog id or a point, never both", () => {
    expect(run({ siteId: "apollo-17" }).ok).toBe(true);
    expect(run({ latDeg: -89.5, lonDeg: 129 }).ok).toBe(true);
    expect(run({ siteId: "apollo-17", latDeg: 1, lonDeg: 2 }).ok).toBe(false);
    expect(run({ latDeg: 95, lonDeg: 0 }).ok).toBe(false);
  });
  it("rejects empty plans, unknown keys, bad enums and out-of-coverage times", () => {
    expect(run({}).ok).toBe(false);
    expect(run({ url: "/x" }).ok).toBe(false);
    expect(run({ screen: "drive" }).ok).toBe(false);
    expect(run({ speed: 7 }).ok).toBe(false);
    expect(run({ layersOn: ["lava"] }).ok).toBe(false);
    expect(run({ layersOn: ["psr"], layersOff: ["psr"] }).ok).toBe(false);
    const late = run({ time: "2035-01-01T00:00:00Z" });
    expect(late).toMatchObject({ ok: false, error: { code: "out_of_coverage" } });
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { executeToolCall } from "@/lib/assistant/tools";
import { applyUiPlan, captureView, restoreView } from "@/lib/assistant/ui-actions";
import { turnNotices } from "@/lib/assistant/guards";
import { DEFAULT_START_ISO, useFreeplay } from "@/lib/freeplay-store";
import { useComparison } from "@/lib/comparison-store";
import { ctxWithCatalogSite } from "./helpers/assistant-fixtures";

const detail = { site: { id: "apollo-17", name: "Apollo 17", coordinates: { latDeg: 20.19, lonDeg: 30.77 }, coordsVerified: true } };

beforeEach(() => {
  useFreeplay.setState({ ...useFreeplay.getInitialState() });
  useComparison.setState({ ...useComparison.getInitialState() });
});

const savePreset = (name: string, latDeg: number, lonDeg: number) => {
  useFreeplay.getState().selectCustom(latDeg, lonDeg);
  useFreeplay.getState().saveCurrentSite(name);
  return useFreeplay.getState().savedSites.find((s) => s.name === name)!;
};

describe("show_in_freeplay execution", () => {
  it("resolves a catalog site, applies the plan, and reports a ui record (not a source)", async () => {
    const seen: string[] = [];
    const out = await executeToolCall({ name: "show_in_freeplay", args: { siteId: "apollo-17", screen: "globe" } }, "c1", ctxWithCatalogSite, {
      get: (async (path: string) => { seen.push(path); return detail; }) as never,
      applyUi: (plan, catalog) => { expect(plan.siteId).toBe("apollo-17"); expect(catalog?.latDeg).toBe(20.19); return { changes: ["Selected Apollo 17"] }; },
    });
    expect(seen).toEqual(["catalog/sites/apollo-17"]);
    expect(out.response).toMatchObject({ ok: true, applied: ["Selected Apollo 17"] });
    expect(out.record.ui?.changes).toEqual(["Selected Apollo 17"]);
    // A view change alone must not count as grounding for numeric claims.
    expect(turnNotices([out.record], "It is 72% sunlit.").length).toBeGreaterThan(0);
  });
  it("fails cleanly with no UI host", async () => {
    const out = await executeToolCall({ name: "show_in_freeplay", args: { screen: "orbit" } }, "c2", ctxWithCatalogSite, {});
    expect(out.response.ok).toBe(false);
  });
});

describe("applyUiPlan and restoreView", () => {
  it("changes screen, time and layers, then restores the prior view", () => {
    const before = captureView();
    const change = applyUiPlan({ graphTab: "yearly", timeIso: "2027-01-05T00:00:00.000Z", layersOn: ["psr"], point: { latDeg: -89.5, lonDeg: 129 } }, null);
    const s = useFreeplay.getState();
    expect(s.view).toBe("orbit");
    expect(s.graphTab).toBe("yearly");
    expect(s.startIso).toBe("2027-01-05T00:00:00.000Z");
    expect(s.layers.psr.on).toBe(true);
    expect(s.site?.latitudeDeg).toBe(-89.5);
    expect(s.focusNonce).toBe(1);
    expect(change.changes.length).toBeGreaterThan(3);
    restoreView(before);
    const r = useFreeplay.getState();
    expect([r.view, r.graphTab, r.startIso, r.layers.psr.on, r.site]).toEqual(["globe", "daily", DEFAULT_START_ISO, false, null]);
  });
  it("moves elapsed time inside the current window instead of resetting the start", () => {
    applyUiPlan({ timeIso: "2026-12-02T00:00:00.000Z" }, null);
    const s = useFreeplay.getState();
    expect(s.startIso).toBe(DEFAULT_START_ISO);
    expect(s.elapsedHours).toBe(24);
  });
  it("only builds a page link when a site is selected", () => {
    expect(applyUiPlan({ page: "drive" }, null).link).toBeUndefined();
    useFreeplay.getState().selectCustom(-85, 20);
    expect(applyUiPlan({ page: "drive" }, null).link?.href).toContain("/freeplay/drive");
  });

  it("selects a saved preset, sets its radius and duration, and restores both", () => {
    const preset = savePreset("Ridge camp", -89.1, 120.5);
    const before = captureView();
    const change = applyUiPlan({ savedSiteId: preset.id, radiusKm: 25, durationHours: 48 }, null);
    const s = useFreeplay.getState();
    expect(s.site?.id).toBe(preset.id);
    expect(s.site?.radiusKm).toBe(25);
    expect(s.durationHours).toBe(48);
    expect(change.changes.join(" ")).toMatch(/Ridge camp/);
    restoreView(before);
    expect(useFreeplay.getState().durationHours).not.toBe(48);
    expect(useFreeplay.getState().site?.id).toBe(preset.id);
  });

  it("opens the launch planner and applies its settings", () => {
    const change = applyUiPlan({ launchTimeIso: "2027-04-01T00:00:00.000Z", trajectoryType: "low-energy", payloadKg: 1200, ispS: 320, showArtemisReference: true }, null);
    const s = useFreeplay.getState();
    expect(s.view).toBe("launch");
    expect([s.launchIso, s.trajectoryType, s.payloadKg, s.ispS, s.showArtemisReference]).toEqual(["2027-04-01T00:00:00.000Z", "low-energy", 1200, 320, true]);
    expect(change.changes.join(" ")).toMatch(/Low-energy transfer/);
  });

  it("selects a meteor stream and panel assumptions", () => {
    applyUiPlan({ meteorStream: "Perseids", panelAreaM2: 3.5, panelEfficiency: 0.22 }, null);
    const s = useFreeplay.getState();
    expect(s.view).toBe("globe");
    expect([s.meteorStream, s.panelAreaM2, s.panelEfficiency]).toEqual(["Perseids", 3.5, 0.22]);
  });

  it("fills comparison slots, graph focus and metric rows, then restores them", () => {
    const a = savePreset("Site A", -89.1, 120.5);
    const b = savePreset("Site B", -88.4, 60.2);
    const before = captureView();
    const change = applyUiPlan({ compareSiteA: a.id, compareSiteB: b.id, compareGraph: "power", compareMetrics: ["sunlightPct", "energyKWh"] }, null);
    const c = useComparison.getState();
    expect(useFreeplay.getState().view).toBe("compare");
    expect([c.slotA?.id, c.slotB?.id]).toEqual([a.id, b.id]);
    expect(c.graphFocus).toBe("power");
    expect(c.metrics).toEqual(["sunlightPct", "energyKWh"]);
    expect(change.changes.join(" ")).toMatch(/Comparison site A/);
    restoreView(before);
    const r = useComparison.getState();
    expect([r.slotA, r.slotB, r.graphFocus]).toEqual([null, null, "sunlight"]);
  });
});

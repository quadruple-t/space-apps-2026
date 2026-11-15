import { beforeEach, describe, expect, it } from "vitest";
import { executeToolCall } from "@/lib/assistant/tools";
import { applyUiPlan, captureView, restoreView } from "@/lib/assistant/ui-actions";
import { turnNotices } from "@/lib/assistant/guards";
import { DEFAULT_START_ISO, useFreeplay } from "@/lib/freeplay-store";
import { ctxWithCatalogSite } from "./helpers/assistant-fixtures";

const detail = { site: { id: "apollo-17", name: "Apollo 17", coordinates: { latDeg: 20.19, lonDeg: 30.77 }, coordsVerified: true } };

beforeEach(() => useFreeplay.setState({ ...useFreeplay.getInitialState() }));

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
});

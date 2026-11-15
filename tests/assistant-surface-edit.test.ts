import { describe, expect, it } from "vitest";
import { applySurfaceEdit, resolveTarget, type SurfaceCheck } from "@/lib/assistant/surface-edit";
import { executeToolCall } from "@/lib/assistant/tools";
import { validateToolCall, type SurfacePlan } from "@/lib/assistant/tool-validation";
import type { Placement } from "@/lib/drive-placements";
import { ctxWithCatalogSite } from "./helpers/assistant-fixtures";

const labels = { solar: "Solar panel array", rover: "Lunar buggy", dome: "Habitat", modules: "Base · modular outpost", inflatable: "Base · inflatable habitat", comms: "Comms mast" };
const p = (id: string, type: Placement["type"], eastM: number, northM: number): Placement => ({ id, type, eastM, northM, headingDeg: 0 });
let n = 0;
const env = (check: SurfaceCheck = () => ({ ok: true, reason: null })) => ({ labels, check, newId: (t: string) => `${t}-new${++n}` });
const valid = (args: unknown): SurfacePlan => {
  const r = validateToolCall("edit_surface_setup", args, ctxWithCatalogSite);
  if (!r.ok || r.request.tool !== "edit_surface_setup") throw new Error(r.ok ? "wrong tool" : r.error.message);
  return r.request.plan;
};
const invalid = (args: unknown) => { const r = validateToolCall("edit_surface_setup", args, ctxWithCatalogSite); return r.ok ? null : r.error.message; };

describe("edit_surface_setup validation", () => {
  it("accepts a batch and normalises numbers", () => {
    const plan = valid({ operations: [{ action: "place", type: "solar", eastM: 10.04, northM: -20, headingDeg: 370 }, { action: "remove", target: "Habitat 1" }] });
    expect(plan.operations).toEqual([
      { action: "place", type: "solar", eastM: 10, northM: -20, headingDeg: 10 },
      { action: "remove", target: "Habitat 1" },
    ]);
  });
  it("treats 0 as a real coordinate and ignores empty placeholders", () => {
    const plan = valid({ operations: [{ action: "place", type: "comms", eastM: 0, northM: 0, target: "", headingDeg: null }], goTo: "" });
    expect(plan.operations).toEqual([{ action: "place", type: "comms", eastM: 0, northM: 0, headingDeg: 0 }]);
  });
  it("rejects unknown types, actions, fields and out-of-range values", () => {
    expect(invalid({ operations: [{ action: "place", type: "reactor", eastM: 1, northM: 1 }] })).toMatch(/type/);
    expect(invalid({ operations: [{ action: "teleport" }] })).toMatch(/action/);
    expect(invalid({ operations: [{ action: "remove", target: "Habitat 1", eastM: 3 }] })).toMatch(/does not take/);
    expect(invalid({ operations: [{ action: "place", type: "solar", eastM: 1e9, northM: 0 }] })).toMatch(/within/);
    expect(invalid({ operations: [{ action: "place", type: "solar", eastM: 1 }] })).toMatch(/northM/);
    expect(invalid({ operations: [{ action: "move", target: "Habitat 1", eastM: 5 }] })).toMatch(/both eastM and northM/);
    expect(invalid({ operations: [{ action: "move", target: "Habitat 1" }] })).toMatch(/needs a new/);
    expect(invalid({ operations: [] })).toMatch(/1 to 12/);
    expect(invalid({ operations: Array.from({ length: 13 }, () => ({ action: "remove", target: "x" })) })).toMatch(/1 to 12/);
    expect(invalid({ viewMode: "orbit" })).toMatch(/viewMode/);
    expect(invalid({ drop: true })).toMatch(/Unknown argument/);
    expect(invalid({})).toMatch(/at least one/);
    expect(invalid({ goTo: "<script>" })).toMatch(/goTo/);
  });
  it("allows rotate-only moves, view mode and clearAll followed by places only", () => {
    expect(valid({ operations: [{ action: "move", target: "Lunar buggy 1", headingDeg: 90 }] }).operations).toEqual([{ action: "move", target: "Lunar buggy 1", headingDeg: 90 }]);
    expect(valid({ viewMode: "birds-eye" })).toEqual({ viewMode: "birds-eye" });
    expect(valid({ clearAll: true, operations: [{ action: "place", type: "dome", eastM: 5, northM: 5 }] }).clearAll).toBe(true);
    expect(invalid({ clearAll: true, operations: [{ action: "remove", target: "x" }] })).toMatch(/clearAll/);
  });
});

describe("applySurfaceEdit", () => {
  const start = [p("a", "solar", 0, 0), p("b", "solar", 30, 0), p("c", "dome", -30, 10)];
  it("labels objects like the setup context and resolves bare unique types", () => {
    expect(resolveTarget(labels, start, "Solar panel array 2")?.id).toBe("b");
    expect(resolveTarget(labels, start, "habitat")?.id).toBe("c");
    expect(resolveTarget(labels, start, "solar panel array")).toBeNull();
    expect(resolveTarget(labels, start, "Comms mast 1")).toBeNull();
  });
  it("places, moves, rotates and removes in one batch, resolving labels against the original list", () => {
    const r = applySurfaceEdit(start, valid({ operations: [
      { action: "remove", target: "Solar panel array 1" },
      { action: "move", target: "Solar panel array 2", eastM: 50, northM: 5, headingDeg: 45 },
      { action: "move", target: "Habitat 1", headingDeg: 180 },
      { action: "place", type: "comms", eastM: 12, northM: -8 },
    ] }), env());
    expect(r.list.map((x) => x.id)).toEqual(["b", "c", "comms-new" + n]);
    expect(r.list[0]).toMatchObject({ eastM: 50, northM: 5, headingDeg: 45 });
    expect(r.list[1].headingDeg).toBe(180);
    expect(r.changes.some((c) => c.startsWith("Could not"))).toBe(false);
    expect(r.listChanged).toBe(true);
  });
  it("reports refusals from the placement rules and leaves those objects alone", () => {
    const check: SurfaceCheck = (_o, _t, e) => (e > 100 ? { ok: false, reason: "Outside the walls" } : { ok: true, reason: null });
    const r = applySurfaceEdit(start, valid({ operations: [
      { action: "place", type: "solar", eastM: 500, northM: 0 },
      { action: "move", target: "Habitat 1", eastM: 900, northM: 0 },
      { action: "remove", target: "Rover 9" },
    ] }), env(check));
    expect(r.list).toEqual(start);
    expect(r.listChanged).toBe(false);
    expect(r.changes).toHaveLength(3);
    expect(r.changes.every((c) => c.startsWith("Could not"))).toBe(true);
    expect(r.changes[0]).toContain("Outside the walls");
  });
  it("checks a moved object against the others, not itself", () => {
    const seen: number[] = [];
    applySurfaceEdit(start, valid({ operations: [{ action: "move", target: "Solar panel array 1", eastM: 1, northM: 1 }] }), env((others) => { seen.push(others.length); return { ok: true, reason: null }; }));
    expect(seen).toEqual([2]);
  });
  it("clears first, then places, and handles view mode and goTo", () => {
    const r = applySurfaceEdit(start, valid({ clearAll: true, operations: [{ action: "place", type: "dome", eastM: 1, northM: 1 }], viewMode: "first-person" }), env());
    expect(r.list).toHaveLength(1);
    expect(r.viewMode).toBe("first-person");
    const g = applySurfaceEdit(start, valid({ goTo: "Habitat 1" }), env());
    expect(g.goToId).toBe("c");
    expect(g.listChanged).toBe(false);
    expect(applySurfaceEdit(start, valid({ goTo: "Comms mast 1" }), env()).changes[0]).toMatch(/^Could not go to/);
  });
  it("stops at the placement cap", () => {
    const full = Array.from({ length: 60 }, (_, i) => p(`x${i}`, "rover", i, 0));
    const r = applySurfaceEdit(full, valid({ operations: [{ action: "place", type: "solar", eastM: 1, northM: 1 }] }), env());
    expect(r.list).toHaveLength(60);
    expect(r.changes[0]).toMatch(/at most 60/);
  });
});

describe("edit_surface_setup execution", () => {
  const plan = { operations: [{ action: "place", type: "solar", eastM: 3, northM: 4 }] };
  it("applies through the bridge and reports a ui record that is not a source", async () => {
    const out = await executeToolCall({ name: "edit_surface_setup", args: plan }, "c1", ctxWithCatalogSite, { applySurface: () => ({ changes: ["Placed Solar panel array at 3 m E, 4 m N"] }) });
    expect(out.response).toMatchObject({ ok: true, tool: "edit_surface_setup", applied: ["Placed Solar panel array at 3 m E, 4 m N"] });
    expect(out.record.ui?.changes).toHaveLength(1);
  });
  it("fails cleanly when the drive is not open", async () => {
    const none = await executeToolCall({ name: "edit_surface_setup", args: plan }, "c2", ctxWithCatalogSite, { applySurface: () => null });
    expect(none.record.ok).toBe(false);
    expect(none.record.error).toMatch(/not open|Surface drive|surface drive/);
    expect((await executeToolCall({ name: "edit_surface_setup", args: plan }, "c3", ctxWithCatalogSite, {})).record.ok).toBe(false);
  });
});

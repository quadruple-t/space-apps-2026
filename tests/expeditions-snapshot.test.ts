import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE,
  captureWorkspace,
  draftHasContent,
  emptyDraft,
  migrateLegacyFreeplay,
  sanitizeDraft,
  sanitizeSites,
  sanitizeWorkspace,
  serializeChat,
  toStorableJson,
  workspaceToStorePatch,
} from "@/lib/expeditions/snapshot";
import { EXPEDITION_LIMITS } from "@/lib/expeditions/types";
import {
  expeditionFromData,
  expeditionPatchToData,
  newExpeditionToData,
  studyFromData,
  studyToData,
} from "@/lib/firestore/userConverters";
import { COVERAGE_START_ISO, useFreeplay } from "@/lib/freeplay-store";

const site = { id: "saved-1", name: "Rim", latitudeDeg: -89.4, longitudeDeg: 222.7, radiusKm: 5, coordinateReference: "MOON_ME", provenance: "user", kind: "saved" } as const;

describe("workspace capture and restore", () => {
  it("round-trips through the Open Exploration store without transient fields", () => {
    const ws = captureWorkspace(useFreeplay.getState());
    expect(ws).toEqual(DEFAULT_WORKSPACE);
    expect(ws).not.toHaveProperty("playing");
    expect(ws).not.toHaveProperty("focusNonce");
    const changed = { ...ws, view: "orbit" as const, elapsedHours: 12, layers: { ...ws.layers, psr: { on: true, opacity: 0.5 } } };
    useFreeplay.setState({ ...workspaceToStorePatch(changed, [site]), playing: true });
    useFreeplay.setState(workspaceToStorePatch(changed, [site]));
    const s = useFreeplay.getState();
    expect(captureWorkspace(s)).toEqual(changed);
    expect(s.savedSites).toEqual([site]);
    expect(s.playing).toBe(false);
  });

  it("does not autosave an unfinished custom site but does save an intentionally used one", () => {
    useFreeplay.setState(workspaceToStorePatch(DEFAULT_WORKSPACE, []));
    useFreeplay.getState().selectCustom(-85, 123);
    expect(captureWorkspace(useFreeplay.getState()).site).toBeNull();
    useFreeplay.getState().setCalloutOpen(false);
    expect(captureWorkspace(useFreeplay.getState()).site).toBeNull();
    useFreeplay.getState().selectCustom(-85, 123);
    useFreeplay.getState().setView("orbit");
    expect(captureWorkspace(useFreeplay.getState()).site?.latitudeDeg).toBe(-85);
    expect(sanitizeWorkspace({ ...captureWorkspace(useFreeplay.getState()), view: "compare" }).view).toBe("compare");
    useFreeplay.setState(workspaceToStorePatch(DEFAULT_WORKSPACE, []));
  });
});

describe("sanitizers", () => {
  it("degrades a corrupt workspace to defaults and clamps values", () => {
    expect(sanitizeWorkspace(null)).toEqual(DEFAULT_WORKSPACE);
    const ws = sanitizeWorkspace({ view: "moon", startIso: "1969-07-20T00:00:00Z", durationHours: -5, elapsedHours: 99, speed: 7, layers: { psr: { on: true, opacity: 4 }, bogus: { on: true } }, panelEfficiency: 3 });
    expect(ws.view).toBe("globe");
    expect(ws.startIso).toBe(COVERAGE_START_ISO);
    expect(ws.durationHours).toBe(1);
    expect(ws.elapsedHours).toBe(1);
    expect(ws.speed).toBe(DEFAULT_WORKSPACE.speed);
    expect(ws.layers.psr).toEqual({ on: true, opacity: 1 });
    expect(ws.layers).not.toHaveProperty("bogus");
    expect(ws.panelEfficiency).toBe(1);
  });
  it("drops invalid and duplicate sites and caps the list", () => {
    const sites = sanitizeSites([site, site, { name: "no coords" }, { ...site, id: "x", latitudeDeg: 120 }, ...Array.from({ length: 80 }, (_, i) => ({ ...site, id: `s${i}` }))]);
    expect(sites[0]).toEqual(site);
    expect(sites).toHaveLength(EXPEDITION_LIMITS.sites);
    expect(new Set(sites.map((s) => s.id)).size).toBe(sites.length);
  });
  it("returns an empty draft for garbage", () => {
    expect(sanitizeDraft("nope").sites).toEqual([]);
    expect(sanitizeDraft({ chat: [{ role: "system", text: "x" }, { role: "user", text: "hi" }] }).chat).toEqual([{ role: "user", text: "hi" }]);
  });
});

describe("draft content and legacy migration", () => {
  it("only offers to save drafts with real work in them", () => {
    expect(draftHasContent(emptyDraft())).toBe(false);
    expect(draftHasContent({ ...emptyDraft(), workspace: { ...DEFAULT_WORKSPACE, elapsedHours: 30 } })).toBe(false);
    expect(draftHasContent({ ...emptyDraft(), sites: [site] })).toBe(true);
    expect(draftHasContent({ ...emptyDraft(), notes: "ice" })).toBe(true);
    expect(draftHasContent({ ...emptyDraft(), workspace: { ...DEFAULT_WORKSPACE, view: "orbit" } })).toBe(true);
  });
  it("folds lunaris360-freeplay-v1 saved sites and panel settings into the draft", () => {
    const d = migrateLegacyFreeplay({ savedSites: [site], panelAreaM2: 4, panelEfficiency: 0.22 }, emptyDraft());
    expect(d.sites).toEqual([site]);
    expect(d.workspace.panelAreaM2).toBe(4);
    expect(d.workspace.panelEfficiency).toBe(0.22);
    const unchanged = emptyDraft(d.updatedAt);
    expect(migrateLegacyFreeplay("bad", unchanged)).toEqual(unchanged);
  });
});

describe("chat serialisation", () => {
  it("drops undo snapshots, on-screen changes and internal records but keeps horizon labels", () => {
    const record = { id: "r1", tool: "get_visibility", label: "Visibility", ok: true, site: "Shackleton", horizonKind: "smooth-sphere", horizonLabel: "Smooth-sphere fallback (upper bound)", dataRange: "Dec 2026", mustSay: ["Shares are upper bounds."] };
    const out = serializeChat([
      { role: "user", text: "Is Shackleton lit?", answered: true },
      { role: "model", text: "Mostly.", records: [record, { ...record, id: "r2", internal: true }, { ...record, id: "r3", ui: { changes: [] } }], viewBefore: {}, viewChanges: [{ changes: ["x"] }] } as never,
    ]);
    expect(out[1]).toEqual({ role: "model", text: "Mostly.", records: [{ tool: "get_visibility", label: "Visibility", ok: true, site: "Shackleton", horizonKind: "smooth-sphere", horizonLabel: "Smooth-sphere fallback (upper bound)", dataRange: "Dec 2026", mustSay: ["Shares are upper bounds."] }] });
    expect(out[1]).not.toHaveProperty("viewBefore");
  });
  it("keeps only the most recent messages", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ role: "user" as const, text: `m${i}` }));
    const out = serializeChat(many);
    expect(out).toHaveLength(EXPEDITION_LIMITS.chatMessages);
    expect(out.at(-1)?.text).toBe("m59");
  });
});

describe("Firestore write builders", () => {
  it("whitelists expedition keys and validates names", () => {
    const data = newExpeditionToData("  South pole  ", { notes: "", workspace: DEFAULT_WORKSPACE, sites: [site] });
    expect(Object.keys(data).sort()).toEqual(["createdAt", "lastOpenedAt", "name", "notes", "sites", "updatedAt", "version", "workspace"]);
    expect(data.name).toBe("South pole");
    expect(() => newExpeditionToData(" ", { notes: "", workspace: DEFAULT_WORKSPACE, sites: [] })).toThrow();
    expect(() => expeditionPatchToData({ notes: "x".repeat(EXPEDITION_LIMITS.notesChars + 1) })).toThrow();
    expect(Object.keys(expeditionPatchToData({ workspace: DEFAULT_WORKSPACE })).sort()).toEqual(["updatedAt", "version", "workspace"]);
  });
  it("reads back a damaged expedition without throwing", () => {
    const e = expeditionFromData("e1", { name: 5, workspace: "x", sites: "y" });
    expect(e.name).toBe("Untitled expedition");
    expect(e.workspace).toEqual(DEFAULT_WORKSPACE);
    expect(e.sites).toEqual([]);
  });
  it("stores studies with their horizon-source labels intact", () => {
    const result = { sites: [{ siteId: "a", result: { sunlightPercent: 81, horizonSource: "Smooth-sphere fallback", assumptions: ["Upper bound: no terrain"], extra: undefined } }] };
    const data = studyToData({ kind: "comparison", source: "compare-page", label: "A vs B", inputs: { siteIds: ["a", "b"] }, result });
    expect(data.result).toEqual({ sites: [{ siteId: "a", result: { sunlightPercent: 81, horizonSource: "Smooth-sphere fallback", assumptions: ["Upper bound: no terrain"] } }] });
    const back = studyFromData("s1", { ...data, createdAt: "2026-11-15T00:00:00.000Z" });
    expect(back?.result).toEqual(data.result);
    expect(() => studyToData({ kind: "comparison", source: "compare-page", label: "big", inputs: {}, result: { blob: "x".repeat(EXPEDITION_LIMITS.studyJsonChars) } })).toThrow();
  });
  it("refuses nested arrays Firestore cannot store", () => {
    expect(toStorableJson({ grid: [[1, 2]] })).toBeNull();
    expect(toStorableJson({ rows: [{ cells: [1, 2] }] })).toEqual({ rows: [{ cells: [1, 2] }] });
  });
});

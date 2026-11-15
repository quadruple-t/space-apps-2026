import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave } from "@/lib/expeditions/autosave";
import { DRAFT_KEY, LEGACY_FREEPLAY_KEY, loadDraft, patchDraft, resetDraftMemory } from "@/lib/expeditions/draft-storage";

describe("createAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (initial: { v: number; playing?: boolean; enabled?: boolean }) => {
    const state = { playing: false, enabled: true, ...initial };
    const write = vi.fn(async () => undefined);
    const statuses: string[] = [];
    const a = createAutosave<{ v: number }>({
      read: () => (state.enabled ? { v: state.v } : null),
      key: (x) => String(x.v),
      paused: () => state.playing,
      write,
      onStatus: (s) => statuses.push(s),
      delayMs: 1000,
    });
    return { state, write, statuses, a };
  };

  it("debounces bursts of changes into one write", async () => {
    const { state, write, a } = setup({ v: 1 });
    a.markSaved();
    for (let i = 2; i <= 5; i++) { state.v = i; a.notify(); vi.advanceTimersByTime(300); }
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ v: 5 });
  });

  it("does not write while the clock is playing, then saves once paused", async () => {
    const { state, write, a } = setup({ v: 1 });
    a.markSaved();
    state.playing = true;
    for (let i = 2; i < 50; i++) { state.v = i; a.notify(); await vi.advanceTimersByTimeAsync(500); }
    expect(write).not.toHaveBeenCalled();
    state.playing = false;
    a.notify();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("skips writes when nothing changed or nothing should be saved (guided mode / detached)", async () => {
    const { state, write, a } = setup({ v: 1 });
    a.markSaved();
    a.notify();
    await vi.advanceTimersByTimeAsync(2000);
    state.enabled = false;
    state.v = 9;
    a.notify();
    await vi.advanceTimersByTimeAsync(2000);
    await a.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("flush writes immediately, and a failed write is retried on the next change", async () => {
    const { state, write, statuses, a } = setup({ v: 1 });
    write.mockRejectedValueOnce(new Error("offline"));
    await a.flush();
    expect(statuses).toEqual(["saving", "error"]);
    a.notify();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe("saved");
    state.v = 2;
    await a.flush();
    expect(write).toHaveBeenLastCalledWith({ v: 2 });
  });
});

describe("draft storage", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    resetDraftMemory();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("migrates the legacy Freeplay key once and removes it", () => {
    store.set(LEGACY_FREEPLAY_KEY, JSON.stringify({ savedSites: [{ id: "saved-1", name: "Rim", latitudeDeg: -89, longitudeDeg: 10, radiusKm: 5 }], panelAreaM2: 3 }));
    const draft = loadDraft();
    expect(draft.sites.map((s) => s.name)).toEqual(["Rim"]);
    expect(draft.workspace.panelAreaM2).toBe(3);
    expect(store.has(LEGACY_FREEPLAY_KEY)).toBe(false);
    expect(JSON.parse(store.get(DRAFT_KEY)!).sites).toHaveLength(1);
    resetDraftMemory();
    expect(loadDraft().sites).toHaveLength(1);
  });

  it("recovers from a corrupt draft", () => {
    store.set(DRAFT_KEY, "{not json");
    expect(loadDraft().sites).toEqual([]);
  });

  it("keeps working in memory when storage is blocked", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => undefined } });
    patchDraft({ notes: "ice first" });
    expect(loadDraft().notes).toBe("ice first");
  });
});

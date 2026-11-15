import { describe, expect, it, vi } from "vitest";
import { runTurn, type ChatLike } from "@/lib/assistant/agent-loop";
import { FALLBACK_WORDING, MAX_CALLS_PER_ROUND, MAX_TOOL_ROUNDS, TOOL_LIMIT_WORDING, UNGROUNDED_WORDING, failureWording } from "@/lib/assistant/constants";
import { capHistory, createRateLimiter, createWatchdog, normalizeInput, turnNotices } from "@/lib/assistant/guards";
import { shapeMetrics } from "@/lib/assistant/tool-results";
import type { ToolOutcome } from "@/lib/assistant/tool-results";
import { executeToolCall, type ScienceGet } from "@/lib/assistant/tools";
import { ctxWithCatalogSite, metricsApi } from "./helpers/assistant-fixtures";

type Step = { text?: string; calls?: { name: string; args?: object; id?: string }[] };

/** A mock model: each sendMessageStream pops the next scripted step. */
function mockModel(steps: Step[]) {
  const requests: unknown[] = [];
  const chat: ChatLike = {
    async sendMessageStream(request) {
      requests.push(request);
      const step = steps[Math.min(requests.length - 1, steps.length - 1)];
      return {
        stream: (async function* () { for (const piece of (step.text ?? "").match(/.{1,6}/g) ?? []) yield { text: () => piece }; })(),
        response: Promise.resolve({ functionCalls: () => step.calls?.map((c) => ({ args: {}, ...c })) }),
      };
    },
  };
  return { chat, requests };
}

const okOutcome = (id: string): ToolOutcome => shapeMetrics(id, "Apollo 17", metricsApi("LOLA DEM"), []);

describe("runTurn", () => {
  it("streams a plain answer with no tools", async () => {
    const { chat } = mockModel([{ text: "Hello there" }]);
    const chunks: string[] = [];
    const r = await runTurn({ chat, userText: "hi", ctx: ctxWithCatalogSite, events: { onText: (t) => chunks.push(t) } });
    expect(r).toMatchObject({ text: "Hello there", rounds: 0, toolLimitHit: false, records: [] });
    expect(chunks.at(-1)).toBe("Hello there");
  });

  it("executes a requested tool, returns a functionResponse, and keeps the final text", async () => {
    const { chat, requests } = mockModel([{ calls: [{ name: "get_sunlight_and_earth_visibility", args: { useCurrentSite: true }, id: "f1" }] }, { text: "72% sunlit." }]);
    const execute = vi.fn(async (_c: unknown, id: string) => okOutcome(id));
    const started: string[] = [];
    const r = await runTurn({ chat, userText: "q", ctx: ctxWithCatalogSite, execute, events: { onToolStart: (l) => started.push(l) } });
    expect(r.text).toBe("72% sunlit.");
    expect(r.rounds).toBe(1);
    expect(r.records).toHaveLength(1);
    expect(started).toEqual(["Checking sunlight and Earth visibility…"]);
    expect(requests[1]).toMatchObject([{ type: "functionResponse", functionResponse: { name: "get_sunlight_and_earth_visibility", id: "f1", response: { ok: true } } }]);
  });

  it("caps tool rounds per turn and stops asking the model after the cap", async () => {
    const { chat, requests } = mockModel([{ calls: [{ name: "list_story_chapters" }] }]); // the model never stops calling tools
    const execute = vi.fn(async (_c: unknown, id: string) => okOutcome(id));
    const r = await runTurn({ chat, userText: "q", ctx: ctxWithCatalogSite, execute });
    expect(MAX_TOOL_ROUNDS).toBe(4);
    expect(execute).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(requests).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(r).toMatchObject({ toolLimitHit: true, rounds: MAX_TOOL_ROUNDS, text: TOOL_LIMIT_WORDING });
    expect(turnNotices(r.records, r.text, { toolLimitHit: true })).toContain(TOOL_LIMIT_WORDING);
  });

  it("bounds parallel calls within one round", async () => {
    const calls = Array.from({ length: MAX_CALLS_PER_ROUND + 3 }, () => ({ name: "list_story_chapters" }));
    const { chat, requests } = mockModel([{ calls }, { text: "done" }]);
    const execute = vi.fn(async (_c: unknown, id: string) => okOutcome(id));
    await runTurn({ chat, userText: "q", ctx: ctxWithCatalogSite, execute });
    expect(execute).toHaveBeenCalledTimes(MAX_CALLS_PER_ROUND);
    const responses = requests[1] as { functionResponse: { response: { ok: boolean; error?: { message: string } } } }[];
    expect(responses).toHaveLength(MAX_CALLS_PER_ROUND + 3);
    expect(responses.at(-1)!.functionResponse.response).toMatchObject({ ok: false, error: { message: expect.stringMatching(/Too many tool calls/) } });
  });

  it("answers an unknown tool name with an error response instead of executing anything", async () => {
    const { chat, requests } = mockModel([{ calls: [{ name: "drop_database", args: { x: 1 } }] }, { text: "I can't do that." }]);
    const get = vi.fn() as unknown as ScienceGet;
    const r = await runTurn({ chat, userText: "q", ctx: ctxWithCatalogSite, execute: (c, id, ctx, deps) => executeToolCall(c, id, ctx, { ...deps, get }) });
    expect(get).not.toHaveBeenCalled();
    expect(r.records[0]).toMatchObject({ tool: "unknown", ok: false });
    expect(requests[1]).toMatchObject([{ functionResponse: { name: "drop_database", response: { ok: false, error: { code: "unknown_tool" } } } }]);
  });

  it("drops preamble streamed before a tool call", async () => {
    const { chat } = mockModel([{ text: "Let me check.", calls: [{ name: "list_story_chapters" }] }, { text: "Final." }]);
    const texts: string[] = [];
    const r = await runTurn({ chat, userText: "q", ctx: ctxWithCatalogSite, execute: async (_c, id) => okOutcome(id), events: { onText: (t) => texts.push(t) } });
    expect(r.text).toBe("Final.");
    expect(texts).toContain("");
  });

  it("stops when aborted", async () => {
    const { chat } = mockModel([{ calls: [{ name: "list_story_chapters" }] }]);
    const ctl = new AbortController();
    await expect(runTurn({ chat, userText: "q", ctx: ctxWithCatalogSite, signal: ctl.signal, execute: async (_c, id) => { ctl.abort(); return okOutcome(id); } })).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("required wording from a whole turn", () => {
  it("a fallback-horizon lookup produces the upper-bound notice", async () => {
    const get = (async () => metricsApi("none — smooth horizon")) as unknown as ScienceGet;
    const { chat } = mockModel([{ calls: [{ name: "get_sunlight_and_earth_visibility", args: { latDeg: -30, lonDeg: 10 } }] }, { text: "About 70%." }]);
    const r = await runTurn({ chat, userText: "q", ctx: ctxWithCatalogSite, execute: (c, id, ctx, deps) => executeToolCall(c, id, ctx, { ...deps, get }) });
    expect(turnNotices(r.records, r.text)).toEqual([FALLBACK_WORDING]);
  });

  it("a tool failure produces the plain failure notice and no ungrounded warning when no number is claimed", async () => {
    const { ScienceApiError } = await import("@/integrations/science/api-provider");
    const get = (async () => { throw new ScienceApiError("Data service unavailable", 503); }) as unknown as ScienceGet;
    const { chat } = mockModel([{ calls: [{ name: "get_sun_earth_position", args: { useCurrentSite: true } }] }, { text: "I couldn't get that." }]);
    const r = await runTurn({ chat, userText: "q", ctx: ctxWithCatalogSite, execute: (c, id, ctx, deps) => executeToolCall(c, id, ctx, { ...deps, get }) });
    expect(turnNotices(r.records, r.text)).toEqual([failureWording("Data service unavailable")]);
  });

  it("warns when numbers are stated without any successful lookup", () => {
    expect(turnNotices([], "The Sun is up about 14 hours a day there.")).toEqual([UNGROUNDED_WORDING]);
    expect(turnNotices([], "Pick a site on the globe first.")).toEqual([]);
  });
});

describe("abuse and cost controls", () => {
  it("caps and cleans input", () => {
    expect(normalizeInput("   ")).toBeNull();
    expect(normalizeInput("a\u0000b")).toBe("ab");
    expect(normalizeInput("x".repeat(900))).toHaveLength(500);
  });

  it("caps history to recent text, starting with a user turn", () => {
    const msgs = Array.from({ length: 14 }, (_, i) => ({ role: (i % 2 ? "model" : "user") as "user" | "model", text: "t".repeat(3000) + i }));
    const h = capHistory(msgs);
    expect(h.length).toBeLessThanOrEqual(8);
    expect(h[0].role).toBe("user");
    expect(h.every((m) => m.text.length <= 1500)).toBe(true);
    expect(capHistory([{ role: "model", text: "orphan" }])).toEqual([]);
  });

  it("rate limits bursts and windows", () => {
    let t = 0;
    const rl = createRateLimiter({ minIntervalMs: 1000, windowMs: 10_000, maxInWindow: 3, now: () => t });
    expect(rl.attempt().ok).toBe(true);
    t = 500;
    expect(rl.attempt()).toMatchObject({ ok: false, reason: "too-fast", retryInMs: 500 });
    t = 1500; expect(rl.attempt().ok).toBe(true);
    t = 3000; expect(rl.attempt().ok).toBe(true);
    t = 5000; expect(rl.attempt()).toMatchObject({ ok: false, reason: "too-many" });
    t = 11_000; expect(rl.attempt().ok).toBe(true);
  });
});

describe("inactivity watchdog", () => {
  it("fires once after a quiet period and is reset by progress", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const w = createWatchdog(1000, onTimeout);
    vi.advanceTimersByTime(900); w.poke();
    vi.advanceTimersByTime(900); expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200); expect(onTimeout).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000); expect(onTimeout).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not fire after stop()", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    createWatchdog(1000, onTimeout).stop();
    vi.advanceTimersByTime(5000);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("reports request and response diagnostics from the turn loop", async () => {
    const { chat } = mockModel([{ calls: [{ name: "list_story_chapters" }] }, { text: "ok" }]);
    const log: string[] = [];
    await runTurn({ chat, userText: "q", ctx: ctxWithCatalogSite, execute: async (_c, id) => okOutcome(id), events: { onRequest: (r) => log.push(`req${r}`), onResponse: (i) => log.push(`res${i.round}:${i.functionCalls.join("+")}`) } });
    expect(log).toEqual(["req0", "res0:list_story_chapters", "req1", "res1:"]);
  });
});

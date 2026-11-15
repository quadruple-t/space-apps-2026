import { describe, expect, it } from "vitest";
import { useAssistant } from "@/lib/assistant/assistant-store";
import type { ToolOutcome } from "@/lib/assistant/tool-results";
import { studyFromOutcome } from "@/lib/expeditions/mission-control-studies";
import { serializeChat } from "@/lib/expeditions/snapshot";

const record = (tool: string, ok = true) => ({
  id: "c1", tool, label: "x", ok, site: "Shackleton, Haworth", horizonKind: "smooth-sphere-fallback", horizonLabel: "Smooth-sphere fallback", dataRange: "1 Dec 2026, 3 windows of 709 h", mustSay: ["Shares are upper bounds."],
}) as ToolOutcome["record"];

describe("studyFromOutcome", () => {
  it("keeps a ranking's shaped response, including upper-bound flags and required wording", () => {
    const response = { ok: true, tool: "rank_sites", data: { sites: [{ siteId: "a", sharesAreUpperBounds: true, horizon: "smooth-sphere-fallback" }], recommendedPick: { siteId: "a" } }, mustSay: ["Shares are upper bounds."] };
    const study = studyFromOutcome({ weights: { sunlight: 8 } }, { record: record("rank_sites"), response });
    expect(study).toMatchObject({ kind: "ranking", source: "mission-control", label: "Ranking · 1 Dec 2026, 3 windows of 709 h" });
    expect(study?.result).toEqual(response);
    expect(study?.inputs).toEqual({ args: { weights: { sunlight: 8 } }, dataRange: "1 Dec 2026, 3 windows of 709 h" });
  });
  it("makes comparisons from compare_sites and ignores other tools and failures", () => {
    expect(studyFromOutcome({}, { record: record("compare_sites"), response: { ok: true } })?.kind).toBe("comparison");
    expect(studyFromOutcome({}, { record: record("get_horizon_profile"), response: { ok: true } })).toBeNull();
    expect(studyFromOutcome({}, { record: record("rank_sites", false), response: { ok: false } })).toBeNull();
  });
});

describe("assistant transcript restore", () => {
  it("restores saved messages without undo and treats unknown horizon kinds as unrecognised", () => {
    useAssistant.getState().loadTranscript([
      { role: "user", text: "Rank the south pole sites", answered: true },
      { role: "model", text: "Here is the ranking.", records: [{ tool: "rank_sites", label: "Ranking", ok: true, site: null, horizonKind: "lola-ish", horizonLabel: null, dataRange: null, mustSay: [] }] },
    ]);
    const messages = useAssistant.getState().messages;
    expect(messages.map((m) => m.text)).toEqual(["Rank the south pole sites", "Here is the ranking."]);
    expect(messages[1].viewBefore).toBeUndefined();
    expect(messages[1].records?.[0].horizonKind).toBe("unrecognised");
    expect(new Set(messages.map((m) => m.id)).size).toBe(2);
    expect(serializeChat(messages)[0]).toEqual({ role: "user", text: "Rank the south pole sites", answered: true });
    useAssistant.getState().loadTranscript([]);
    expect(useAssistant.getState().messages).toEqual([]);
  });
});

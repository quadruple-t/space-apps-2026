/**
 * Turns a Mission Control ranking or comparison tool outcome into a study the user can save.
 * The stored result is the shaped response the assistant answered from, so horizon-source
 * labels, upper-bound flags and required wording travel with it.
 */
import type { ToolOutcome } from "@/lib/assistant/tool-results";
import { toStorableJson } from "./snapshot";
import { EXPEDITION_LIMITS, type StudyInput } from "./types";

export function studyFromOutcome(args: unknown, outcome: ToolOutcome): StudyInput | null {
  const { record, response } = outcome;
  if (!record.ok || (record.tool !== "rank_sites" && record.tool !== "compare_sites")) return null;
  const ranking = record.tool === "rank_sites";
  const inputs = toStorableJson({ args: args && typeof args === "object" ? args : {}, dataRange: record.dataRange });
  const result = toStorableJson(response);
  if (!inputs || !result) return null;
  const detail = ranking ? record.dataRange : record.site;
  const label = `${ranking ? "Ranking" : "Comparison"}${detail ? ` · ${detail}` : ""}`.slice(0, EXPEDITION_LIMITS.studyLabelChars);
  return { kind: ranking ? "ranking" : "comparison", source: "mission-control", label, inputs, result };
}

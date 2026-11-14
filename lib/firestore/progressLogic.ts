/**
 * Pure story-progress logic shared by the Firestore service, the signed-out localStorage
 * store and the sign-in merge. No Firebase or browser imports.
 */
import { CHAPTER_IDS, CHAPTER_TOOL, TOOL_IDS, type ChapterId, type ProgressState, type ToolId } from "@/lib/model/types";
import { ChapterOrderError } from "./errors";

const EPOCH_ISO = new Date(0).toISOString();

export function emptyProgress(updatedAt: string = EPOCH_ISO): ProgressState {
  return { version: 1, chaptersCompleted: [], unlockedTools: [], expertMode: false, stepAnswers: {}, updatedAt };
}

function isChapterId(v: unknown): v is ChapterId {
  return typeof v === "string" && (CHAPTER_IDS as readonly string[]).includes(v);
}
function isToolId(v: unknown): v is ToolId {
  return typeof v === "string" && (TOOL_IDS as readonly string[]).includes(v);
}

/** Canonical order + dedupe so writes always satisfy the rules (<= 3 known ids). */
function sortChapters(ids: Iterable<ChapterId>): ChapterId[] {
  const set = new Set(ids);
  return CHAPTER_IDS.filter((c) => set.has(c));
}
function sortTools(ids: Iterable<ToolId>): ToolId[] {
  const set = new Set(ids);
  return TOOL_IDS.filter((t) => set.has(t));
}

/**
 * Coerce untrusted data (localStorage JSON, a Firestore doc) into a valid ProgressState.
 * Unknown ids are dropped; non string/number step answers are dropped.
 */
export function normalizeProgress(raw: unknown, updatedAtFallback: string = EPOCH_ISO): ProgressState {
  if (typeof raw !== "object" || raw === null) return emptyProgress(updatedAtFallback);
  const r = raw as Record<string, unknown>;
  const chapters = Array.isArray(r.chaptersCompleted) ? r.chaptersCompleted.filter(isChapterId) : [];
  const tools = Array.isArray(r.unlockedTools) ? r.unlockedTools.filter(isToolId) : [];
  const stepAnswers: Record<string, string | number> = {};
  if (typeof r.stepAnswers === "object" && r.stepAnswers !== null && !Array.isArray(r.stepAnswers)) {
    for (const [k, v] of Object.entries(r.stepAnswers as Record<string, unknown>)) {
      if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) stepAnswers[k] = v;
    }
  }
  const updatedAt =
    typeof r.updatedAt === "string" && !Number.isNaN(Date.parse(r.updatedAt)) ? r.updatedAt : updatedAtFallback;
  return {
    version: 1,
    chaptersCompleted: sortChapters(chapters),
    unlockedTools: sortTools(tools),
    expertMode: r.expertMode === true,
    stepAnswers,
    updatedAt,
  };
}

/** Throws ChapterOrderError if the previous chapter is not complete. Idempotent for completed chapters. */
export function applyCompleteChapter(state: ProgressState, chapterId: ChapterId, nowIso: string): ProgressState {
  const i = CHAPTER_IDS.indexOf(chapterId);
  if (i < 0) throw new Error(`Unknown chapter ${String(chapterId)}`);
  if (i > 0) {
    const prev = CHAPTER_IDS[i - 1];
    if (!state.chaptersCompleted.includes(prev)) throw new ChapterOrderError(chapterId, prev);
  }
  return {
    ...state,
    chaptersCompleted: sortChapters([...state.chaptersCompleted, chapterId]),
    unlockedTools: sortTools([...state.unlockedTools, CHAPTER_TOOL[chapterId]]),
    updatedAt: nowIso,
  };
}

export function applyExpertMode(state: ProgressState, nowIso: string): ProgressState {
  return { ...state, expertMode: true, unlockedTools: [...TOOL_IDS], updatedAt: nowIso };
}

export function applyStepAnswer(
  state: ProgressState,
  stepId: string,
  value: string | number,
  nowIso: string,
): ProgressState {
  if (!stepId) throw new Error("stepId is required");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("step answer must be finite");
  return { ...state, stepAnswers: { ...state.stepAnswers, [stepId]: value }, updatedAt: nowIso };
}

/** Mission Control opens after all three chapters, or straight away in expert mode. */
export function isMissionControlUnlocked(progress: ProgressState): boolean {
  return progress.expertMode || CHAPTER_IDS.every((c) => progress.chaptersCompleted.includes(c));
}

/**
 * Merge signed-out progress into the signed-in copy: union of chapters and tools, expertMode
 * OR, and stepAnswers from whichever side was updated later (remote wins ties).
 */
export function mergeProgress(local: ProgressState, remote: ProgressState, nowIso: string): ProgressState {
  const localNewer = Date.parse(local.updatedAt) > Date.parse(remote.updatedAt);
  return {
    version: 1,
    chaptersCompleted: sortChapters([...remote.chaptersCompleted, ...local.chaptersCompleted]),
    unlockedTools: sortTools([...remote.unlockedTools, ...local.unlockedTools]),
    expertMode: remote.expertMode || local.expertMode,
    stepAnswers: localNewer ? { ...local.stepAnswers } : { ...remote.stepAnswers },
    updatedAt: nowIso,
  };
}

/** True if the state carries anything worth merging. */
export function hasProgress(p: ProgressState): boolean {
  return (
    p.chaptersCompleted.length > 0 || p.unlockedTools.length > 0 || p.expertMode || Object.keys(p.stepAnswers).length > 0
  );
}

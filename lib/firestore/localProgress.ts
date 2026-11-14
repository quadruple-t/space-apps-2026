/**
 * Signed-out story progress, persisted in localStorage under "shadowline.progress.v1".
 * Same functions as progressService minus the uid. SSR-safe: on the server every read
 * returns the empty state and writes are rejected.
 *
 * getProgress() returns a referentially stable object until the stored value changes, so it
 * can back useSyncExternalStore directly: useSyncExternalStore(subscribeProgress, getProgress,
 * getServerProgress).
 */
import type { ChapterId, ProgressState } from "@/lib/model/types";
import {
  applyCompleteChapter,
  applyExpertMode,
  applyStepAnswer,
  emptyProgress,
  hasProgress,
  normalizeProgress,
} from "./progressLogic";

export const LOCAL_PROGRESS_KEY = "shadowline.progress.v1";

const SERVER_STATE: ProgressState = emptyProgress();
const listeners = new Set<(p: ProgressState) => void>();
let lastRaw: string | null | undefined;
let lastState: ProgressState = SERVER_STATE;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // blocked (privacy mode, sandboxed iframe)
  }
}

function readRaw(): string | null {
  try {
    return storage()?.getItem(LOCAL_PROGRESS_KEY) ?? null;
  } catch {
    return null;
  }
}

function parse(raw: string | null): ProgressState {
  if (raw === null) return SERVER_STATE;
  try {
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return SERVER_STATE;
  }
}

/** Current signed-out progress (stable reference while unchanged). */
export function getProgress(): ProgressState {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastState = parse(raw);
  }
  return lastState;
}

/** Server snapshot for useSyncExternalStore. */
export function getServerProgress(): ProgressState {
  return SERVER_STATE;
}

/** True if something is stored locally (used to decide whether to merge on sign-in). */
export function hasLocalProgress(): boolean {
  return readRaw() !== null && hasProgress(getProgress());
}

function emit(): void {
  const state = getProgress();
  for (const l of listeners) l(state);
}

function onStorage(e: StorageEvent): void {
  if (e.key === null || e.key === LOCAL_PROGRESS_KEY) emit();
}

/** Subscribe to changes from this tab and other tabs. Returns an unsubscribe function. */
export function subscribeProgress(cb: (p: ProgressState) => void): () => void {
  listeners.add(cb);
  if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function write(next: ProgressState): ProgressState {
  const s = storage();
  if (!s) throw new Error("localStorage is unavailable; progress cannot be saved.");
  s.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(next));
  emit();
  return getProgress();
}

export async function completeChapter(chapterId: ChapterId): Promise<ProgressState> {
  return write(applyCompleteChapter(getProgress(), chapterId, new Date().toISOString()));
}

export async function enableExpertMode(): Promise<ProgressState> {
  return write(applyExpertMode(getProgress(), new Date().toISOString()));
}

export async function saveStepAnswer(stepId: string, value: string | number): Promise<ProgressState> {
  return write(applyStepAnswer(getProgress(), stepId, value, new Date().toISOString()));
}

/** Remove local progress (after a successful merge into Firestore). */
export function clearLocalProgress(): void {
  try {
    storage()?.removeItem(LOCAL_PROGRESS_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

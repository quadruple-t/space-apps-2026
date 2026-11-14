/**
 * Signed-in story progress at users/{uid}/progress/state. Chapter order is enforced here in a
 * transaction (the rules only check shape). See localProgress.ts for the signed-out twin and
 * getProgressStore() for a uid-agnostic facade.
 */
import { doc, getDoc, onSnapshot, runTransaction, setDoc, type DocumentReference } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import type { ChapterId, ProgressState } from "@/lib/model/types";
import { COLLECTIONS, PROGRESS_DOC_ID } from "./collections";
import { progressConverter, progressToData } from "./converters";
import * as local from "./localProgress";
import {
  applyCompleteChapter,
  applyExpertMode,
  applyStepAnswer,
  emptyProgress,
  hasProgress,
  mergeProgress,
} from "./progressLogic";

export { isMissionControlUnlocked } from "./progressLogic";
export { ChapterOrderError } from "./errors";

function progressRef(uid: string): DocumentReference<ProgressState> {
  return doc(getDb(), COLLECTIONS.users, uid, "progress", PROGRESS_DOC_ID).withConverter(progressConverter);
}

export async function getProgress(uid: string): Promise<ProgressState> {
  const snap = await getDoc(progressRef(uid));
  return snap.exists() ? snap.data() : emptyProgress();
}

export function subscribeProgress(
  uid: string,
  cb: (p: ProgressState) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    progressRef(uid),
    (snap) => cb(snap.exists() ? snap.data() : emptyProgress()),
    (e) => onError?.(e),
  );
}

/** Read-modify-write in a transaction. `fn` may throw to abort (e.g. ChapterOrderError). */
async function mutate(uid: string, fn: (current: ProgressState, nowIso: string) => ProgressState): Promise<ProgressState> {
  const ref = progressRef(uid);
  return runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? snap.data() : emptyProgress();
    const next = fn(current, new Date().toISOString());
    tx.set(ref, next);
    return next;
  });
}

/** Marks a chapter complete and unlocks its tool. Throws ChapterOrderError when out of order. */
export function completeChapter(uid: string, chapterId: ChapterId): Promise<ProgressState> {
  return mutate(uid, (p, now) => applyCompleteChapter(p, chapterId, now));
}

/** Expert skip: every tool unlocked, flagged on progress and mirrored on users/{uid}. */
export async function enableExpertMode(uid: string): Promise<ProgressState> {
  const next = await mutate(uid, (p, now) => applyExpertMode(p, now));
  await setDoc(doc(getDb(), COLLECTIONS.users, uid), { expertMode: true }, { merge: true });
  return next;
}

export function saveStepAnswer(uid: string, stepId: string, value: string | number): Promise<ProgressState> {
  return mutate(uid, (p, now) => applyStepAnswer(p, stepId, value, now));
}

/**
 * First sign-in: merge localStorage progress into Firestore (union of chapters/tools,
 * expertMode OR, later updatedAt wins stepAnswers), then clear localStorage.
 * Returns the merged state, or null when there was nothing local to merge.
 */
export async function mergeLocalProgressIntoFirestore(uid: string): Promise<ProgressState | null> {
  if (!local.hasLocalProgress()) {
    local.clearLocalProgress();
    return null;
  }
  const localState = local.getProgress();
  const merged = await mutate(uid, (remote, now) => mergeProgress(localState, remote, now));
  if (merged.expertMode) {
    await setDoc(doc(getDb(), COLLECTIONS.users, uid), { expertMode: true }, { merge: true });
  }
  local.clearLocalProgress();
  return merged;
}

/** Same operations whether signed in (Firestore) or signed out (localStorage). */
export interface ProgressStore {
  readonly signedIn: boolean;
  getProgress(): Promise<ProgressState>;
  subscribe(cb: (p: ProgressState) => void, onError?: (e: Error) => void): () => void;
  completeChapter(chapterId: ChapterId): Promise<ProgressState>;
  enableExpertMode(): Promise<ProgressState>;
  saveStepAnswer(stepId: string, value: string | number): Promise<ProgressState>;
}

export function getProgressStore(uid: string | null): ProgressStore {
  if (uid) {
    return {
      signedIn: true,
      getProgress: () => getProgress(uid),
      subscribe: (cb, onError) => subscribeProgress(uid, cb, onError),
      completeChapter: (c) => completeChapter(uid, c),
      enableExpertMode: () => enableExpertMode(uid),
      saveStepAnswer: (s, v) => saveStepAnswer(uid, s, v),
    };
  }
  return {
    signedIn: false,
    getProgress: async () => local.getProgress(),
    subscribe: (cb) => {
      cb(local.getProgress());
      return local.subscribeProgress(cb);
    },
    completeChapter: local.completeChapter,
    enableExpertMode: local.enableExpertMode,
    saveStepAnswer: local.saveStepAnswer,
  };
}

/** Exposed for tests: the payload written to Firestore (only rule-allowed keys). */
export { progressToData, hasProgress };

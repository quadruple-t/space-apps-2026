/**
 * The signed-out (or not-yet-saved) draft in localStorage, plus small per-browser preferences.
 * Every access is wrapped: private windows and blocked storage fall back to an in-memory draft
 * that lasts for the page session, and the app keeps working.
 */
import { emptyDraft, migrateLegacyFreeplay, sanitizeDraft } from "./snapshot";
import type { ExpeditionDraft } from "./types";

export const DRAFT_KEY = "lunaris360-expedition-draft-v1";
/** Pre-expeditions key holding saved sites and panel settings; folded into the draft once. */
export const LEGACY_FREEPLAY_KEY = "lunaris360-freeplay-v1";
const lastExpeditionKey = (uid: string) => `lunaris360-last-expedition-${uid}`;

let memoryDraft: ExpeditionDraft | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Loads the draft, migrating the legacy Freeplay key on first run. */
export function loadDraft(): ExpeditionDraft {
  const store = storage();
  const stored = memoryDraft ? null : readJson(DRAFT_KEY);
  let draft = memoryDraft ?? (stored ? sanitizeDraft(stored) : emptyDraft());
  const legacy = readJson(LEGACY_FREEPLAY_KEY);
  if (legacy) {
    draft = migrateLegacyFreeplay(legacy, draft);
    if (saveDraft(draft)) {
      try { store?.removeItem(LEGACY_FREEPLAY_KEY); } catch { /* keep the legacy key if it cannot be removed */ }
    }
  }
  return draft;
}

/** Returns false when the browser refused the write (the draft then lives in memory only). */
export function saveDraft(draft: ExpeditionDraft): boolean {
  memoryDraft = draft;
  try {
    storage()?.setItem(DRAFT_KEY, JSON.stringify(draft));
    return storage() !== null;
  } catch {
    return false;
  }
}

/** Merges a patch into the stored draft (used when saving a study from a page that does not hold the workspace). */
export function patchDraft(patch: Partial<Omit<ExpeditionDraft, "version">>): ExpeditionDraft {
  const next = { ...loadDraft(), ...patch, updatedAt: new Date().toISOString() };
  saveDraft(next);
  return next;
}

export function clearDraft(): ExpeditionDraft {
  const fresh = emptyDraft();
  saveDraft(fresh);
  return fresh;
}

export function getLastExpeditionId(uid: string): string | null {
  try { return storage()?.getItem(lastExpeditionKey(uid)) ?? null; } catch { return null; }
}

export function setLastExpeditionId(uid: string, id: string | null): void {
  try {
    if (id) storage()?.setItem(lastExpeditionKey(uid), id);
    else storage()?.removeItem(lastExpeditionKey(uid));
  } catch { /* preference only */ }
}

/** Test hook: forget the in-memory fallback. */
export function resetDraftMemory(): void {
  memoryDraft = null;
}

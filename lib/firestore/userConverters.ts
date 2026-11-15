/**
 * Converters and write-payload builders for owner-only user data
 * (users/{uid}, progress/state, sessions, reports, expeditions). Writes use serverTimestamp() for
 * time fields; reads use estimated server timestamps so pending local writes still have
 * an ISO time.
 */
import {
  serverTimestamp,
  type DocumentData,
  type FieldValue,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
} from "firebase/firestore";
import {
  MISSION_PROFILE_IDS,
  type ProgressState,
  type SavedReport,
  type SavedReportSummary,
  type SavedSession,
  type SessionState,
  type SiteSelection,
  type TimeWindow,
  type UserDoc,
} from "@/lib/model/types";
import type { FreeplaySite } from "@/data/sites";
import {
  sanitizeChat,
  sanitizeSites,
  sanitizeStudy,
  sanitizeWorkspace,
  toStorableJson,
} from "@/lib/expeditions/snapshot";
import {
  EXPEDITION_LIMITS,
  EXPEDITION_VERSION,
  STUDY_KINDS,
  STUDY_SOURCES,
  type Expedition,
  type ExpeditionMeta,
  type ExpeditionWorkspace,
  type StoredChatMessage,
  type Study,
  type StudyInput,
} from "@/lib/expeditions/types";
import { InvalidUserDataError } from "./errors";
import { normalizeProgress } from "./progressLogic";
import { Reader, toIso, type Data } from "./read";

const NOW_FALLBACK = () => new Date().toISOString();

function snapData(snap: QueryDocumentSnapshot, options?: SnapshotOptions): Data {
  return snap.data({ serverTimestamps: "estimate", ...options });
}

function windowFrom(r: Reader): TimeWindow {
  const w = r.sub("window");
  return { start: w.iso("start"), end: w.iso("end"), stepMinutes: w.num("stepMinutes") };
}

// ---------------------------------------------------------------
// users/{uid}
// ---------------------------------------------------------------

export function userDocFromData(d: Data, path = "users/?"): UserDoc {
  const r = new Reader(path, d);
  return {
    displayName: r.strOrNull("displayName"),
    email: r.strOrNull("email"),
    photoURL: r.strOrNull("photoURL"),
    createdAt: r.isoOrNull("createdAt") ?? NOW_FALLBACK(),
    lastSeenAt: r.isoOrNull("lastSeenAt") ?? NOW_FALLBACK(),
    expertMode: r.boolOrNull("expertMode") ?? false,
  };
}

export const userDocConverter: FirestoreDataConverter<UserDoc> = {
  toFirestore(): DocumentData {
    throw new Error("Write users/{uid} through lib/auth/ensureUserDoc.ts");
  },
  fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): UserDoc {
    return userDocFromData(snapData(snap, options), snap.ref.path);
  },
};

// ---------------------------------------------------------------
// users/{uid}/progress/state
// ---------------------------------------------------------------

export function progressFromData(d: Data): ProgressState {
  return normalizeProgress({ ...d, updatedAt: toIso(d.updatedAt) ?? undefined });
}

/** Only the keys the rules allow; updatedAt is always the server time. */
export function progressToData(p: ProgressState): Record<string, unknown> & { updatedAt: FieldValue } {
  return {
    version: 1,
    chaptersCompleted: [...p.chaptersCompleted],
    unlockedTools: [...p.unlockedTools],
    expertMode: p.expertMode,
    stepAnswers: { ...p.stepAnswers },
    updatedAt: serverTimestamp(),
  };
}

export const progressConverter: FirestoreDataConverter<ProgressState> = {
  toFirestore(p): DocumentData {
    return progressToData(p as ProgressState);
  },
  fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): ProgressState {
    return progressFromData(snapData(snap, options));
  },
};

// ---------------------------------------------------------------
// users/{uid}/sessions/{id}
// ---------------------------------------------------------------

export function savedSessionFromData(id: string, d: Data, path = `sessions/${id}`): SavedSession {
  const r = new Reader(path, d);
  return {
    id,
    name: r.str("name"),
    siteSelections: r.arr<SiteSelection>("siteSelections"),
    window: windowFrom(r),
    scrubTime: r.iso("scrubTime"),
    profileId: r.oneOf("profileId", MISSION_PROFILE_IDS),
    createdAt: r.isoOrNull("createdAt") ?? NOW_FALLBACK(),
    updatedAt: r.isoOrNull("updatedAt") ?? NOW_FALLBACK(),
  };
}

function selectionToData(s: SiteSelection): Data {
  if (s.kind === "library") return { kind: "library", siteId: s.siteId };
  const coordinates: Data = { latDeg: s.coordinates.latDeg, lonDeg: s.coordinates.lonDeg };
  if (s.coordinates.elevationM !== undefined) coordinates.elevationM = s.coordinates.elevationM;
  return { kind: "custom", label: s.label, coordinates };
}

export function sessionToData(name: string, s: SessionState, isNew: boolean): Data {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) throw new InvalidUserDataError("Session name must be 1-120 characters.");
  if (s.siteSelections.length < 1 || s.siteSelections.length > 3) {
    throw new InvalidUserDataError("A session needs 1 to 3 site selections.");
  }
  if (!(MISSION_PROFILE_IDS as readonly string[]).includes(s.profileId)) {
    throw new InvalidUserDataError(`Unknown mission profile ${s.profileId}.`);
  }
  const data: Data = {
    name: trimmed,
    siteSelections: s.siteSelections.map(selectionToData),
    window: { start: s.window.start, end: s.window.end, stepMinutes: s.window.stepMinutes },
    scrubTime: s.scrubTime,
    profileId: s.profileId,
    updatedAt: serverTimestamp(),
  };
  if (isNew) data.createdAt = serverTimestamp();
  return data;
}

export const savedSessionConverter: FirestoreDataConverter<SavedSession> = {
  toFirestore(): DocumentData {
    throw new Error("Write sessions through sessionService.saveSession");
  },
  fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): SavedSession {
    return savedSessionFromData(snap.id, snapData(snap, options), snap.ref.path);
  },
};

// ---------------------------------------------------------------
// users/{uid}/reports/{id}
// ---------------------------------------------------------------

/** What a caller passes to save a report. Extra keys (e.g. `series`, `sites`) are stripped. */
export type SavedReportInput = Omit<SavedReport, "id" | "createdAt">;

export function summaryToData(s: SavedReportSummary): SavedReportSummary {
  return {
    siteLabel: s.siteLabel,
    latDeg: s.latDeg,
    lonDeg: s.lonDeg,
    scoreTotal: s.scoreTotal,
    disqualified: s.disqualified,
    longestLitHours: s.longestLitHours,
    longestDarkHours: s.longestDarkHours,
    minSocPct: s.minSocPct,
    flags: [...s.flags],
  };
}

/** Whitelists SavedReport fields only: no time series ever reaches Firestore. */
export function reportToData(input: SavedReportInput): Data {
  if (input.siteSummaries.length < 1 || input.siteSummaries.length > 3) {
    throw new InvalidUserDataError("A report needs 1 to 3 site summaries.");
  }
  if (input.format !== "pdf" && input.format !== "csv") throw new InvalidUserDataError("format must be pdf or csv.");
  if (!(MISSION_PROFILE_IDS as readonly string[]).includes(input.profileId)) {
    throw new InvalidUserDataError(`Unknown mission profile ${input.profileId}.`);
  }
  return {
    profileId: input.profileId,
    window: { start: input.window.start, end: input.window.end, stepMinutes: input.window.stepMinutes },
    siteSummaries: input.siteSummaries.map(summaryToData),
    methodsSummary: input.methodsSummary,
    disclaimer: input.disclaimer,
    format: input.format,
    createdAt: serverTimestamp(),
  };
}

export function savedReportFromData(id: string, d: Data, path = `reports/${id}`): SavedReport {
  const r = new Reader(path, d);
  return {
    id,
    createdAt: r.isoOrNull("createdAt") ?? NOW_FALLBACK(),
    profileId: r.oneOf("profileId", MISSION_PROFILE_IDS),
    window: windowFrom(r),
    siteSummaries: r.arr<SavedReportSummary>("siteSummaries"),
    methodsSummary: r.str("methodsSummary"),
    disclaimer: r.str("disclaimer"),
    format: r.oneOf("format", ["pdf", "csv"] as const),
  };
}

export const savedReportConverter: FirestoreDataConverter<SavedReport> = {
  toFirestore(): DocumentData {
    throw new Error("Write reports through reportService.saveReportSummary");
  },
  fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): SavedReport {
    return savedReportFromData(snap.id, snapData(snap, options), snap.ref.path);
  },
};

// ---------------------------------------------------------------
// users/{uid}/expeditions/{id} (+ studies/{id}, chat/transcript)
// Reads go through the lib/expeditions sanitizers so an old or damaged document degrades to
// defaults instead of throwing; writes whitelist the keys firestore.rules allows.
// ---------------------------------------------------------------

export function expeditionName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > EXPEDITION_LIMITS.nameChars) {
    throw new InvalidUserDataError(`Expedition name must be 1-${EXPEDITION_LIMITS.nameChars} characters.`);
  }
  return trimmed;
}

function notesValue(notes: string): string {
  if (notes.length > EXPEDITION_LIMITS.notesChars) {
    throw new InvalidUserDataError(`Notes are limited to ${EXPEDITION_LIMITS.notesChars} characters.`);
  }
  return notes;
}

/** Full expedition document for create. */
export function newExpeditionToData(name: string, content: { notes: string; workspace: ExpeditionWorkspace; sites: FreeplaySite[] }): Data {
  return {
    version: EXPEDITION_VERSION,
    name: expeditionName(name),
    notes: notesValue(content.notes),
    workspace: workspaceToData(content.workspace),
    sites: sanitizeSites(content.sites).map(stripUndefined),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastOpenedAt: serverTimestamp(),
  };
}

/** Partial update (merge write); always bumps updatedAt. */
export function expeditionPatchToData(patch: { name?: string; notes?: string; workspace?: ExpeditionWorkspace; sites?: FreeplaySite[]; opened?: boolean }): Data {
  const data: Data = { version: EXPEDITION_VERSION, updatedAt: serverTimestamp() };
  if (patch.name !== undefined) data.name = expeditionName(patch.name);
  if (patch.notes !== undefined) data.notes = notesValue(patch.notes);
  if (patch.workspace) data.workspace = workspaceToData(patch.workspace);
  if (patch.sites) {
    if (patch.sites.length > EXPEDITION_LIMITS.sites) throw new InvalidUserDataError(`An expedition holds up to ${EXPEDITION_LIMITS.sites} sites.`);
    data.sites = sanitizeSites(patch.sites).map(stripUndefined);
  }
  if (patch.opened) data.lastOpenedAt = serverTimestamp();
  return data;
}

function workspaceToData(ws: ExpeditionWorkspace): Data {
  const clean = sanitizeWorkspace(ws);
  return stripUndefined({ ...clean, site: clean.site ? stripUndefined(clean.site) : null });
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function expeditionMetaFromData(id: string, d: Data): ExpeditionMeta {
  const name = typeof d.name === "string" && d.name.trim() ? d.name.slice(0, EXPEDITION_LIMITS.nameChars) : "Untitled expedition";
  const updatedAt = toIso(d.updatedAt) ?? NOW_FALLBACK();
  return {
    id,
    name,
    createdAt: toIso(d.createdAt) ?? updatedAt,
    updatedAt,
    lastOpenedAt: toIso(d.lastOpenedAt) ?? updatedAt,
  };
}

export function expeditionFromData(id: string, d: Data): Expedition {
  return {
    ...expeditionMetaFromData(id, d),
    notes: typeof d.notes === "string" ? d.notes.slice(0, EXPEDITION_LIMITS.notesChars) : "",
    workspace: sanitizeWorkspace(d.workspace),
    sites: sanitizeSites(d.sites),
  };
}

export const expeditionConverter: FirestoreDataConverter<Expedition> = {
  toFirestore(): DocumentData {
    throw new Error("Write expeditions through expeditionService");
  },
  fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): Expedition {
    return expeditionFromData(snap.id, snapData(snap, options));
  },
};

export function studyLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed || trimmed.length > EXPEDITION_LIMITS.studyLabelChars) {
    throw new InvalidUserDataError(`Study label must be 1-${EXPEDITION_LIMITS.studyLabelChars} characters.`);
  }
  return trimmed;
}

export function studyToData(input: StudyInput): Data {
  if (!(STUDY_KINDS as readonly string[]).includes(input.kind)) throw new InvalidUserDataError(`Unknown study kind ${input.kind}.`);
  if (!(STUDY_SOURCES as readonly string[]).includes(input.source)) throw new InvalidUserDataError(`Unknown study source ${input.source}.`);
  const inputs = toStorableJson(input.inputs), result = toStorableJson(input.result);
  if (!inputs || !result) throw new InvalidUserDataError("This result is too large or complex to save.");
  return { kind: input.kind, source: input.source, label: studyLabel(input.label), inputs, result, createdAt: serverTimestamp() };
}

export function studyFromData(id: string, d: Data): Study | null {
  return sanitizeStudy({ ...d, id, createdAt: toIso(d.createdAt) ?? NOW_FALLBACK() });
}

export function chatToData(messages: StoredChatMessage[]): Data {
  return { version: EXPEDITION_VERSION, messages: sanitizeChat(messages), updatedAt: serverTimestamp() };
}

export function chatFromData(d: Data): StoredChatMessage[] {
  return sanitizeChat(d.messages);
}

/**
 * Converters and write-payload builders for owner-only user data
 * (users/{uid}, progress/state, sessions, reports). Writes use serverTimestamp() for
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

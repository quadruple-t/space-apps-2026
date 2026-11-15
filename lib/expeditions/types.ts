/**
 * Expeditions: named, autosaved workspaces. Signed-in users keep them at
 * users/{uid}/expeditions/{id} (with studies/ and chat/transcript below it); signed-out users
 * keep one local draft of the same shape in localStorage. Sign-in is optional: nothing else in
 * the app depends on an expedition existing.
 */
import type { FreeplaySite } from "@/data/sites";
import type { FreeplayView, GraphTab, LayerId, LayerState, Speed } from "@/lib/freeplay-store";

export const EXPEDITION_VERSION = 1;

/** Size caps shared by the sanitizers, the write builders and the rules tests (firestore.rules repeats them). */
export const EXPEDITION_LIMITS = {
  nameChars: 120,
  notesChars: 10_000,
  sites: 50,
  studyLabelChars: 120,
  /** Studies per expedition; enforced client-side only (rules cannot count documents). */
  studies: 100,
  chatMessages: 40,
  chatMessageChars: 8_000,
  /** Serialized size cap for one study's inputs + result, well under Firestore's 1 MiB document limit. */
  studyJsonChars: 200_000,
} as const;

/** The parts of the Open Exploration store worth keeping. Transient fields (playing, callout, focus) are left out. */
export type ExpeditionWorkspace = {
  view: FreeplayView;
  site: FreeplaySite | null;
  startIso: string;
  durationHours: number;
  elapsedHours: number;
  speed: Speed;
  layers: Record<LayerId, LayerState>;
  meteorStream: string;
  showCatalog: boolean;
  graphTab: GraphTab;
  panelAreaM2: number;
  panelEfficiency: number;
};

export const STUDY_KINDS = ["comparison", "ranking"] as const;
export type StudyKind = (typeof STUDY_KINDS)[number];
export const STUDY_SOURCES = ["compare-page", "mission-control"] as const;
export type StudySource = (typeof STUDY_SOURCES)[number];

/**
 * A saved comparison or ranking: an immutable snapshot of what the science API returned,
 * including its horizon-source labels and assumptions. Only `label` may change. The UI shows
 * the saved date and offers a re-run; a stored result is never presented as live.
 */
export type Study = {
  id: string;
  kind: StudyKind;
  source: StudySource;
  label: string;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: string;
};
export type StudyInput = Omit<Study, "id" | "createdAt">;

/** A Mission Control message as stored. Undo snapshots (viewBefore) and on-screen change lists are session-only. */
export type StoredChatMessage = {
  role: "user" | "model";
  text: string;
  answered?: boolean;
  notices?: string[];
  records?: StoredSourceRecord[];
};
export type StoredSourceRecord = {
  tool: string;
  label: string;
  ok: boolean;
  site: string | null;
  horizonKind: string | null;
  horizonLabel: string | null;
  dataRange: string | null;
  mustSay: string[];
  error?: string;
};

export type ExpeditionMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};

export type Expedition = ExpeditionMeta & {
  notes: string;
  workspace: ExpeditionWorkspace;
  sites: FreeplaySite[];
};

/** Signed-out work: one draft per browser, same content as an expedition plus its studies and chat. */
export type ExpeditionDraft = {
  version: typeof EXPEDITION_VERSION;
  notes: string;
  workspace: ExpeditionWorkspace;
  sites: FreeplaySite[];
  studies: Study[];
  chat: StoredChatMessage[];
  updatedAt: string;
};

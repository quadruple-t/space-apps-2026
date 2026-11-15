"use client";

/**
 * Which expedition is open, and autosave for it. There is always a save target: the open
 * expedition when signed in, otherwise this browser's local draft. Sign-in is optional; the
 * draft keeps signed-out work across reloads and can become an expedition after sign-in.
 *
 * Freeplay content (workspace, saved sites, chat) moves into the stores only while non-guided
 * Freeplay is mounted ("attached"), so Guided Mission's resets never reach saved work.
 */
import { create } from "zustand";
import { useAssistant } from "@/lib/assistant/assistant-store";
import { useFreeplay } from "@/lib/freeplay-store";
import * as service from "@/lib/firestore/expeditionService";
import { createAutosave, type Autosave } from "./autosave";
import { clearDraft, getLastExpeditionId, loadDraft, patchDraft, setLastExpeditionId } from "./draft-storage";
import { DEFAULT_WORKSPACE, captureWorkspace, draftHasContent, serializeChat, workspaceToStorePatch } from "./snapshot";
import { EXPEDITION_LIMITS, type ExpeditionMeta, type ExpeditionWorkspace, type StoredChatMessage, type Study, type StudyInput } from "./types";
import type { FreeplaySite } from "@/data/sites";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type AuthChange = "restored" | "signedIn" | "signedOut";
type Content = { workspace: ExpeditionWorkspace; sites: FreeplaySite[]; chat: StoredChatMessage[]; notes: string };
type Target = { kind: "local" } | { kind: "cloud"; uid: string; id: string };

type ExpeditionState = {
  uid: string | null;
  activeId: string | null;
  activeName: string | null;
  notes: string;
  studies: Study[];
  list: ExpeditionMeta[];
  listStatus: "idle" | "loading" | "error";
  status: SaveStatus;
  /** Local writes not yet acknowledged by the server (offline or slow network). */
  pendingSync: boolean;
  error: string | null;
  busy: boolean;
  attached: boolean;
  /** Ask whether to keep the signed-out draft as an expedition (shown right after signing in). */
  importOffer: boolean;

  init: () => void;
  attach: (openId?: string | null) => void;
  detach: () => Promise<void>;
  setUser: (uid: string | null, change: AuthChange) => Promise<void>;
  refreshList: () => Promise<void>;
  open: (id: string) => Promise<void>;
  createNew: (name: string) => Promise<string | null>;
  saveCurrentAsExpedition: (name: string) => Promise<string | null>;
  dismissImport: () => void;
  close: () => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setNotes: (notes: string) => void;
  addStudy: (input: StudyInput) => Promise<{ savedTo: "expedition" | "draft"; study: Study }>;
  renameStudy: (id: string, label: string) => Promise<void>;
  deleteStudy: (id: string) => Promise<void>;
  flush: () => Promise<void>;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
let initialised = false;
let pendingOpenId: string | null = null;
/** Latest content of the open expedition, refreshed on every save, so re-attaching shows current work. */
let cloudCache: ({ id: string } & Content) | null = null;
let stopSync: (() => void) | null = null;
let unsubscribers: (() => void)[] = [];
let lastChatKey = "";

const target = (s: ExpeditionState): Target => (s.uid && s.activeId ? { kind: "cloud", uid: s.uid, id: s.activeId } : { kind: "local" });

function currentContent(): Content {
  const f = useFreeplay.getState();
  return { workspace: captureWorkspace(f), sites: f.savedSites, chat: serializeChat(useAssistant.getState().messages), notes: useExpeditions.getState().notes };
}

function applyContent(c: Content) {
  useFreeplay.setState(workspaceToStorePatch(c.workspace, c.sites));
  if (c.workspace.site) useFreeplay.getState().requestFocus();
  useAssistant.getState().loadTranscript(c.chat);
}

type Pending = { target: Target; content: Content };
const autosave: Autosave = createAutosave<Pending>({
  read: (): Pending | null => {
    const s: ExpeditionState = useExpeditions.getState();
    return s.attached && !s.busy ? { target: target(s), content: currentContent() } : null;
  },
  key: (v) => JSON.stringify(v),
  paused: () => useFreeplay.getState().playing,
  write: async ({ target: t, content }) => {
    if (t.kind === "local") {
      patchDraft({ workspace: content.workspace, sites: content.sites, chat: content.chat, notes: content.notes });
      return;
    }
    // Skip writes that belong to a session that has since signed out or switched.
    const s = useExpeditions.getState();
    if (s.uid !== t.uid || s.activeId !== t.id) return;
    await service.updateExpedition(t.uid, t.id, { workspace: content.workspace, sites: content.sites, notes: content.notes });
    const chatKey = JSON.stringify(content.chat);
    if (chatKey !== lastChatKey) {
      await service.saveChat(t.uid, t.id, content.chat);
      lastChatKey = chatKey;
    }
    cloudCache = { id: t.id, ...content };
  },
  onStatus: (status, e) => useExpeditions.setState({ status, error: status === "error" ? `Couldn't save: ${message(e)}` : null }),
});

function watchSync(uid: string | null, id: string | null) {
  stopSync?.();
  stopSync = null;
  useExpeditions.setState({ pendingSync: false });
  if (uid && id) stopSync = service.watchExpeditionSync(uid, id, (pendingSync) => useExpeditions.setState({ pendingSync }));
}

/** Switches the stores to the local draft. */
function showDraft() {
  const draft = loadDraft();
  useExpeditions.setState({ activeId: null, activeName: null, notes: draft.notes, studies: draft.studies });
  watchSync(null, null);
  if (useExpeditions.getState().attached) {
    applyContent({ ...draft });
    autosave.markSaved();
  }
}

export const useExpeditions = create<ExpeditionState>((set, get) => ({
  uid: null,
  activeId: null,
  activeName: null,
  notes: "",
  studies: [],
  list: [],
  listStatus: "idle",
  status: "idle",
  pendingSync: false,
  error: null,
  busy: false,
  attached: false,
  importOffer: false,

  init: () => {
    if (initialised) return;
    initialised = true;
    const draft = loadDraft();
    set({ notes: draft.notes, studies: draft.studies });
  },

  attach: (openId) => {
    get().init();
    set({ attached: true });
    if (openId && openId !== get().activeId) {
      if (get().uid) void get().open(openId);
      else pendingOpenId = openId;
    }
    const s = get();
    if (s.activeId && cloudCache?.id === s.activeId) applyContent(cloudCache);
    else if (!s.activeId) applyContent({ ...loadDraft() });
    autosave.markSaved();
    unsubscribers.forEach((u) => u());
    unsubscribers = [
      useFreeplay.subscribe(() => autosave.notify()),
      useAssistant.subscribe(() => autosave.notify()),
      useExpeditions.subscribe((a, b) => { if (a.notes !== b.notes) autosave.notify(); }),
    ];
  },

  detach: async () => {
    unsubscribers.forEach((u) => u());
    unsubscribers = [];
    // flush() reads the content synchronously, so mark detached right away: an immediate
    // re-attach (React Strict Mode, fast navigation) must not be undone by this async tail.
    const pending = autosave.flush();
    set({ attached: false });
    await pending;
  },

  setUser: async (uid, change) => {
    if (change === "signedOut" || !uid) {
      autosave.cancel();
      cloudCache = null;
      lastChatKey = "";
      set({ uid: null, list: [], listStatus: "idle", importOffer: false, status: "idle", error: null });
      useAssistant.getState().clear();
      showDraft();
      return;
    }
    if (get().uid === uid) return;
    set({ uid });
    void get().refreshList();
    const openId = pendingOpenId;
    pendingOpenId = null;
    if (openId) { await get().open(openId); return; }
    if (change === "signedIn") {
      await autosave.flush();
      if (draftHasContent(loadDraft())) { set({ importOffer: true }); return; }
    }
    const last = getLastExpeditionId(uid);
    if (last) await get().open(last);
  },

  refreshList: async () => {
    const uid = get().uid;
    if (!uid) return;
    set({ listStatus: "loading" });
    try {
      const list = await service.listExpeditions(uid);
      if (get().uid === uid) set({ list, listStatus: "idle" });
    } catch {
      if (get().uid === uid) set({ listStatus: "error" });
    }
  },

  open: async (id) => {
    const uid = get().uid;
    if (!uid) { pendingOpenId = id; return; }
    await autosave.flush();
    set({ busy: true, error: null });
    try {
      const bundle = await service.getExpedition(uid, id);
      if (get().uid !== uid) return;
      if (!bundle) {
        setLastExpeditionId(uid, null);
        set({ error: "That expedition no longer exists." });
        return;
      }
      const { expedition, studies, chat } = bundle;
      const content: Content = { workspace: expedition.workspace, sites: expedition.sites, chat, notes: expedition.notes };
      cloudCache = { id, ...content };
      lastChatKey = JSON.stringify(chat);
      setLastExpeditionId(uid, id);
      set({ activeId: id, activeName: expedition.name, notes: expedition.notes, studies, importOffer: false, status: "saved" });
      watchSync(uid, id);
      if (get().attached) applyContent(content);
      void service.updateExpedition(uid, id, { opened: true }).catch(() => undefined);
    } catch (e) {
      set({ error: `Couldn't open the expedition: ${message(e)}` });
    } finally {
      set({ busy: false });
      autosave.markSaved();
    }
  },

  createNew: async (name) => {
    const uid = get().uid;
    if (!uid) return null;
    await autosave.flush();
    try {
      const id = await service.createExpedition(uid, name, { notes: "", workspace: DEFAULT_WORKSPACE, sites: [] });
      await get().open(id);
      void get().refreshList();
      return id;
    } catch (e) {
      set({ error: `Couldn't create the expedition: ${message(e)}` });
      return null;
    }
  },

  saveCurrentAsExpedition: async (name) => {
    const uid = get().uid;
    if (!uid) return null;
    await autosave.flush();
    const draft = loadDraft();
    const content = get().attached ? { ...currentContent(), notes: draft.notes || get().notes } : draft;
    try {
      const id = await service.createExpedition(uid, name, {
        notes: content.notes, workspace: content.workspace, sites: content.sites, chat: content.chat,
        studies: draft.studies.map(({ kind, source, label, inputs, result }) => ({ kind, source, label, inputs, result })),
      });
      clearDraft();
      await get().open(id);
      void get().refreshList();
      return id;
    } catch (e) {
      set({ error: `Couldn't save the expedition: ${message(e)}` });
      return null;
    }
  },

  dismissImport: () => set({ importOffer: false }),

  close: async () => {
    await autosave.flush();
    if (get().uid) setLastExpeditionId(get().uid!, null);
    cloudCache = null;
    showDraft();
  },

  rename: async (id, name) => {
    const uid = get().uid;
    if (!uid) return;
    await service.updateExpedition(uid, id, { name });
    set((s) => ({ activeName: s.activeId === id ? name.trim() : s.activeName, list: s.list.map((e) => (e.id === id ? { ...e, name: name.trim() } : e)) }));
  },

  remove: async (id) => {
    const uid = get().uid;
    if (!uid) return;
    if (get().activeId === id) {
      autosave.cancel();
      setLastExpeditionId(uid, null);
      cloudCache = null;
      showDraft();
    }
    await service.deleteExpedition(uid, id);
    set((s) => ({ list: s.list.filter((e) => e.id !== id) }));
  },

  setNotes: (notes) => set({ notes: notes.slice(0, EXPEDITION_LIMITS.notesChars) }),

  addStudy: async (input) => {
    const s = get();
    if (s.studies.length >= EXPEDITION_LIMITS.studies) throw new Error(`An expedition holds up to ${EXPEDITION_LIMITS.studies} saved studies. Delete one first.`);
    const t = target(s);
    const createdAt = new Date().toISOString();
    if (t.kind === "cloud") {
      const id = await service.addStudy(t.uid, t.id, input);
      const study: Study = { ...input, id, createdAt };
      set((st) => ({ studies: [study, ...st.studies] }));
      return { savedTo: "expedition", study };
    }
    const study: Study = { ...input, id: `local-${Date.now().toString(36)}`, createdAt };
    const draft = patchDraft({ studies: [study, ...loadDraft().studies] });
    set({ studies: draft.studies });
    return { savedTo: "draft", study };
  },

  renameStudy: async (id, label) => {
    const t = target(get());
    const trimmed = label.trim().slice(0, EXPEDITION_LIMITS.studyLabelChars);
    if (!trimmed) return;
    if (t.kind === "cloud") await service.renameStudy(t.uid, t.id, id, trimmed);
    else patchDraft({ studies: loadDraft().studies.map((st) => (st.id === id ? { ...st, label: trimmed } : st)) });
    set((st) => ({ studies: st.studies.map((x) => (x.id === id ? { ...x, label: trimmed } : x)) }));
  },

  deleteStudy: async (id) => {
    const t = target(get());
    if (t.kind === "cloud") await service.deleteStudy(t.uid, t.id, id);
    else patchDraft({ studies: loadDraft().studies.filter((st) => st.id !== id) });
    set((st) => ({ studies: st.studies.filter((x) => x.id !== id) }));
  },

  flush: () => autosave.flush(),
}));

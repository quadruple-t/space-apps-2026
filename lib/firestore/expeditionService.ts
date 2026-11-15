/**
 * Signed-in expeditions at users/{uid}/expeditions/{id}, with studies/{id} and chat/transcript
 * below each one. Writes go straight through the Web SDK under the owner-only rules in
 * firestore.rules (there is no /api/v1 endpoint for expeditions). Firestore's persistent cache
 * queues writes while offline. Two tabs editing one expedition resolve last-write-wins.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import type { FreeplaySite } from "@/data/sites";
import { getDb } from "@/lib/firebase/client";
import type { Expedition, ExpeditionMeta, ExpeditionWorkspace, StoredChatMessage, Study, StudyInput } from "@/lib/expeditions/types";
import { CHAT_DOC_ID, COLLECTIONS, SUBCOLLECTIONS } from "./collections";
import {
  chatFromData,
  chatToData,
  expeditionFromData,
  expeditionMetaFromData,
  expeditionPatchToData,
  newExpeditionToData,
  studyFromData,
  studyLabel,
  studyToData,
} from "./userConverters";

const expeditionsCol = (uid: string) => collection(getDb(), COLLECTIONS.users, uid, SUBCOLLECTIONS.expeditions);
const expeditionRef = (uid: string, id: string) => doc(expeditionsCol(uid), id);
const studiesCol = (uid: string, id: string) => collection(expeditionRef(uid, id), SUBCOLLECTIONS.studies);
const chatRef = (uid: string, id: string) => doc(expeditionRef(uid, id), SUBCOLLECTIONS.chat, CHAT_DOC_ID);
const estimate = { serverTimestamps: "estimate" } as const;

/** Most recently updated first. */
export async function listExpeditions(uid: string): Promise<ExpeditionMeta[]> {
  const snap = await getDocs(query(expeditionsCol(uid), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => expeditionMetaFromData(d.id, d.data(estimate)));
}

export type ExpeditionBundle = { expedition: Expedition; studies: Study[]; chat: StoredChatMessage[] };

/** The expedition with its studies (newest first) and chat, or null if it does not exist. */
export async function getExpedition(uid: string, id: string): Promise<ExpeditionBundle | null> {
  const [snap, studySnap, chatSnap] = await Promise.all([
    getDoc(expeditionRef(uid, id)),
    getDocs(query(studiesCol(uid, id), orderBy("createdAt", "desc"))),
    getDoc(chatRef(uid, id)),
  ]);
  if (!snap.exists()) return null;
  return {
    expedition: expeditionFromData(snap.id, snap.data(estimate)),
    studies: studySnap.docs.map((d) => studyFromData(d.id, d.data(estimate))).filter((s): s is Study => s !== null),
    chat: chatSnap.exists() ? chatFromData(chatSnap.data(estimate)) : [],
  };
}

export type NewExpeditionContent = {
  notes: string;
  workspace: ExpeditionWorkspace;
  sites: FreeplaySite[];
  studies?: StudyInput[];
  chat?: StoredChatMessage[];
};

/** Creates an expedition (optionally from the signed-out draft, studies and chat included). Returns its id. */
export async function createExpedition(uid: string, name: string, content: NewExpeditionContent): Promise<string> {
  const ref = await addDoc(expeditionsCol(uid), newExpeditionToData(name, content));
  const studies = content.studies ?? [], chat = content.chat ?? [];
  if (studies.length || chat.length) {
    const batch = writeBatch(getDb());
    for (const s of studies) batch.set(doc(studiesCol(uid, ref.id)), studyToData(s));
    if (chat.length) batch.set(chatRef(uid, ref.id), chatToData(chat));
    await batch.commit();
  }
  return ref.id;
}

export async function updateExpedition(
  uid: string,
  id: string,
  patch: { name?: string; notes?: string; workspace?: ExpeditionWorkspace; sites?: FreeplaySite[]; opened?: boolean },
): Promise<void> {
  await setDoc(expeditionRef(uid, id), expeditionPatchToData(patch), { merge: true });
}

export async function saveChat(uid: string, id: string, messages: StoredChatMessage[]): Promise<void> {
  await setDoc(chatRef(uid, id), chatToData(messages));
}

export async function addStudy(uid: string, id: string, input: StudyInput): Promise<string> {
  const ref = await addDoc(studiesCol(uid, id), studyToData(input));
  return ref.id;
}

export async function renameStudy(uid: string, id: string, studyId: string, label: string): Promise<void> {
  await updateDoc(doc(studiesCol(uid, id), studyId), { label: studyLabel(label) });
}

export async function deleteStudy(uid: string, id: string, studyId: string): Promise<void> {
  await deleteDoc(doc(studiesCol(uid, id), studyId));
}

/** Deletes the studies, the chat transcript and the expedition in one batch. */
export async function deleteExpedition(uid: string, id: string): Promise<void> {
  const studies = await getDocs(studiesCol(uid, id));
  const batch = writeBatch(getDb());
  for (const s of studies.docs) batch.delete(s.ref);
  batch.delete(chatRef(uid, id));
  batch.delete(expeditionRef(uid, id));
  await batch.commit();
}

/** Reports whether local writes to the expedition are still waiting for the server ("Syncing"). */
export function watchExpeditionSync(uid: string, id: string, onChange: (pending: boolean) => void): () => void {
  return onSnapshot(expeditionRef(uid, id), { includeMetadataChanges: true }, (snap) => onChange(snap.metadata.hasPendingWrites), () => onChange(false));
}

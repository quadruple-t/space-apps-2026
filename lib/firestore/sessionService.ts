/**
 * Named session bookmarks at users/{uid}/sessions/{id}. URL params remain the primary
 * session store; see sessionUrl.ts (re-exported here).
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import type { SavedSession, SessionState } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { savedSessionConverter, sessionToData } from "./converters";

export { decodeSessionFromUrl, encodeSessionToUrl } from "./sessionUrl";

function sessionsCol(uid: string) {
  return collection(getDb(), COLLECTIONS.users, uid, "sessions");
}

/**
 * Create (no id) or overwrite (id) a named session. Returns the session id.
 * Overwrites keep createdAt (merge write; createdAt is only set on create).
 */
export async function saveSession(uid: string, name: string, state: SessionState, id?: string): Promise<string> {
  if (id) {
    await setDoc(doc(sessionsCol(uid), id), sessionToData(name, state, false), { merge: true });
    return id;
  }
  const ref = await addDoc(sessionsCol(uid), sessionToData(name, state, true));
  return ref.id;
}

/** Most recently updated first. */
export async function listSessions(uid: string): Promise<SavedSession[]> {
  const snap = await getDocs(query(sessionsCol(uid), orderBy("updatedAt", "desc")).withConverter(savedSessionConverter));
  return snap.docs.map((d) => d.data());
}

export async function deleteSession(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(sessionsCol(uid), id));
}

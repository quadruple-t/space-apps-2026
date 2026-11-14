"use client";

/**
 * Google sign-in state for client components.
 *
 * Auth state lives in a module-level external store fed by onAuthStateChanged and read with
 * useSyncExternalStore (no setState-in-effect). When a user signs in, the store runs
 * ensureUserDoc and the localStorage -> Firestore progress merge once per uid before
 * reporting `loading: false`, so consumers never see a half-initialised account.
 */
import { useSyncExternalStore } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { mergeLocalProgressIntoFirestore } from "@/lib/firestore/progressService";
import { ensureUserDoc } from "./ensureUserDoc";

export interface AuthSnapshot {
  user: User | null;
  loading: boolean;
  /** last error from sign-in or account setup, if any */
  error: Error | null;
}

const SERVER_SNAPSHOT: AuthSnapshot = { user: null, loading: true, error: null };

let snapshot: AuthSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let stopAuthListener: (() => void) | null = null;
const initialisedUids = new Map<string, Promise<void>>();

function setSnapshot(next: AuthSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

/** ensureUserDoc + progress merge, once per uid per page load. */
function initialiseUser(user: User): Promise<void> {
  let p = initialisedUids.get(user.uid);
  if (!p) {
    p = (async () => {
      await ensureUserDoc(user);
      await mergeLocalProgressIntoFirestore(user.uid);
    })();
    initialisedUids.set(user.uid, p);
    p.catch(() => initialisedUids.delete(user.uid));
  }
  return p;
}

function startListening(): void {
  if (stopAuthListener) return;
  stopAuthListener = onAuthStateChanged(
    getFirebaseAuth(),
    (user) => {
      if (!user) {
        setSnapshot({ user: null, loading: false, error: null });
        return;
      }
      setSnapshot({ user, loading: true, error: null });
      initialiseUser(user).then(
        () => {
          if (snapshot.user?.uid === user.uid) setSnapshot({ user, loading: false, error: null });
        },
        (e: unknown) => {
          if (snapshot.user?.uid === user.uid) {
            setSnapshot({ user, loading: false, error: e instanceof Error ? e : new Error(String(e)) });
          }
        },
      );
    },
    (e) => setSnapshot({ user: null, loading: false, error: e }),
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  startListening();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthSnapshot {
  return snapshot;
}

function getServerSnapshot(): AuthSnapshot {
  return SERVER_SNAPSHOT;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const cred = await signInWithPopup(getFirebaseAuth(), provider);
    await initialiseUser(cred.user);
    return cred.user;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    setSnapshot({ ...snapshot, error });
    throw error;
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(getFirebaseAuth());
}

export interface UseAuthResult extends AuthSnapshot {
  signInWithGoogle: () => Promise<User>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...state, signInWithGoogle, signOut };
}

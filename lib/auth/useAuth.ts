"use client";

/**
 * Sign-in state for client components (Google or email/password; signing in is always optional).
 *
 * Auth state lives in a module-level external store fed by onAuthStateChanged and read with
 * useSyncExternalStore (no setState-in-effect). When a user signs in, the store runs
 * ensureUserDoc and the localStorage -> Firestore progress merge once per uid before
 * reporting `loading: false`, so consumers never see a half-initialised account.
 */
import { useSyncExternalStore } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
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

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function startListening(): void {
  if (stopAuthListener) return;
  let auth;
  try {
    auth = getFirebaseAuth();
  } catch (e) {
    // Firebase not configured: stay signed out so every account-free feature keeps working.
    stopAuthListener = () => {};
    setSnapshot({ user: null, loading: false, error: toError(e) });
    return;
  }
  stopAuthListener = onAuthStateChanged(
    auth,
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

/** Runs an auth action; failures land in the snapshot's `error` and are rethrown. */
async function runAuthAction<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (e) {
    const error = toError(e);
    setSnapshot({ ...snapshot, error });
    throw error;
  }
}

/** Re-emit the snapshot after the current User object was mutated (profile update, reload). */
function notifyUserChanged(user: User): void {
  if (snapshot.user?.uid === user.uid) setSnapshot({ ...snapshot });
}

export function signInWithGoogle(): Promise<User> {
  return runAuthAction(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const cred = await signInWithPopup(getFirebaseAuth(), provider);
    await initialiseUser(cred.user);
    return cred.user;
  });
}

export function signInWithEmail(email: string, password: string): Promise<User> {
  return runAuthAction(async () => {
    const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    await initialiseUser(cred.user);
    return cred.user;
  });
}

/**
 * Creates an email/password account, sets its display name and sends a verification email.
 * Verification is offered, never required: nothing in the app checks emailVerified.
 */
export function signUpWithEmail(email: string, password: string, displayName: string): Promise<User> {
  return runAuthAction(async () => {
    const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    const user = cred.user;
    const name = displayName.trim();
    if (name) {
      await updateProfile(user, { displayName: name });
      notifyUserChanged(user);
    }
    await initialiseUser(user);
    // onAuthStateChanged may have created users/{uid} before the name was set; backfill it.
    if (name) await ensureUserDoc(user);
    try {
      await sendEmailVerification(user);
    } catch {
      // Optional step: the account works without it and the menu offers a resend.
    }
    return user;
  });
}

export function sendPasswordReset(email: string): Promise<void> {
  return runAuthAction(() => sendPasswordResetEmail(getFirebaseAuth(), email.trim()));
}

export function resendVerification(): Promise<void> {
  return runAuthAction(async () => {
    const user = getFirebaseAuth().currentUser;
    if (!user) throw Object.assign(new Error("Not signed in"), { code: "auth/no-current-user" });
    await sendEmailVerification(user);
  });
}

/** Refreshes the signed-in user (e.g. to pick up emailVerified after the link was clicked). */
export async function reloadUser(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return;
  try {
    await reload(user);
    notifyUserChanged(user);
  } catch {
    // Best effort; stale verification status is harmless.
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(getFirebaseAuth());
}

export interface UseAuthResult extends AuthSnapshot {
  signInWithGoogle: () => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<User>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  reloadUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    ...state,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    resendVerification,
    reloadUser,
    signOut,
  };
}

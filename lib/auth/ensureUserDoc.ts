/**
 * Creates users/{uid} on first sign-in; later sign-ins bump lastSeenAt (and fill a missing displayName).
 * expertMode starts false and is only ever set by progressService.enableExpertMode.
 */
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDb } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firestore/collections";

export type UserProfileFields = Pick<User, "uid" | "displayName" | "email" | "photoURL">;

/** Returns true when the doc was created by this call. */
export async function ensureUserDoc(user: UserProfileFields): Promise<boolean> {
  const db = getDb();
  const ref = doc(db, COLLECTIONS.users, user.uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      // Email sign-up sets the display name just after the account exists; backfill it once.
      const backfillName = !snap.get("displayName") && user.displayName ? { displayName: user.displayName } : {};
      tx.update(ref, { lastSeenAt: serverTimestamp(), ...backfillName });
      return false;
    }
    tx.set(ref, {
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      expertMode: false,
    });
    return true;
  });
}

import "server-only";

import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function firebaseAdminApp(): App {
  const existing = getApps().find((app) => app.name === "shadowline-api");
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const accountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (accountJson) {
    const account = JSON.parse(accountJson) as { project_id?: string; client_email: string; private_key: string };
    return initializeApp({
      credential: cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key.replace(/\\n/g, "\n") }),
      projectId: projectId ?? account.project_id,
    }, "shadowline-api");
  }

  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  return initializeApp({
    ...(!emulator ? { credential: applicationDefault() } : {}),
    projectId: projectId ?? "shadowline-2t12",
    ...(emulator ? { firestore: { host: emulator, ssl: false } } : {}),
  }, "shadowline-api");
}

export const adminDb = () => getFirestore(firebaseAdminApp());
export async function verifyFirebaseToken(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const { getAuth } = await import("firebase-admin/auth");
  try {
    return await getAuth(firebaseAdminApp()).verifyIdToken(authorization.slice(7));
  } catch {
    return null;
  }
}

import "server-only";

import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccount = { project_id?: string; client_email: string; private_key: string };

function parseServiceAccount(value: string | undefined): ServiceAccount | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ServiceAccount> | null;
    return parsed && typeof parsed.client_email === "string" && typeof parsed.private_key === "string"
      ? parsed as ServiceAccount
      : null;
  } catch {
    return null;
  }
}

function firebaseAdminApp(): App {
  const existing = getApps().find((app) => app.name === "shadowline-api");
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const accountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (accountJson) {
    const account = parseServiceAccount(accountJson);
    if (!account) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be the full service-account JSON object, including client_email and private_key; a standalone private key is not valid JSON credentials.");
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

export function hasAdminCredentials(): boolean {
  if (parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIRESTORE_EMULATOR_HOST) return true;
  if (process.env.NODE_ENV !== "development") return true;
  return existsSync(path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json"));
}

export function adminCredentialsRequired(): Response {
  return Response.json({ error: { message: "Firebase Admin credentials are required for user data. Set FIREBASE_SERVICE_ACCOUNT_JSON to the full service-account JSON object (including client_email and private_key), or run gcloud auth application-default login." } }, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function verifyFirebaseToken(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const { getAuth } = await import("firebase-admin/auth");
  try {
    return await getAuth(firebaseAdminApp()).verifyIdToken(authorization.slice(7));
  } catch {
    return null;
  }
}

/**
 * Firebase client singletons (modular SDK only).
 *
 * Import this module only from client code ("use client" components, hooks, or the
 * lib/firestore services they call). The Node smoke test (scripts/smoke-emulator.ts)
 * also uses it; outside the browser Firestore falls back to an in-memory cache.
 */
import "client-only";

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const EMULATOR_HOST = "127.0.0.1";
/** Defaults match firebase.json; override only if those ports are taken locally. */
const AUTH_EMULATOR_PORT = Number(process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT) || 9099;
const FIRESTORE_EMULATOR_PORT = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT) || 8080;

/** Survives Next.js fast refresh so emulators are connected exactly once per page. */
interface ShadowlineFirebaseGlobal {
  __shadowlineFirestoreEmulator?: boolean;
  __shadowlineAuthEmulator?: boolean;
}
const flags = globalThis as typeof globalThis & ShadowlineFirebaseGlobal;

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

/** NEXT_PUBLIC_* values must be read literally so Next.js can inline them into the bundle. */
function readConfig(): FirebaseOptions {
  const config: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!config.projectId || !config.apiKey) {
    throw new Error(
      "Firebase is not configured: set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID (see .env.example).",
    );
  }
  return config;
}

export function isEmulatorMode(): boolean {
  return process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR === "true";
}

export function getFirebaseApp(): FirebaseApp {
  if (appInstance) return appInstance;
  appInstance = getApps().length > 0 ? getApp() : initializeApp(readConfig());
  return appInstance;
}

function canPersist(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export function getDb(): Firestore {
  if (dbInstance) return dbInstance;
  const app = getFirebaseApp();
  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: canPersist()
        ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
        : memoryLocalCache(),
    });
  } catch {
    // Already initialised (e.g. after fast refresh): reuse the existing instance.
    db = getFirestore(app);
  }
  if (isEmulatorMode() && !flags.__shadowlineFirestoreEmulator) {
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    flags.__shadowlineFirestoreEmulator = true;
  }
  dbInstance = db;
  return db;
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  const auth = getAuth(getFirebaseApp());
  if (isEmulatorMode() && !flags.__shadowlineAuthEmulator) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, { disableWarnings: true });
    flags.__shadowlineAuthEmulator = true;
  }
  authInstance = auth;
  return auth;
}

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  collection,
  documentId,
  doc as createDoc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type Firestore as ClientFirestore,
} from "firebase/firestore";
import type { Firestore as AdminFirestore } from "firebase-admin/firestore";

type SnapshotLike = {
  id: string;
  exists: boolean;
  data(): DocumentData | undefined;
  get(field: string): unknown;
};

/** Public read-only Firestore adapter for local development without Admin credentials. */
export function publicReadDb(): AdminFirestore {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) throw new Error("Set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID for local public data access.");

  const appName = "shadowline-public-api";
  const app = getApps().some((item) => item.name === appName)
    ? getApp(appName)
    : initializeApp({ projectId, apiKey }, appName);
  const firestore: ClientFirestore = getFirestore(app);

  const doc = (path: string) => {
    const ref = createDoc(firestore, path);
    return {
      async get(): Promise<SnapshotLike> {
        const snapshot = await getDoc(ref);
        return { id: snapshot.id, exists: snapshot.exists(), data: () => snapshot.data(), get: (field) => snapshot.get(field) };
      },
    };
  };

  // A single query avoids opening a separate Firestore listener for each part
  // of a large public globe snapshot. The caller validates the document paths.
  const readCatalogBatch = async (paths: string[]): Promise<SnapshotLike[]> => {
    if (paths.length === 0) return [];
    if (paths.length > 10 || paths.some((path) => !/^catalog\/[^/]+$/.test(path))) throw new Error("Invalid public batch read");
    const ids = paths.map((path) => path.slice("catalog/".length));
    const snapshots = await getDocs(query(collection(firestore, "catalog"), where(documentId(), "in", ids)));
    const found = new Map(snapshots.docs.map((snapshot) => [snapshot.id, snapshot]));
    return ids.map((id) => {
      const snapshot = found.get(id);
      return { id, exists: !!snapshot, data: () => snapshot?.data(), get: (field: string) => snapshot?.get(field) };
    });
  };

  const collectionQuery = (name: string, options: { pageSize?: number; cursor?: string; ordered?: boolean } = {}) => ({
    orderBy: () => collectionQuery(name, { ...options, ordered: true }),
    limit: (pageSize: number) => collectionQuery(name, { ...options, pageSize }),
    startAfter: (cursor: string) => collectionQuery(name, { ...options, cursor }),
    async get() {
      const constraints = [];
      if (options.ordered) constraints.push(orderBy(documentId()));
      if (options.cursor) constraints.push(startAfter(options.cursor));
      if (options.pageSize) constraints.push(limit(options.pageSize));
      const snapshot = await getDocs(query(collection(firestore, name), ...constraints));
      return { docs: snapshot.docs.map((item) => ({ id: item.id, exists: true, data: () => item.data() })), size: snapshot.size };
    },
  });

  return { doc, readCatalogBatch, collection: collectionQuery } as unknown as AdminFirestore;
}

/** Cached single-document and whole-collection reads for static content. */
import { collection, doc, getDoc, getDocs, type FirestoreDataConverter } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { cached } from "./cache";
import { DocumentNotFoundError } from "./errors";

/** Fetch one static doc once; resolves null when it does not exist. */
export function fetchStaticDoc<T>(path: string, converter: FirestoreDataConverter<T>): Promise<T | null> {
  return cached(`doc:${path}`, async () => {
    const snap = await getDoc(doc(getDb(), path).withConverter(converter));
    return snap.exists() ? snap.data() : null;
  });
}

/** Like fetchStaticDoc but rejects with DocumentNotFoundError when missing. */
export async function fetchRequiredStaticDoc<T>(path: string, converter: FirestoreDataConverter<T>): Promise<T> {
  const value = await fetchStaticDoc(path, converter);
  if (value === null) throw new DocumentNotFoundError(path);
  return value;
}

/** Fetch a whole (small) static collection once. */
export function fetchStaticCollection<T>(name: string, converter: FirestoreDataConverter<T>): Promise<T[]> {
  return cached(`col:${name}`, async () => {
    const snap = await getDocs(collection(getDb(), name).withConverter(converter));
    return snap.docs.map((d) => d.data());
  });
}

import { readGlobeAsset } from "./globe-asset-reader";

type Db = Parameters<typeof readGlobeAsset>[0];
type Result = Awaited<ReturnType<typeof readGlobeAsset>>;
const MAX_BYTES = 32 * 1024 * 1024;
const cache = new Map<string, Result>();
const pending = new Map<string, Promise<Result>>();
let cachedBytes = 0;

/** Share immutable, checksum-verified images between requests in this server process. */
export async function readCachedGlobeAsset(db: Db, id: string, hash: string | null): Promise<Result> {
  // Unversioned downloads must always resolve the current Firestore manifest.
  if (!hash) return readGlobeAsset(db, id, hash);
  const key = `${id}:${hash}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const request = readGlobeAsset(db, id, hash).then((result) => {
    // The larger scientific archive is a download, not an image; don't pin it in memory.
    if (result.asset.contentType.startsWith("image/") && result.data.length <= MAX_BYTES) {
      while (cachedBytes + result.data.length > MAX_BYTES) {
        const oldest = cache.keys().next().value as string | undefined;
        if (!oldest) break;
        cachedBytes -= cache.get(oldest)!.data.length;
        cache.delete(oldest);
      }
      cache.set(key, result);
      cachedBytes += result.data.length;
    }
    return result;
  });
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}

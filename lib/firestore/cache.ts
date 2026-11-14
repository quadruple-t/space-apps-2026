/**
 * In-memory promise cache for static documents. Each key is fetched at most once per page
 * load; concurrent callers share the same in-flight promise. A rejected load is evicted so a
 * later call can retry (e.g. after the network comes back).
 */
const cache = new Map<string, Promise<unknown>>();

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const p = load();
  cache.set(key, p);
  p.catch(() => {
    if (cache.get(key) === p) cache.delete(key);
  });
  return p;
}

/** Test/HMR helper. */
export function clearStaticCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

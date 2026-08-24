/**
 * Light in-memory fetch cache (SWR-style): dedupe in-flight requests + short TTL.
 * Used for hot list/detail reads without adding a SWR dependency.
 */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 30_000;

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCached<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCached(prefixOrKey: string): void {
  if (store.has(prefixOrKey)) store.delete(prefixOrKey);
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefixOrKey)) store.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) inflight.delete(key);
  }
}

/** Test helper: drop all cached entries. */
export function clearFetchCache(): void {
  store.clear();
  inflight.clear();
}

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number; force?: boolean },
): Promise<T> {
  if (!opts?.force) {
    const hit = getCached<T>(key);
    if (hit !== undefined) return hit;
    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
  }

  const promise = fetcher()
    .then((value) => {
      setCached(key, value, opts?.ttlMs ?? DEFAULT_TTL_MS);
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

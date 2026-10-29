const DB_NAME = "harbor-blob-cache";
const DB_VERSION = 1;
const STORE = "entries";

export type IdbCacheEntry = { at: number; data: unknown };

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let request: IDBRequest;
        try {
          request = work(db.transaction(STORE, mode).objectStore(STORE));
        } catch {
          resolve(null);
          return;
        }
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => resolve(null);
      }),
  );
}

export const IDB_CACHE_MAX_ENTRIES = 2000;
// Trimming below the cap leaves headroom, so a full store is not rescanned on every write.
const TRIM_TARGET = Math.floor(IDB_CACHE_MAX_ENTRIES * 0.9);
// Only these refetchable caches count toward the cap and get trimmed; pins, indexes and snapshots are never evicted.
export const TRIMMABLE_PREFIXES = [
  "cinemeta.meta.v1:",
  "tmdb.catalog.v1:",
  "tmdb.title.v1:",
  "anizip.v1:",
  "addon.catalog.v1:",
  "addon.meta.v1:",
  "imdb.rating.v1:",
  "simkl.allitems.v1:",
  "trakt.sync.v1:",
  "harbor.sa.v1.",
];

function trimmable(key: string): boolean {
  return TRIMMABLE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function idbCacheGet(key: string): Promise<IdbCacheEntry | null> {
  return run<IdbCacheEntry>("readonly", (store) => store.get(key));
}

/** Reads an entry, deleting it and returning null once it is older than `maxAgeMs`. */
export async function idbCacheGetFresh(
  key: string,
  maxAgeMs: number,
): Promise<IdbCacheEntry | null> {
  const entry = await idbCacheGet(key);
  if (!entry || typeof entry.at !== "number") return null;
  if (Date.now() - entry.at <= maxAgeMs) return entry;
  await idbCacheDelete(key);
  return null;
}

// Upper bound on the store size: the last counted size plus every write since, so a count runs only near the cap.
let sizeBound: number | null = null;

export async function idbCacheSet(key: string, entry: IdbCacheEntry): Promise<void> {
  await run("readwrite", (store) => store.put(entry, key));
  if (!trimmable(key)) return;
  if (sizeBound != null && sizeBound < IDB_CACHE_MAX_ENTRIES) {
    sizeBound += 1;
    return;
  }
  const keys = await run<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
  const count = keys == null ? null : keys.filter((k) => trimmable(String(k))).length;
  sizeBound = count;
  if (count != null && count > IDB_CACHE_MAX_ENTRIES) {
    // A trim that skipped rewritten keys or failed leaves more behind; track what actually remains.
    sizeBound = (await trimTo(TRIM_TARGET)) ?? null;
  }
}

// Walks the store with a cursor, keeping only each trimmable key and its `at`, so large values are not collected.
function readTrimmableAges(): Promise<Array<[string, number]> | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const store = db.transaction(STORE, "readonly").objectStore(STORE);
          const ages: Array<[string, number]> = [];
          const req = store.openCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
              resolve(ages);
              return;
            }
            const key = String(cursor.key);
            if (trimmable(key)) {
              const value = cursor.value as Partial<IdbCacheEntry> | null;
              ages.push([key, Number(value?.at) || 0]);
            }
            cursor.continue();
          };
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

// Deletes each key in one transaction, skipping any rewritten since the scan; resolves to how many it deleted.
function deleteIfUnchanged(doomed: Array<[string, number]>): Promise<number> {
  return openDb().then(
    (db) =>
      new Promise<number>((resolve) => {
        if (!db) {
          resolve(0);
          return;
        }
        let deleted = 0;
        try {
          const tx = db.transaction(STORE, "readwrite");
          const store = tx.objectStore(STORE);
          for (const [key, at] of doomed) {
            const req = store.get(key);
            req.onsuccess = () => {
              const value = req.result as Partial<IdbCacheEntry> | undefined;
              if (value && (Number(value.at) || 0) === at) {
                store.delete(key).onsuccess = () => {
                  deleted += 1;
                };
              }
            };
          }
          tx.oncomplete = () => resolve(deleted);
          tx.onerror = () => resolve(0);
          tx.onabort = () => resolve(0);
        } catch {
          resolve(0);
        }
      }),
  );
}

let trimmingResult: Promise<number | null> | null = null;

// Resolves to how many trimmable entries remain, or null when the store could not be read.
function trimTo(keep: number): Promise<number | null> {
  trimmingResult ??= (async () => {
    const ages = await readTrimmableAges();
    if (!ages) return null;
    if (ages.length <= keep) return ages.length;
    ages.sort((a, b) => a[1] - b[1]);
    const deleted = await deleteIfUnchanged(ages.slice(0, ages.length - Math.max(0, keep)));
    return ages.length - deleted;
  })().finally(() => {
    trimmingResult = null;
  });
  return trimmingResult;
}

/** Deletes the oldest trimmable cache entries (by `at`) until at most `keep` remain. */
export function idbCacheTrim(keep: number): Promise<void> {
  return trimTo(keep).then(() => undefined);
}

export function idbCacheDelete(key: string): Promise<void> {
  return run("readwrite", (store) => store.delete(key)).then(() => undefined);
}

export function idbCacheKeys(): Promise<string[]> {
  return run<IDBValidKey[]>("readonly", (store) => store.getAllKeys()).then((keys) =>
    (keys ?? []).map(String),
  );
}

export function evictLocalPrefix(prefix: string, keep?: (key: string) => boolean): number {
  let dropped = 0;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && !keep?.(key)) doomed.push(key);
    }
    for (const key of doomed) {
      localStorage.removeItem(key);
      dropped += 1;
    }
  } catch {}
  return dropped;
}

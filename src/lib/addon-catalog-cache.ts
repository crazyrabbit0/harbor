import { idbCacheGetFresh, idbCacheSet } from "@/lib/idb-cache";
import { registerEvictable } from "@/lib/maintenance";

// Every catalog of every installed addon is swept by the home page AND by the
// anime page, both on mount, with the anime page then discarding everything that
// is not anime. On a loaded profile that is the great majority of the bridge
// crossings a cold boot pays, and tab hopping paid it again every single time.
// One short-lived memory cache in front of the row fetch, shared by all callers,
// plus in-flight dedupe so two surfaces mounting at once ask once.
const TTL_MS = 10 * 60 * 1000;
const FAIL_TTL_MS = 15 * 1000;
const MAX_ENTRIES = 80;
// Successful rows also persist in IndexedDB, so a restart within DISK_TTL_MS reuses them.
export const CATALOG_DISK_PREFIX = "addon.catalog.v1:";
const DISK_TTL_MS = 30 * 60 * 1000;

export type CatalogLoad<T> = { value: T; ok: boolean };

type Entry<T> = { v: T; t: number; ttl: number };

const rows = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

registerEvictable("addon-catalog-rows", (aggressive) => {
  if (aggressive) return rows.clear();
  const now = Date.now();
  for (const [k, e] of rows) if (now - e.t > e.ttl) rows.delete(k);
});

function remember(key: string, entry: Entry<unknown>): void {
  if (rows.size >= MAX_ENTRIES) {
    const oldest = rows.keys().next().value;
    if (oldest !== undefined) rows.delete(oldest);
  }
  rows.set(key, entry);
}

// The disk copy only stands in for the first read of a key per session; later misses refetch.
const diskRead = new Set<string>();

async function readDisk<T>(key: string): Promise<{ at: number; value: T } | null> {
  try {
    const entry = await idbCacheGetFresh(CATALOG_DISK_PREFIX + key, DISK_TTL_MS);
    return entry ? { at: entry.at, value: entry.data as T } : null;
  } catch {
    return null;
  }
}

export function cachedCatalogRow<T>(
  key: string,
  load: () => Promise<CatalogLoad<T>>,
): Promise<CatalogLoad<T>> {
  const hit = rows.get(key);
  if (hit && Date.now() - hit.t < hit.ttl) return Promise.resolve(hit.v as CatalogLoad<T>);
  const existing = inflight.get(key);
  if (existing) return existing as Promise<CatalogLoad<T>>;
  const p = (async () => {
    try {
      const stored = diskRead.has(key) ? null : await readDisk<T>(key);
      diskRead.add(key);
      if (stored) {
        const v: CatalogLoad<T> = { value: stored.value, ok: true };
        remember(key, { v, t: Date.now(), ttl: TTL_MS });
        return v;
      }
      const v = await load();
      remember(key, { v, t: Date.now(), ttl: v.ok ? TTL_MS : FAIL_TTL_MS });
      if (v.ok) {
        void idbCacheSet(CATALOG_DISK_PREFIX + key, { at: Date.now(), data: v.value }).catch(
          () => {},
        );
      }
      return v;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

// Movie and series metas share the disk layer; only a found meta or a definitive 404 is stored.
export const META_DISK_PREFIX = "addon.meta.v1:";
const META_TTL_MS = { movie: 3 * 60 * 60 * 1000, series: 30 * 60 * 1000 };
// An addon that has no entry for an id rarely gains one within a day.
const META_MISS_TTL_MS = 12 * 60 * 60 * 1000;
const META_MAX_CHARS = 1_000_000;
const metaInflight = new Map<string, Promise<unknown>>();
const metaDiskRead = new Set<string>();

export type MetaFetch<T> = { value: T | null; cacheable: boolean; chars?: number };

// A meta past its freshness limit is still shown at once and refreshed after startup, one request at a time.
const META_STALE_MS = 24 * 60 * 60 * 1000;
const META_REFRESH_DELAY_MS = 20_000;
const META_REFRESH_GAP_MS = 400;
const refreshQueue = new Map<string, () => Promise<MetaFetch<unknown>>>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function storeMeta<T>(url: string, r: MetaFetch<T>): T | null {
  if (r.cacheable && (r.chars ?? 0) <= META_MAX_CHARS) {
    void idbCacheSet(META_DISK_PREFIX + url, { at: Date.now(), data: r.value }).catch(() => {});
  }
  return r.value;
}

function drainRefreshes(): void {
  refreshTimer = null;
  const next = refreshQueue.entries().next();
  if (next.done) return;
  const [url, load] = next.value;
  refreshQueue.delete(url);
  void load()
    .then((r) => storeMeta(url, r))
    .catch(() => {})
    .finally(() => {
      if (refreshQueue.size > 0 && refreshTimer == null)
        refreshTimer = setTimeout(drainRefreshes, META_REFRESH_GAP_MS);
    });
}

function scheduleMetaRefresh<T>(url: string, load: () => Promise<MetaFetch<T>>): void {
  refreshQueue.set(url, load);
  if (refreshTimer != null) return;
  refreshTimer = setTimeout(drainRefreshes, META_REFRESH_DELAY_MS);
  (refreshTimer as { unref?: () => void }).unref?.();
}

export function cachedAddonMeta<T>(
  type: string,
  url: string,
  load: () => Promise<MetaFetch<T>>,
): Promise<T | null> {
  if (type !== "movie" && type !== "series") return load().then((r) => r.value);
  const existing = metaInflight.get(url);
  if (existing) return existing as Promise<T | null>;
  const p = (async () => {
    try {
      const entry = metaDiskRead.has(url)
        ? null
        : await idbCacheGetFresh(META_DISK_PREFIX + url, META_STALE_MS).catch(() => null);
      metaDiskRead.add(url);
      if (entry && (entry.data != null || Date.now() - entry.at < META_MISS_TTL_MS)) {
        if (entry.data != null && Date.now() - entry.at > META_TTL_MS[type])
          scheduleMetaRefresh(url, load);
        return (entry.data ?? null) as T | null;
      }
      return storeMeta(url, await load());
    } finally {
      metaInflight.delete(url);
    }
  })();
  metaInflight.set(url, p);
  return p;
}

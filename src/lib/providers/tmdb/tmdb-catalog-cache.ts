import { lruGet, lruSet } from "@/lib/cache";
import type { IdbCacheEntry } from "@/lib/idb-cache";

const TTL_MS = 5 * 60_000;
const MAX_CATALOG_PAGES = 128;
export const MAX_TITLE_BUNDLES = 64;
export const PERSISTED_CATALOG_TTL_MS = 3 * 60 * 60_000;
export const PERSISTED_TITLE_TTL_MS = 24 * 60 * 60_000;
export const PERSISTED_TITLE_MAX_CHARS = 1024 * 1024;
export const PERSISTED_CATALOG_PREFIX = "tmdb.catalog.v1:";
export const PERSISTED_TITLE_PREFIX = "tmdb.title.v1:";

// Only public catalog pages: never account, session, search, or personalized state.
export function isCatalogPath(path: string): boolean {
  return /^(discover\/(movie|tv)|trending\/(movie|tv|all)\/(day|week)|(movie|tv)\/(popular|top_rated|now_playing|upcoming|on_the_air|airing_today))$/.test(
    path,
  );
}

// Public per-title detail bundles and their sub-resources, never account or rating state.
export function isTitlePath(path: string): boolean {
  return /^(movie|tv)\/\d+(\/(images|videos|credits|aggregate_credits|external_ids))?$/.test(path);
}

export function createCatalogCache(now: () => number = Date.now, maxEntries = MAX_CATALOG_PAGES) {
  const pages = new Map<string, { expires: number; data: unknown }>();
  return {
    get<T>(key: string): T | undefined {
      const entry = lruGet(pages, key);
      if (!entry) return undefined;
      if (entry.expires <= now()) {
        pages.delete(key);
        return undefined;
      }
      // Callers enrich metadata; never let that mutate a later caller's page.
      return structuredClone(entry.data) as T;
    },
    set(key: string, data: unknown): void {
      if (data == null) return;
      lruSet(pages, key, { expires: now() + TTL_MS, data: structuredClone(data) }, maxEntries);
    },
  };
}

// Drops api_key so the stored key never holds the secret; every other parameter keeps it scoped.
export function persistedCatalogKey(url: string, prefix = PERSISTED_CATALOG_PREFIX): string {
  const parsed = new URL(url);
  parsed.searchParams.delete("api_key");
  return `${prefix}${parsed.toString()}`;
}

export type CatalogStore = {
  idbCacheGet(key: string): Promise<IdbCacheEntry | null>;
  idbCacheSet(key: string, entry: IdbCacheEntry): Promise<void>;
  idbCacheDelete(key: string): Promise<void>;
};

// TMDB answers some failures with 200 and `success: false`; those and empty bodies are never stored.
function persistable(data: unknown): boolean {
  if (data == null || typeof data !== "object") return false;
  if ((data as { success?: unknown }).success === false) return false;
  return Object.keys(data).length > 0;
}

// The store loads lazily so modules evaluated without IndexedDB fall through to the network.
export function createPersistentCatalog(
  options: {
    store?: () => Promise<CatalogStore>;
    now?: () => number;
    prefix?: string;
    ttlMs?: number;
    maxChars?: number;
  } = {},
) {
  const store = options.store ?? (() => import("@/lib/idb-cache"));
  const now = options.now ?? Date.now;
  const prefix = options.prefix ?? PERSISTED_CATALOG_PREFIX;
  const ttlMs = options.ttlMs ?? PERSISTED_CATALOG_TTL_MS;
  const maxChars = options.maxChars;
  return {
    async read<T>(url: string): Promise<T | null> {
      try {
        const db = await store();
        const key = persistedCatalogKey(url, prefix);
        const entry = await db.idbCacheGet(key);
        if (!entry || typeof entry.at !== "number" || entry.data == null) return null;
        if (now() - entry.at >= ttlMs) {
          void db.idbCacheDelete(key).catch(() => {});
          return null;
        }
        return entry.data as T;
      } catch {
        return null;
      }
    },
    write(url: string, data: unknown): void {
      if (!persistable(data)) return;
      // Oversized bodies (long-running shows' credits) stay memory-only so they can't bloat the shared store.
      if (maxChars !== undefined && JSON.stringify(data).length > maxChars) return;
      const entry: IdbCacheEntry = { at: now(), data: structuredClone(data) };
      void store()
        .then((db) => db.idbCacheSet(persistedCatalogKey(url, prefix), entry))
        .catch(() => {});
    },
  };
}

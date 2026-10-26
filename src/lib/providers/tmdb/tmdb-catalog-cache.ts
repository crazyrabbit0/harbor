import { lruGet, lruSet } from "@/lib/cache";
import type { IdbCacheEntry } from "@/lib/idb-cache";

const TTL_MS = 5 * 60_000;
const MAX_CATALOG_PAGES = 128;
export const PERSISTED_CATALOG_TTL_MS = 3 * 60 * 60_000;
const PERSISTED_PREFIX = "tmdb.catalog.v1:";

// Only public catalog pages: never account, session, search, or personalized state.
export function isCatalogPath(path: string): boolean {
  return /^(discover\/(movie|tv)|trending\/(movie|tv|all)\/(day|week)|(movie|tv)\/(popular|top_rated|now_playing|upcoming|on_the_air|airing_today))$/.test(
    path,
  );
}

export function createCatalogCache(now: () => number = Date.now) {
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
      lruSet(
        pages,
        key,
        { expires: now() + TTL_MS, data: structuredClone(data) },
        MAX_CATALOG_PAGES,
      );
    },
  };
}

// Drops api_key so the stored key never holds the secret; every other parameter keeps it scoped.
export function persistedCatalogKey(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete("api_key");
  return `${PERSISTED_PREFIX}${parsed.toString()}`;
}

export type CatalogStore = {
  idbCacheGet(key: string): Promise<IdbCacheEntry | null>;
  idbCacheSet(key: string, entry: IdbCacheEntry): Promise<void>;
  idbCacheDelete(key: string): Promise<void>;
};

// The store loads lazily so modules evaluated without IndexedDB fall through to the network.
export function createPersistentCatalog(
  options: { store?: () => Promise<CatalogStore>; now?: () => number } = {},
) {
  const store = options.store ?? (() => import("@/lib/idb-cache"));
  const now = options.now ?? Date.now;
  return {
    async read<T>(url: string): Promise<T | null> {
      try {
        const db = await store();
        const key = persistedCatalogKey(url);
        const entry = await db.idbCacheGet(key);
        if (!entry || typeof entry.at !== "number" || entry.data == null) return null;
        if (now() - entry.at >= PERSISTED_CATALOG_TTL_MS) {
          void db.idbCacheDelete(key).catch(() => {});
          return null;
        }
        return entry.data as T;
      } catch {
        return null;
      }
    },
    write(url: string, data: unknown): void {
      if (data == null) return;
      const entry: IdbCacheEntry = { at: now(), data: structuredClone(data) };
      void store()
        .then((db) => db.idbCacheSet(persistedCatalogKey(url), entry))
        .catch(() => {});
    },
  };
}

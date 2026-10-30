import type { LibraryEntry } from "./types";

const MAX_KEYS = 4;

// Per-API-key library lists; old keys (a replaced or removed token) are dropped instead of kept for the session.
export function createLibraryCache(ttlMs: number) {
  const entries = new Map<string, { at: number; data: LibraryEntry[] }>();
  return {
    get(key: string): LibraryEntry[] | null {
      const hit = entries.get(key);
      if (!hit) return null;
      if (Date.now() - hit.at >= ttlMs) {
        entries.delete(key);
        return null;
      }
      return hit.data;
    },
    set(key: string, data: LibraryEntry[]): void {
      entries.delete(key);
      entries.set(key, { at: Date.now(), data });
      while (entries.size > MAX_KEYS) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    delete(key: string): void {
      entries.delete(key);
    },
    get size(): number {
      return entries.size;
    },
  };
}

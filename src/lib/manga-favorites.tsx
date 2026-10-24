import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useProfiles } from "./profiles";
import { persistCritical } from "./storage-recovery";
import { notifyMangaLibraryChanged } from "./manga/library-events";

export type MangaFavEntry = {
  id: string;
  title: string;
  altTitle?: string;
  cover?: string;
  addedAt: number;
};

const PREFIX = "harbor.mangafav.v1.";
const keyFor = (pid: string) => PREFIX + pid;
const librarySync = new Map<string, Promise<void>>();

function syncLibrary(id: string, inLibrary: boolean): void {
  const pending = librarySync.get(id) ?? Promise.resolve();
  const next = pending
    .catch(() => {})
    .then(async () => {
      await (await import("./manga/api")).setMangaInLibrary(id, inLibrary);
      notifyMangaLibraryChanged();
    });
  librarySync.set(id, next);
  void next
    .catch((error) => console.warn("[manga-favorites] Suwayomi library sync failed", error))
    .finally(() => {
      if (librarySync.get(id) === next) librarySync.delete(id);
    });
}

function readMap(key: string): Map<string, MangaFavEntry> {
  const map = new Map<string, MangaFavEntry>();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return map;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return map;
    for (const el of arr) {
      if (el && typeof el.id === "string") {
        map.set(el.id, {
          id: el.id,
          title: typeof el.title === "string" ? el.title : "",
          altTitle: typeof el.altTitle === "string" ? el.altTitle : undefined,
          cover: typeof el.cover === "string" ? el.cover : undefined,
          addedAt: typeof el.addedAt === "number" ? el.addedAt : 0,
        });
      }
    }
  } catch {
    return new Map();
  }
  return map;
}

function writeMap(key: string, map: Map<string, MangaFavEntry>): void {
  persistCritical(key, JSON.stringify([...map.values()]));
}

export type MangaFavoritesStore = {
  items: Map<string, MangaFavEntry>;
  has: (id: string) => boolean;
  toggle: (input: { id: string; title?: string; altTitle?: string; cover?: string }) => void;
  /** Self-heals a stale entry after it re-resolves to a live id/cover. */
  repair: (
    oldId: string,
    next: { id: string; title?: string; altTitle?: string; cover?: string },
  ) => void;
  count: number;
};

const Ctx = createContext<MangaFavoritesStore | null>(null);

export function MangaFavoritesProvider({ children }: { children: ReactNode }) {
  const { activeId } = useProfiles();
  const pid = activeId ?? "default";
  const [items, setItems] = useState<Map<string, MangaFavEntry>>(() => readMap(keyFor(pid)));

  useEffect(() => {
    setItems(readMap(keyFor(pid)));
  }, [pid]);

  const value = useMemo<MangaFavoritesStore>(
    () => ({
      items,
      has: (id) => items.has(id),
      toggle: (input) => {
        const next = new Map(items);
        if (next.has(input.id)) {
          next.delete(input.id);
          syncLibrary(input.id, false);
        } else {
          next.set(input.id, {
            id: input.id,
            title: input.title ?? "",
            altTitle: input.altTitle,
            cover: input.cover,
            addedAt: Date.now(),
          });
          syncLibrary(input.id, true);
        }
        writeMap(keyFor(pid), next);
        setItems(next);
      },
      repair: (oldId, update) => {
        const current = items.get(oldId);
        if (!current) return;
        if (
          update.id === oldId &&
          (update.cover ?? current.cover) === current.cover &&
          (update.title ?? current.title) === current.title
        ) {
          return;
        }
        const next = new Map(items);
        next.delete(oldId);
        const existing = next.get(update.id);
        next.set(update.id, {
          ...current,
          id: update.id,
          title: update.title ?? current.title,
          altTitle: update.altTitle ?? current.altTitle,
          cover: update.cover ?? current.cover,
          addedAt: existing ? Math.min(existing.addedAt, current.addedAt) : current.addedAt,
        });
        writeMap(keyFor(pid), next);
        setItems(next);
        // Keep the server library pointing at the live id so it stays openable.
        if (update.id !== oldId) syncLibrary(update.id, true);
      },
      count: items.size,
    }),
    [items, pid],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMangaFavorites(): MangaFavoritesStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("manga favorites used outside its provider");
  return v;
}

export function useIsMangaFavorite(id?: string): boolean {
  const { items } = useMangaFavorites();
  return !!id && items.has(id);
}

export function removeMangaFavorites(pid: string): void {
  try {
    localStorage.removeItem(keyFor(pid));
  } catch {
    return;
  }
}

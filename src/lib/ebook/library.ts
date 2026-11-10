import { durableSetItem } from "@/lib/durable-store";
import type { EBook } from "./api";
import { attachEBookCovers, detachEBookCovers, eBookCoverRefs, releaseEBookCovers } from "./covers";

const KEY = "harbor.ebook.library.v1";
const FAVORITES_KEY = "harbor.ebook.favorites.v1";
const READ_LATER_KEY = "harbor.ebook.read-later.v1";
const LEGACY_KEY = "harbor.novel.library.v1";
const LEGACY_FAVORITES_KEY = "harbor.novel.favorites.v1";
const LEGACY_READ_LATER_KEY = "harbor.novel.read-later.v1";
const LIST_KEYS = [KEY, FAVORITES_KEY, READ_LATER_KEY];

/** The list as stored, with inline artwork moved out (an older entry or a legacy list is rewritten once). */
function readStored(key: string, legacyKey: string): EBook[] {
  try {
    const current = localStorage.getItem(key);
    const stored = current ?? localStorage.getItem(legacyKey) ?? "[]";
    const value = JSON.parse(stored) as EBook[];
    if (!Array.isArray(value)) return [];
    const list = value.map((ebook) =>
      detachEBookCovers({
        ...ebook,
        id: String(ebook.id).includes(":") ? String(ebook.id) : `anilist:${ebook.id}`,
        source: ebook.source ?? "anilist",
        authors: ebook.authors ?? [],
      }),
    );
    const next = JSON.stringify(list);
    if ((current == null && stored !== "[]") || (current != null && next !== current)) {
      try {
        durableSetItem(key, next);
      } catch {
        // A full store keeps the old copy; the list still reads from it.
      }
    }
    return list;
  } catch {
    return [];
  }
}

function toggle(key: string, legacyKey: string, ebook: EBook): boolean {
  const current = readStored(key, legacyKey);
  const removed = current.filter((item) => item.id === ebook.id);
  const exists = removed.length > 0;
  const next = exists
    ? current.filter((item) => item.id !== ebook.id)
    : [detachEBookCovers(ebook), ...current];
  durableSetItem(key, JSON.stringify(next));
  if (exists) {
    const stillUsed = new Set(LIST_KEYS.flatMap((k) => eBookCoverRefs(localStorage.getItem(k))));
    releaseEBookCovers(eBookCoverRefs(JSON.stringify(removed)), stillUsed);
  }
  window.dispatchEvent(new Event("harbor:ebook-library"));
  return !exists;
}

export function ebookLibrary(): EBook[] {
  return readStored(KEY, LEGACY_KEY).map(attachEBookCovers);
}

export function ebookInLibrary(id: string): boolean {
  return readStored(KEY, LEGACY_KEY).some((ebook) => ebook.id === id);
}

export function toggleEBookLibrary(ebook: EBook): boolean {
  return toggle(KEY, LEGACY_KEY, ebook);
}

export function favoriteEBooks(): EBook[] {
  return readStored(FAVORITES_KEY, LEGACY_FAVORITES_KEY).map(attachEBookCovers);
}

export function ebookIsFavorite(id: string): boolean {
  return readStored(FAVORITES_KEY, LEGACY_FAVORITES_KEY).some((ebook) => ebook.id === id);
}

export function toggleEBookFavorite(ebook: EBook): boolean {
  return toggle(FAVORITES_KEY, LEGACY_FAVORITES_KEY, ebook);
}

export function eBookReadLater(): EBook[] {
  return readStored(READ_LATER_KEY, LEGACY_READ_LATER_KEY).map(attachEBookCovers);
}

export function eBookIsReadLater(id: string): boolean {
  return readStored(READ_LATER_KEY, LEGACY_READ_LATER_KEY).some((ebook) => ebook.id === id);
}

export function toggleEBookReadLater(ebook: EBook): boolean {
  return toggle(READ_LATER_KEY, LEGACY_READ_LATER_KEY, ebook);
}

import { themeKvDelete, themeKvGet, themeKvPut } from "@/lib/theme-storage";
import type { EBook } from "./api";

// Inline (data:) eBook artwork, such as an EPUB's own cover, lives in IndexedDB; the durable lists keep this reference.
const REF_PREFIX = "harbor-ebook-cover:";
const KV_PREFIX = "ebook-cover:";
const FIELDS = ["cover", "internalCover", "banner"] as const;

const cache = new Map<string, string>();
const requested = new Set<string>();

const isInline = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("data:");

export function isEBookCoverRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(REF_PREFIX);
}

const kvKey = (ref: string) => `${KV_PREFIX}${ref.slice(REF_PREFIX.length)}`;
const refFor = (id: string, field: string) => `${REF_PREFIX}${encodeURIComponent(id)}|${field}`;

function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("harbor:ebook-library"));
}

/** The entry as stored: inline artwork (nested volumes included) replaced by references, the images saved. */
export function detachEBookCovers(ebook: EBook): EBook {
  let out = ebook;
  for (const field of FIELDS) {
    const value = ebook[field];
    if (!isInline(value)) continue;
    const ref = refFor(ebook.id, field);
    if (cache.get(ref) !== value) {
      cache.set(ref, value);
      void themeKvPut(kvKey(ref), value).then((ok) => {
        if (!ok) console.warn("[ebook-covers] could not store an inline cover in IndexedDB");
      });
    }
    out = { ...out, [field]: ref };
  }
  if (ebook.books?.length) {
    const books = ebook.books.map(detachEBookCovers);
    if (books.some((book, i) => book !== ebook.books?.[i])) out = { ...out, books };
  }
  return out;
}

function resolve(ref: string): string | undefined {
  const hit = cache.get(ref);
  if (hit === undefined && !requested.has(ref)) {
    requested.add(ref);
    void themeKvGet(kvKey(ref)).then((data) => {
      if (!data) return;
      cache.set(ref, data);
      notify();
    });
  }
  return hit;
}

/** The entry for display; a reference resolves once IndexedDB has answered, then the lists re-render. */
export function attachEBookCovers(ebook: EBook): EBook {
  let out = ebook;
  for (const field of FIELDS) {
    const value = ebook[field];
    if (isEBookCoverRef(value)) out = { ...out, [field]: resolve(value) };
  }
  if (ebook.books?.length) {
    const books = ebook.books.map(attachEBookCovers);
    if (books.some((book, i) => book !== ebook.books?.[i])) out = { ...out, books };
  }
  return out;
}

function collectRefs(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const entry = value as Record<string, unknown>;
  for (const field of FIELDS) if (isEBookCoverRef(entry[field])) out.push(entry[field]);
  collectRefs(entry.books, out);
}

/** Every cover reference inside a raw eBook list. */
export function eBookCoverRefs(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const out: string[] = [];
    collectRefs(JSON.parse(raw), out);
    return out;
  } catch {
    return [];
  }
}

/** Deletes the stored artwork of `refs` that no list in `stillUsed` references any more. */
export function releaseEBookCovers(refs: string[], stillUsed: Set<string>): void {
  for (const ref of refs) {
    if (stillUsed.has(ref)) continue;
    cache.delete(ref);
    requested.delete(ref);
    void themeKvDelete(kvKey(ref));
  }
}

export async function readEBookCovers(refs: Iterable<string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const ref of new Set(refs)) {
    if (!isEBookCoverRef(ref)) continue;
    const data = cache.get(ref) ?? (await themeKvGet(kvKey(ref)));
    if (data) out[ref] = data;
  }
  return out;
}

export async function restoreEBookCovers(images: Record<string, string>): Promise<void> {
  let changed = false;
  for (const [ref, data] of Object.entries(images)) {
    if (!isEBookCoverRef(ref) || !(await themeKvPut(kvKey(ref), data))) continue;
    cache.set(ref, data);
    changed = true;
  }
  if (changed) notify();
}

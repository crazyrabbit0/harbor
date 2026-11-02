import { themeKvDelete, themeKvGet, themeKvPut } from "@/lib/theme-storage";
import { randomUuid } from "@/lib/uuid";

// Uploaded collection covers live in IndexedDB; the durable collection blob keeps only this reference.
const REF_PREFIX = "harbor-image:";
const KV_PREFIX = "collection-image:";

const cache = new Map<string, string>();
const requested = new Set<string>();
const subs = new Set<() => void>();

function kvKey(ref: string): string {
  return `${KV_PREFIX}${ref.slice(REF_PREFIX.length)}`;
}

function notify(): void {
  for (const s of subs) s();
}

export function isCollectionImageRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(REF_PREFIX);
}

export function subscribeCollectionImages(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** The displayable URL for a stored value; a reference resolves once IndexedDB has answered. */
export function resolveCollectionImage(value: string | undefined): string | undefined {
  if (!isCollectionImageRef(value)) return value;
  const hit = cache.get(value);
  if (hit === undefined && !requested.has(value)) {
    requested.add(value);
    void themeKvGet(kvKey(value)).then((data) => {
      if (!data) return;
      cache.set(value, data);
      notify();
    });
  }
  return hit;
}

/** Stores image bytes and returns their reference, or null when IndexedDB is unavailable. */
export async function storeCollectionImage(dataUrl: string): Promise<string | null> {
  const ref = `${REF_PREFIX}${randomUuid()}`;
  if (!(await themeKvPut(kvKey(ref), dataUrl))) return null;
  cache.set(ref, dataUrl);
  return ref;
}

function deleteCollectionImage(ref: string): void {
  cache.delete(ref);
  requested.delete(ref);
  void themeKvDelete(kvKey(ref));
}

/** Deletes a stored image unless a collections blob (any profile's, or `alsoLive`) still references it. */
export function releaseCollectionImage(value: string | undefined, alsoLive: string[] = []): void {
  if (!isCollectionImageRef(value) || alsoLive.includes(value)) return;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("harbor.collections")) continue;
      if (collectionImageRefs(localStorage.getItem(key)).includes(value)) return;
    }
  } catch {
    return;
  }
  deleteCollectionImage(value);
}

/** Every image reference inside a raw collections blob. */
export function collectionImageRefs(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const refs: string[] = [];
    for (const el of arr) {
      if (!el || typeof el !== "object") continue;
      const e = el as Record<string, unknown>;
      if (isCollectionImageRef(e.coverImage)) refs.push(e.coverImage);
      if (isCollectionImageRef(e.bgImage)) refs.push(e.bgImage);
    }
    return refs;
  } catch {
    return [];
  }
}

export async function readCollectionImages(
  refs: Iterable<string>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const ref of new Set(refs)) {
    if (!isCollectionImageRef(ref)) continue;
    const data = cache.get(ref) ?? (await themeKvGet(kvKey(ref)));
    if (data) out[ref] = data;
  }
  return out;
}

export async function restoreCollectionImages(images: Record<string, string>): Promise<void> {
  let changed = false;
  for (const [ref, data] of Object.entries(images)) {
    if (!isCollectionImageRef(ref) || !(await themeKvPut(kvKey(ref), data))) continue;
    cache.set(ref, data);
    changed = true;
  }
  if (changed) notify();
}

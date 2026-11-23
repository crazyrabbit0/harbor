import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import {
  COLLECTION_CATEGORIES,
  COLLECTIONS_CATALOG,
  type CatalogCollection,
} from "@/lib/collections-catalog";
import {
  collectionNameMatches,
  tmdbCollection,
  tmdbSearchCollectionId,
  type TmdbCollection,
} from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";

export type BpCollectionTarget = {
  collectionId: number;
  name: string;
  image: string | null;
};

export const BP_COLLECTIONS_ALL = "All";

export const BP_COLLECTION_CATEGORIES: string[] = [BP_COLLECTIONS_ALL, ...COLLECTION_CATEGORIES];

export function bpStripCollectionSuffix(name: string): string {
  return name.replace(/\s*(?:-|:)?\s*(?:the\s+)?collection$/i, "").trim() || name;
}

// Every comparison against this set is made on a suffix stripped TMDB name, so
// the catalog side has to be stripped too or nothing lines up.
export const BP_CURATED_NAMES = new Set(
  COLLECTIONS_CATALOG.map((c) => bpStripCollectionSuffix(c.name).toLowerCase()),
);

export function bpCatalogFor(category: string): CatalogCollection[] {
  return category === BP_COLLECTIONS_ALL
    ? COLLECTIONS_CATALOG
    : COLLECTIONS_CATALOG.filter((c) => c.cats.includes(category));
}

const ATTEMPTS = 2;
const hits = new Map<string, TmdbCollection>();

function pause(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function lookUp(key: string, id: number, name: string): Promise<TmdbCollection | null> {
  const direct = id > 0 ? await tmdbCollection(key, id).catch(() => null) : null;
  if (direct) return direct;
  const healed = await tmdbSearchCollectionId(key, name).catch(() => null);
  if (healed == null || healed === id) return null;
  const found = await tmdbCollection(key, healed).catch(() => null);
  // search/collection binds anything to results[0], so a healed id is only
  // trustworthy when the name it came back with is the one we asked for.
  return found && collectionNameMatches(found.name, name) ? found : null;
}

export async function resolveBpCollection(
  key: string,
  id: number,
  name: string,
): Promise<TmdbCollection | null> {
  if (!key) return null;
  const memo = `${id}:${name.toLowerCase()}`;
  const known = hits.get(memo);
  if (known) return known;
  for (let i = 0; i < ATTEMPTS; i += 1) {
    const found = await lookUp(key, id, name);
    if (found) {
      hits.set(memo, found);
      return found;
    }
    if (i + 1 < ATTEMPTS) await pause(320);
  }
  return null;
}

export async function bpMapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const at = cursor;
      cursor += 1;
      if (at >= items.length) return;
      out[at] = await fn(items[at]);
    }
  };
  const lanes = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: lanes }, worker));
  return out;
}

export type BpCollectionDetail = {
  name: string;
  overview: string;
  image: string | null;
  poster: string | null;
  parts: Meta[];
  years: string | null;
  loading: boolean;
};

function blank(name: string, loading: boolean): BpCollectionDetail {
  return { name, overview: "", image: null, poster: null, parts: [], years: null, loading };
}

function yearRange(parts: Meta[]): string | null {
  const years = parts
    .map((p) => Number((p.releaseDate ?? p.releaseInfo ?? "").slice(0, 4)))
    .filter((y) => Number.isFinite(y) && y > 1800)
    .sort((a, b) => a - b);
  if (years.length === 0) return null;
  const first = years[0];
  const last = years[years.length - 1];
  return first === last ? String(first) : `${first} - ${last}`;
}

export function useBpCollectionDetail(collectionId: number, name: string): BpCollectionDetail {
  const { settings } = useSettings();
  const reqKey = settings.tmdbKey ? `${collectionId}\0${name}\0${settings.tmdbKey}` : "";
  const [state, setState] = useState<{ key: string; detail: BpCollectionDetail }>({
    key: "",
    detail: blank(name, true),
  });

  useEffect(() => {
    if (!settings.tmdbKey) return;
    let alive = true;
    void resolveBpCollection(settings.tmdbKey, collectionId, name)
      .then((found) => {
        if (!alive) return;
        if (!found) {
          setState({ key: reqKey, detail: blank(name, false) });
          return;
        }
        setState({
          key: reqKey,
          detail: {
            name: found.name || name,
            overview: found.overview,
            image: found.backdrop ?? null,
            poster: found.poster ?? null,
            parts: found.parts,
            years: yearRange(found.parts),
            loading: false,
          },
        });
      })
      .catch(() => {
        if (alive) setState({ key: reqKey, detail: blank(name, false) });
      });
    return () => {
      alive = false;
    };
  }, [reqKey, collectionId, name, settings.tmdbKey]);

  if (!settings.tmdbKey) return blank(name, false);
  return state.key === reqKey ? state.detail : blank(name, true);
}

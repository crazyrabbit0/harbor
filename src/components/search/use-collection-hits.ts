import { useEffect, useState } from "react";
import { searchTvdbCollections, type TvdbCollectionHit } from "@/lib/providers/tvdb-collections";

export function collectionForTitle(
  title: string | undefined,
  hits: TvdbCollectionHit[],
): TvdbCollectionHit | null {
  if (!title || hits.length === 0) return null;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const titleTokens = new Set(norm(title).split(" "));
  for (const h of hits) {
    const tokens = norm(h.name)
      .split(" ")
      .filter((t) => t && t !== "collection" && t !== "saga" && t !== "the");
    if (tokens.length > 0 && tokens.every((t) => titleTokens.has(t))) return h;
  }
  return null;
}

export function useCollectionHits(query: string): TvdbCollectionHit[] {
  const [hits, setHits] = useState<TvdbCollectionHit[]>([]);
  const short = query.trim().length < 3;
  if (short && hits.length > 0) setHits([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      searchTvdbCollections(q)
        .then((h) => {
          if (!cancelled) setHits(h);
        })
        .catch(() => {});
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query]);
  return hits;
}

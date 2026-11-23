import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { harborImdbTitle } from "@/lib/providers/harbor-imdb";
import { tmdbImdbId } from "@/lib/providers/tmdb";
import { useSettingsSelector } from "@/lib/settings";

const ttCache = new Map<string, string | null>();
const scoreCache = new Map<string, string | null>();

function cachedScore(id: string): string | null | undefined {
  const tt = id.startsWith("tt") ? id : ttCache.get(id);
  if (tt === undefined) return undefined;
  if (tt === null) return null;
  return scoreCache.get(tt);
}

async function resolveTt(id: string, tmdbKey: string): Promise<string | null> {
  if (id.startsWith("tt")) return id;
  if (!id.startsWith("tmdb:")) return null;
  if (ttCache.has(id)) return ttCache.get(id) ?? null;
  const tt = await tmdbImdbId(tmdbKey, id);
  ttCache.set(id, tt);
  return tt;
}

async function resolveScore(tt: string): Promise<string | null> {
  if (scoreCache.has(tt)) return scoreCache.get(tt) ?? null;
  const rating = await harborImdbTitle(tt);
  const score = rating != null ? rating.toFixed(1) : null;
  scoreCache.set(tt, score);
  return score;
}

export async function resolveImdbScore(id: string, tmdbKey: string): Promise<number | null> {
  const tt = await resolveTt(id, tmdbKey);
  if (!tt) return null;
  const score = await resolveScore(tt);
  return score == null ? null : Number(score);
}

export function useCardImdb(meta: Meta): { imdb: string | null } {
  const settings = useSettingsSelector((s) => ({ tmdbKey: s.tmdbKey }));
  const known = cachedScore(meta.id);
  const fetchKey = known === undefined ? `${meta.id}\0${settings.tmdbKey}` : null;
  const [fetched, setFetched] = useState<{ key: string; score: string | null } | null>(null);

  useEffect(() => {
    if (!fetchKey) return;
    let cancelled = false;
    (async () => {
      const tt = await resolveTt(meta.id, settings.tmdbKey);
      if (cancelled || !tt) return;
      const score = await resolveScore(tt);
      if (!cancelled) setFetched({ key: fetchKey, score });
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchKey, meta.id, settings.tmdbKey]);

  const imdb =
    known !== undefined ? known : fetchKey && fetched?.key === fetchKey ? fetched.score : null;
  return { imdb };
}

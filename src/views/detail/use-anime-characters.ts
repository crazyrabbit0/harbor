import { useEffect, useState } from "react";
import {
  fetchAnimeCharacters,
  fetchAnimeCharactersByKitsu,
  type AnimeCharacter,
} from "@/lib/providers/anime-characters";

const EMPTY: AnimeCharacter[] = [];

export function useAnimeCharacters(canonicalId: string | null, isAnime: boolean): AnimeCharacter[] {
  const key = isAnime && canonicalId ? canonicalId : null;
  const [result, setResult] = useState<{ key: string; items: AnimeCharacter[] } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = async (): Promise<AnimeCharacter[]> => {
      if (key.startsWith("kitsu:")) {
        const kitsuId = Number(key.slice(6));
        if (!Number.isFinite(kitsuId)) return EMPTY;
        return fetchAnimeCharactersByKitsu(kitsuId);
      }
      if (key.startsWith("anilist:")) {
        const anilistId = Number(key.slice(8));
        if (!Number.isFinite(anilistId)) return EMPTY;
        return fetchAnimeCharacters(anilistId);
      }
      return EMPTY;
    };
    load()
      .then((items) => {
        if (!cancelled) setResult({ key, items });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, items: EMPTY });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return key && result?.key === key ? result.items : EMPTY;
}

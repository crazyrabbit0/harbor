import { useEffect, useState } from "react";
import {
  fetchAnilistMediaDetails,
  fetchAnilistMediaDetailsByKitsu,
  type AnilistMediaDetails,
} from "@/lib/anilist/media-details";

export function useAnimeAnilistDetails(
  canonicalId: string | null,
  isAnime: boolean,
): AnilistMediaDetails | null {
  const key = isAnime && canonicalId ? canonicalId : null;
  const [result, setResult] = useState<{ key: string; value: AnilistMediaDetails | null } | null>(
    null,
  );

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = async (): Promise<AnilistMediaDetails | null> => {
      if (key.startsWith("kitsu:")) {
        const kitsuId = Number(key.slice(6));
        if (!Number.isFinite(kitsuId)) return null;
        return fetchAnilistMediaDetailsByKitsu(kitsuId);
      }
      if (key.startsWith("anilist:")) {
        const anilistId = Number(key.slice(8));
        if (!Number.isFinite(anilistId)) return null;
        return fetchAnilistMediaDetails(anilistId);
      }
      return null;
    };
    load()
      .then((value) => {
        if (!cancelled) setResult({ key, value });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return key && result?.key === key ? result.value : null;
}

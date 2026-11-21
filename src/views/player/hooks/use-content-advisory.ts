import { useEffect, useState } from "react";
import { isAdvisoryIgnored } from "@/lib/player/content-advisory-ignore";
import {
  harborImdbMpaRating,
  harborImdbParental,
  type ParentalCategory,
} from "@/lib/providers/harbor-imdb";

const EMPTY_CATEGORIES: ParentalCategory[] = [];

export function useContentAdvisory(
  enabled: boolean,
  imdbId: string | null,
  srcKey: string,
  playing: boolean,
): {
  categories: ParentalCategory[];
  playKey: string;
  imdbId: string | null;
  mpaRating: string | null;
} {
  const fetchKey = enabled && imdbId ? imdbId : null;
  const [fetched, setFetched] = useState<{
    imdbId: string;
    categories: ParentalCategory[];
    mpaRating: string | null;
  } | null>(null);
  if (fetched && fetched.imdbId !== fetchKey) {
    setFetched(null);
  }

  const [playState, setPlayState] = useState({ srcKey, playKey: "" });
  const playKey =
    (playState.srcKey === srcKey ? playState.playKey : "") || (enabled && playing ? srcKey : "");
  if (playState.srcKey !== srcKey || playState.playKey !== playKey) {
    setPlayState({ srcKey, playKey });
  }

  useEffect(() => {
    if (!fetchKey || isAdvisoryIgnored(fetchKey)) return;
    let cancelled = false;
    harborImdbParental(fetchKey)
      .then((c) => {
        if (!cancelled) {
          setFetched({
            imdbId: fetchKey,
            categories: c,
            mpaRating: harborImdbMpaRating(fetchKey),
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  const activeFetched = fetchKey && fetched?.imdbId === fetchKey ? fetched : null;
  return {
    categories: activeFetched?.categories ?? EMPTY_CATEGORIES,
    playKey,
    imdbId,
    mpaRating: activeFetched?.mpaRating ?? null,
  };
}

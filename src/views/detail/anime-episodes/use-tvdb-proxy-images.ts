import { useEffect, useState } from "react";
import { fetchTvdbProxyImages, type TvdbImageMap } from "@/lib/providers/tvdb-proxy";

const LONG_SHOW_MIN = 100;
const EMPTY_MAP: TvdbImageMap = {};

export function useTvdbProxyImages(
  kitsuId: number | null,
  imdbId: string | null,
  episodeCount: number,
  seasonType: string,
): TvdbImageMap {
  const isLong = episodeCount > LONG_SHOW_MIN;
  const fetchKey = isLong ? `${kitsuId ?? ""}:${imdbId ?? ""}:${seasonType}` : "";
  const [loaded, setLoaded] = useState<{ key: string; map: TvdbImageMap } | null>(null);
  useEffect(() => {
    if (!fetchKey) return;
    let cancel = false;
    void fetchTvdbProxyImages({ kitsuId, imdb: imdbId, type: seasonType }).then((map) => {
      if (!cancel) setLoaded({ key: fetchKey, map });
    });
    return () => {
      cancel = true;
    };
  }, [fetchKey, kitsuId, imdbId, seasonType]);
  return fetchKey && loaded?.key === fetchKey ? loaded.map : EMPTY_MAP;
}

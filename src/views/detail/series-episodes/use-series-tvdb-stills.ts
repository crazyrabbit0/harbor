import { useEffect, useState } from "react";
import { fetchTvdbProxyImages, type TvdbImageMap } from "@/lib/providers/tvdb-proxy";

const LONG_SEASON_MIN = 60;
const EMPTY_MAP: TvdbImageMap = {};

export function useSeriesTvdbStills(
  imdbId: string | null,
  seasonEpisodeCount: number,
  type: string,
): TvdbImageMap {
  const isLong = seasonEpisodeCount > LONG_SEASON_MIN;
  const fetchKey = isLong && imdbId ? `${imdbId}:${type}` : "";
  const [loaded, setLoaded] = useState<{ key: string; map: TvdbImageMap } | null>(null);
  useEffect(() => {
    if (!fetchKey || !imdbId) return;
    let cancel = false;
    void fetchTvdbProxyImages({ imdb: imdbId, type }).then((map) => {
      if (!cancel) setLoaded({ key: fetchKey, map });
    });
    return () => {
      cancel = true;
    };
  }, [fetchKey, imdbId, type]);
  return fetchKey && loaded?.key === fetchKey ? loaded.map : EMPTY_MAP;
}

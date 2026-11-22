import { useEffect, useState } from "react";
import { kitsuToTvdb } from "@/lib/providers/anime-mapping";
import { parseKitsuId } from "@/lib/providers/kitsu";
import {
  tvdbSeasonTypes,
  tvdbSeriesByRemote,
  type TvdbSeasonTypeOption,
} from "@/lib/providers/tvdb";

const EMPTY_TYPES: TvdbSeasonTypeOption[] = [];

export function useTvdbSeasonTypes(
  imdbId: string | null,
  metaId: string,
  tvdbKey: string,
  enabled: boolean,
): TvdbSeasonTypeOption[] {
  const remoteId =
    imdbId && imdbId.startsWith("tt")
      ? imdbId
      : metaId.startsWith("tmdb:tv:")
        ? metaId.slice(8)
        : null;
  const kitsuId = /^(kitsu|mal|anilist|anidb):/.test(metaId) ? parseKitsuId(metaId) : null;
  const fetchKey =
    enabled && (remoteId || kitsuId != null) ? `${tvdbKey}:${remoteId ?? ""}:${kitsuId ?? ""}` : "";
  const [loaded, setLoaded] = useState<{ key: string; types: TvdbSeasonTypeOption[] } | null>(null);

  useEffect(() => {
    if (!fetchKey) return;
    let cancelled = false;
    void (async () => {
      let seriesId = kitsuId != null ? await kitsuToTvdb(kitsuId).catch(() => null) : null;
      if (seriesId == null && remoteId) {
        seriesId = await tvdbSeriesByRemote(tvdbKey, remoteId).catch(() => null);
      }
      if (cancelled || !seriesId) return;
      const types = await tvdbSeasonTypes(tvdbKey, seriesId).catch(() => EMPTY_TYPES);
      if (!cancelled) setLoaded({ key: fetchKey, types });
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchKey, tvdbKey, remoteId, kitsuId]);

  return fetchKey && loaded?.key === fetchKey ? loaded.types : EMPTY_TYPES;
}

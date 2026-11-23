import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { animeDetails } from "@/lib/providers/anime-detail";
import { useSettings } from "@/lib/settings";
import { tmdbDetails, type TmdbDetail } from "@/lib/providers/tmdb/tmdb-details";
import { imdbapiDetails } from "@/lib/providers/imdbapi/imdbapi-details";

function isAnimeId(id: string): boolean {
  return id.startsWith("kitsu:") || id.startsWith("mal:") || id.startsWith("anilist:");
}

export function useTitleDetail(meta: Meta, tmdbKey: string | null, active: boolean) {
  const { settings } = useSettings();
  const [result, setResult] = useState<{ key: string; detail: TmdbDetail | null } | null>(null);
  const anime = isAnimeId(meta.id);
  const usedImdbFallback =
    !anime && !tmdbKey && settings.imdbApiFallback && meta.id.startsWith("tt");
  const canFetch = anime || !!tmdbKey || usedImdbFallback;
  const fetchKey =
    active && canFetch
      ? `${meta.id}\0${tmdbKey ?? ""}\0${anime ? 1 : 0}\0${usedImdbFallback ? 1 : 0}`
      : null;

  useEffect(() => {
    if (!fetchKey) return;
    let cancelled = false;
    if (anime) {
      animeDetails(settings, meta)
        .then((res) => {
          if (cancelled) return;
          setResult({ key: fetchKey, detail: res?.detail ?? null });
          if (!res) return;
          void res.extrasPromise
            .then((patch) => {
              if (!cancelled) {
                setResult((prev) =>
                  prev?.key === fetchKey && prev.detail
                    ? { key: fetchKey, detail: { ...prev.detail, ...patch } }
                    : prev,
                );
              }
            })
            .catch(() => {});
        })
        .catch(() => {
          if (!cancelled) setResult({ key: fetchKey, detail: null });
        });
      return () => {
        cancelled = true;
      };
    }
    const req: Promise<TmdbDetail | null> = tmdbKey
      ? tmdbDetails(tmdbKey, meta)
      : imdbapiDetails(meta.id);
    req
      .then((d) => {
        if (!cancelled) setResult({ key: fetchKey, detail: d });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: fetchKey, detail: null });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchKey, meta, tmdbKey, anime, settings]);

  const detail = !canFetch
    ? null
    : active
      ? result?.key === fetchKey
        ? result.detail
        : null
      : (result?.detail ?? null);
  const loading = fetchKey != null && result?.key !== fetchKey;

  return { detail, loading, canFetch, needsKey: !canFetch };
}

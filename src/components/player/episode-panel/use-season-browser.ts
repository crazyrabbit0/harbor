import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { absoluteNumberFor, seasonOffsets } from "@/lib/episode-absolute";
import {
  animeSeriesFromStreamId,
  fetchSeasonEpisodeCounts,
  fetchSeasonEpisodes,
  fetchSeasonList,
  isAnimeId,
} from "@/lib/series-episodes";
import { useSettingsSelector } from "@/lib/settings";
import { harborImdbEpisodes } from "@/lib/providers/harbor-imdb";
import {
  applyTmdbEpisodeNames,
  needsTmdbEpisodeNames,
  tmdbEpisodeNames,
} from "@/lib/providers/tmdb";
import type { PlayEpisode } from "@/lib/view";

const EMPTY_EPISODES: PlayEpisode[] = [];
const EMPTY_RATINGS = new Map<string, number>();
const EMPTY_OFFSETS = new Map<number, number>();

export function useSeasonBrowser(
  meta: Meta,
  current: PlayEpisode | undefined,
  open: boolean,
): {
  seasons: number[];
  season: number;
  setSeason: (n: number) => void;
  episodes: PlayEpisode[];
  loading: boolean;
  imdbRatings: Map<string, number>;
  absoluteFor: (ep: PlayEpisode) => number | undefined;
} {
  const settings = useSettingsSelector((s) => ({ tmdbKey: s.tmdbKey }));
  const effMeta = useMemo<Meta>(() => {
    if (!isAnimeId(meta.id)) return meta;
    const base = animeSeriesFromStreamId(current?.kitsuStreamId);
    return base && base !== meta.id ? { ...meta, id: base } : meta;
  }, [meta, current?.kitsuStreamId]);
  const [seasons, setSeasons] = useState<number[]>([]);
  const defaultSeason = current?.imdbSeason ?? current?.season ?? 1;
  const [season, setSeason] = useState<number>(defaultSeason);
  const seasonSyncKey = open ? `${meta.id}\0${defaultSeason}` : null;
  const [prevSeasonSyncKey, setPrevSeasonSyncKey] = useState(seasonSyncKey);
  if (seasonSyncKey !== prevSeasonSyncKey) {
    setPrevSeasonSyncKey(seasonSyncKey);
    if (seasonSyncKey !== null) setSeason(defaultSeason);
  }

  const offsetsKey = open ? `${effMeta.id}\0${settings.tmdbKey ?? ""}` : null;
  const [offsetsState, setOffsetsState] = useState<{
    key: string;
    map: Map<number, number>;
  } | null>(null);
  if (offsetsKey === null && offsetsState !== null) setOffsetsState(null);
  const offsets = offsetsKey && offsetsState?.key === offsetsKey ? offsetsState.map : EMPTY_OFFSETS;

  useEffect(() => {
    if (!offsetsKey) return;
    let cancelled = false;
    void fetchSeasonEpisodeCounts(effMeta, { tmdbKey: settings.tmdbKey })
      .then((counts) => {
        if (!cancelled) setOffsetsState({ key: offsetsKey, map: seasonOffsets(counts) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [offsetsKey, effMeta, settings.tmdbKey]);

  // Display only: PlayEpisode.absoluteNumber feeds anime numbering, so it is never written onto the episode.
  const absoluteFor = (ep: PlayEpisode) =>
    ep.absoluteNumber ?? absoluteNumberFor(offsets, ep.season, ep.episode);

  const imdbKey = open ? effMeta.id : null;
  const [imdbState, setImdbState] = useState<{
    key: string;
    map: Map<string, number>;
  } | null>(null);
  if (imdbKey === null && imdbState !== null) setImdbState(null);
  const imdbRatings = imdbKey && imdbState?.key === imdbKey ? imdbState.map : EMPTY_RATINGS;

  useEffect(() => {
    if (!imdbKey) return;
    let cancelled = false;
    void harborImdbEpisodes(imdbKey).then((map) => {
      if (!cancelled && map.size > 0) setImdbState({ key: imdbKey, map });
    });
    return () => {
      cancelled = true;
    };
  }, [imdbKey]);

  useEffect(() => {
    if (!open || (effMeta.type !== "series" && !isAnimeId(effMeta.id))) return;
    let cancelled = false;
    fetchSeasonList(effMeta, { tmdbKey: settings.tmdbKey })
      .then((s) => {
        if (!cancelled) setSeasons(s);
      })
      .catch(() => {
        if (!cancelled) setSeasons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, effMeta, settings.tmdbKey]);

  const isSeries = effMeta.type === "series" || isAnimeId(effMeta.id);
  const episodesKey =
    open && isSeries ? `${effMeta.id}\0${season}\0${settings.tmdbKey ?? ""}` : null;
  const [episodesState, setEpisodesState] = useState<{
    key: string;
    metaId: string;
    episodes: PlayEpisode[];
  } | null>(null);
  if (episodesKey === null && episodesState !== null) setEpisodesState(null);
  const episodes =
    episodesKey === null
      ? EMPTY_EPISODES
      : episodesState?.key === episodesKey || episodesState?.metaId === effMeta.id
        ? episodesState.episodes
        : EMPTY_EPISODES;
  const loading = episodesKey !== null && episodesState?.key !== episodesKey;

  useEffect(() => {
    if (!episodesKey) return;
    let cancelled = false;
    const overlayTmdbNames = (eps: PlayEpisode[]) => {
      if (!settings.tmdbKey || effMeta.id.startsWith("tmdb:tv:")) return;
      if (!needsTmdbEpisodeNames(eps)) return;
      void tmdbEpisodeNames(settings.tmdbKey, effMeta.id, season)
        .then((names) => {
          if (cancelled || names.size === 0) return;
          setEpisodesState((prev) =>
            prev && prev.key === episodesKey && prev.episodes === eps
              ? { ...prev, episodes: applyTmdbEpisodeNames(eps, names) }
              : prev,
          );
        })
        .catch(() => {});
    };
    fetchSeasonEpisodes(effMeta, season, { tmdbKey: settings.tmdbKey })
      .then((eps) => {
        if (cancelled) return;
        setEpisodesState({ key: episodesKey, metaId: effMeta.id, episodes: eps });
        overlayTmdbNames(eps);
      })
      .catch(() => {
        if (!cancelled) {
          setEpisodesState({ key: episodesKey, metaId: effMeta.id, episodes: EMPTY_EPISODES });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [episodesKey, effMeta, season, settings.tmdbKey]);

  return { seasons, season, setSeason, episodes, loading, imdbRatings, absoluteFor };
}

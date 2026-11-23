import { useCallback, useEffect, useRef, useState } from "react";
import { useHideAnimeMetas } from "@/lib/anime-hide";
import type { Meta } from "@/lib/cinemeta";
import { MOVIE_GENRES } from "@/lib/feed/tags";
import { tmdbDiscover } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";

export type BpGenreStatus = "loading" | "ready" | "no-key" | "failed" | "filtered" | "empty";
export type BpGenreFeed = {
  metas: Meta[];
  status: BpGenreStatus;
  more: () => void;
  retry: () => void;
};

const EMPTY_METAS: Meta[] = [];

function bpGenreId(genre: string): number | undefined {
  return MOVIE_GENRES[genre];
}

function dedupeMetas(base: Meta[], batch: Meta[]): Meta[] {
  const seen = new Set(base.map((m) => m.id));
  const fresh: Meta[] = [];
  for (const m of batch) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    fresh.push(m);
  }
  return fresh;
}

export function useBpGenreGrid(genre: string): BpGenreFeed {
  const { settings } = useSettings();
  const [attempt, setAttempt] = useState(0);
  const pageRef = useRef(1);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const id = bpGenreId(genre);
  const hasKey = Boolean(settings.tmdbKey) && id != null;
  const reqKey = `${genre}\0${settings.tmdbKey}\0${attempt}`;
  const [state, setState] = useState<{
    key: string;
    metas: Meta[];
    loading: boolean;
    failed: boolean;
  }>({ key: "", metas: EMPTY_METAS, loading: true, failed: false });

  useEffect(() => {
    pageRef.current = 1;
    doneRef.current = false;
    busyRef.current = false;
    if (!settings.tmdbKey || id == null) return;
    let cancelled = false;
    busyRef.current = true;
    void tmdbDiscover(settings.tmdbKey, "movie", {
      with_genres: String(id),
      "vote_count.gte": "180",
      sort_by: "popularity.desc",
      page: "1",
    })
      .then((batch) => {
        if (cancelled) return;
        const empty = batch.length === 0;
        if (empty) doneRef.current = true;
        setState({ key: reqKey, metas: dedupeMetas([], batch), loading: false, failed: empty });
      })
      .catch(() => {
        if (cancelled) return;
        doneRef.current = true;
        setState({ key: reqKey, metas: EMPTY_METAS, loading: false, failed: true });
      })
      .finally(() => {
        if (!cancelled) busyRef.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [reqKey, settings.tmdbKey, id]);

  const more = () => {
    if (busyRef.current || doneRef.current || !settings.tmdbKey || id == null) return;
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    busyRef.current = true;
    const key = reqKey;
    void tmdbDiscover(settings.tmdbKey, "movie", {
      with_genres: String(id),
      "vote_count.gte": "180",
      sort_by: "popularity.desc",
      page: String(nextPage),
    })
      .then((batch) => {
        if (batch.length === 0) doneRef.current = true;
        setState((cur) => {
          if (cur.key !== key) return cur;
          const fresh = dedupeMetas(cur.metas, batch);
          return fresh.length > 0 ? { ...cur, metas: [...cur.metas, ...fresh] } : cur;
        });
      })
      .catch(() => {
        doneRef.current = true;
        setState((cur) => (cur.key === key ? { ...cur, failed: true } : cur));
      })
      .finally(() => {
        busyRef.current = false;
      });
  };

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const metas = hasKey && state.key === reqKey ? state.metas : EMPTY_METAS;
  const loading = hasKey && (state.key !== reqKey || state.loading);
  const failed = hasKey && state.key === reqKey && state.failed;
  const shown = useHideAnimeMetas(metas);

  const status: BpGenreStatus =
    shown.length > 0
      ? "ready"
      : loading
        ? "loading"
        : !settings.tmdbKey
          ? "no-key"
          : metas.length > 0
            ? "filtered"
            : failed
              ? "failed"
              : "empty";

  return { metas: shown, status, more, retry };
}

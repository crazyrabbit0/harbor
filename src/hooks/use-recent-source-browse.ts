import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadRecentSourcePage } from "@/lib/games/recent-source-page";
import type { RecentSourceQuery } from "@/lib/games/source-recent-browse";
import type { GameSource } from "@/lib/games/sources";
import type { RecentSourceRelease } from "@/lib/games/recent-sources";

export function useRecentSourceBrowse(
  sources: GameSource[],
  filters: RecentSourceQuery,
  active: boolean,
) {
  const key = JSON.stringify([
    sources.map((s) => [s.id, s.enabled, s.checkedAt, s.catalog?.version, s.catalogIssue?.version]),
    filters,
  ]);
  const [state, setState] = useState<{
    key: string;
    entries: RecentSourceRelease[];
    hasMore: boolean;
    failed: string[];
    loading: boolean;
  }>({ key: "", entries: [], hasMore: true, failed: [], loading: false });
  const [request, setRequest] = useState({ key, limit: 24, attempt: 0 });
  const current = state.key === key,
    limit = request.key === key ? request.limit : 24;
  const input = useRef({ sources, filters });
  useLayoutEffect(() => {
    input.current = { sources, filters };
  }, [sources, filters]);
  const run = active ? `${key}\0${limit}\0${request.attempt}` : null;
  const [prevRun, setPrevRun] = useState<string | null>(null);
  if (prevRun !== run) {
    setPrevRun(run);
    if (run !== null)
      setState((previous) =>
        previous.key === key
          ? { ...previous, loading: true }
          : { key, entries: [], hasMore: true, failed: [], loading: true },
      );
  }
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        void loadRecentSourcePage(
          input.current.sources,
          input.current.filters,
          limit,
          controller.signal,
        ).then(
          (page) => {
            if (!controller.signal.aborted) setState({ key, ...page, loading: false });
          },
          () => {
            if (!controller.signal.aborted)
              setState((previous) => ({
                ...previous,
                loading: false,
                failed: input.current.sources.filter((s) => s.enabled).map((s) => s.name),
              }));
          },
        );
      },
      input.current.filters.query.trim() ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, active, limit, request.attempt]);
  const loading = !current || state.loading;
  return {
    entries: current ? state.entries : [],
    loading,
    hasMore: current ? state.hasMore : true,
    failed: current ? state.failed : [],
    more: () => {
      if (active && !loading && state.hasMore && !state.failed.length)
        setRequest((previous) => ({ key, limit: limit + 24, attempt: previous.attempt }));
    },
    retry: () => setRequest((previous) => ({ key, limit, attempt: previous.attempt + 1 })),
  };
}

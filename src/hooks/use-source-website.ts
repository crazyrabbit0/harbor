import { useEffect, useRef, useState } from "react";
import { fetchWebsiteSource } from "@/lib/games/source-fetch";
import { sourceError, type GameSource } from "@/lib/games/sources";
export { useWebsiteMatches } from "./use-website-matches";

export function useSourceWebsite(source: GameSource, query: string, profile?: string) {
  const [state, setState] = useState({
    entries: source.entries,
    next: null as number | null,
    loading: false,
    error: "",
  });
  const request = useRef<AbortController | null>(null),
    revision = useRef(0),
    pending = useRef(false);
  const run = async (
    page: number,
    append: boolean,
    current: number,
    signal: AbortSignal,
    refresh = false,
  ) => {
    if (!source.website) return false;
    pending.current = true;
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    return fetchWebsiteSource(source.website, query, page, signal, refresh, profile)
      .then((result) => {
        if (signal.aborted || current !== revision.current) return false;
        setState((previous) => ({
          entries: [
            ...new Map(
              [...(append ? previous.entries : []), ...result.entries].map((entry) => [
                entry.id,
                entry,
              ]),
            ).values(),
          ],
          next: result.next,
          loading: false,
          error: "",
        }));
        return true;
      })
      .catch((error: unknown) => {
        if (!signal.aborted && current === revision.current)
          setState((previous) => ({ ...previous, loading: false, error: sourceError(error) }));
        return false;
      })
      .finally(() => {
        if (current === revision.current) pending.current = false;
      });
  };
  const runKey = JSON.stringify([profile, source.id, source.checkedAt, source.website?.api, query]);
  const [prevRunKey, setPrevRunKey] = useState<string | null>(null);
  if (prevRunKey !== runKey) {
    setPrevRunKey(runKey);
    setState({ entries: query.trim() ? [] : source.entries, next: null, loading: true, error: "" });
  }
  useEffect(() => {
    const current = ++revision.current,
      controller = new AbortController();
    request.current = controller;
    pending.current = true;
    const timer = setTimeout(
      () => void run(1, false, current, controller.signal),
      query.trim() ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
      revision.current++;
      pending.current = false;
    };
  }, [profile, source.id, source.checkedAt, source.website?.api, query]);
  return {
    ...state,
    retry: async () => {
      return !pending.current && request.current
        ? run(state.next ?? 1, !!state.next, revision.current, request.current.signal, true)
        : false;
    },
    more: async () => {
      if (!state.next || pending.current || !request.current) return false;
      return run(state.next, true, revision.current, request.current.signal);
    },
  };
}

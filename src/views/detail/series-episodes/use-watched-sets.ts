import { useEffect, useState } from "react";
import { loadSimklWatchedMap, simklWatchedForId } from "@/lib/simkl/list-status";
import { fetchWatchedKeySet } from "@/lib/trakt/history";

const EMPTY_SET = new Set<string>();

export function useWatchedSets({
  traktConnected,
  simklConnected,
  imdbId,
  metaId,
}: {
  traktConnected: boolean;
  simklConnected: boolean;
  imdbId: string | null;
  metaId: string;
}): { traktWatched: Set<string>; simklWatched: Set<string> } {
  const [traktLoaded, setTraktLoaded] = useState<Set<string>>(EMPTY_SET);
  const simklKey = simklConnected ? `${imdbId ?? ""}|${metaId}` : "";
  const [simklState, setSimklState] = useState<{ key: string; set: Set<string> } | null>(null);

  useEffect(() => {
    if (!traktConnected) return;
    let cancelled = false;
    fetchWatchedKeySet()
      .then((set) => {
        if (!cancelled) setTraktLoaded(set);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [traktConnected]);

  useEffect(() => {
    if (!simklKey) return;
    let cancelled = false;
    loadSimklWatchedMap()
      .then((map) => {
        if (!cancelled)
          setSimklState({ key: simklKey, set: simklWatchedForId(map, imdbId, metaId) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [simklKey, imdbId, metaId]);

  return {
    traktWatched: traktConnected ? traktLoaded : EMPTY_SET,
    simklWatched: simklKey && simklState?.key === simklKey ? simklState.set : EMPTY_SET,
  };
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameSummary } from "@/lib/games/types";
import type { SavedReleaseResult } from "@/lib/games/saved-releases";
import { loadSavedReleases, type SavedReleaseRequest } from "@/lib/games/saved-releases-load";
import { useLiveRefresh } from "./use-live-refresh";

const BATCH = 12;

/** Callers key their view by profile; no saved membership or result crosses profiles. */
export function useSavedGameReleases(
  games: GameSummary[],
  active: boolean,
  request?: SavedReleaseRequest,
) {
  const [results, setResults] = useState<Record<string, SavedReleaseResult>>({});
  const [limit, setLimit] = useState(BATCH),
    [attempt, setAttempt] = useState(0);
  const refresh = useLiveRefresh(active, 31 * 60_000);
  const [settledRevision, setSettledRevision] = useState(() => `${attempt}:${refresh}`);
  const [run, setRun] = useState<{ key: string; doneIds: string[]; finished: boolean } | null>(
    null,
  );
  const lastRefresh = useRef(`${attempt}:${refresh}`),
    resultsRef = useRef(results);
  useLayoutEffect(() => {
    resultsRef.current = results;
  }, [results]);
  const membership = games.map((game) => game.id).join("|");
  const revision = `${attempt}:${refresh}`;
  const runKey = `${revision}:${membership}:${limit}`;
  const force = settledRevision !== revision;
  const batch = active ? games.slice(0, limit).filter((game) => force || !results[game.id]) : [];
  const currentRun = run?.key === runKey ? run : null;
  const pending =
    active && batch.length > 0 && !currentRun?.finished
      ? batch.map((game) => game.id).filter((id) => !(currentRun?.doneIds.includes(id) ?? false))
      : [];
  const loading = active && batch.length > 0 && !currentRun?.finished;

  useEffect(() => {
    if (!active) return;
    const currentRevision = `${attempt}:${refresh}`,
      currentForce = lastRefresh.current !== currentRevision;
    const needed = games
      .slice(0, limit)
      .filter((game) => currentForce || !resultsRef.current[game.id]);
    if (!needed.length) return;
    const controller = new AbortController();
    void loadSavedReleases(
      needed,
      controller.signal,
      (id, result) => {
        setRun((prev) =>
          prev?.key === runKey
            ? {
                ...prev,
                doneIds: prev.doneIds.includes(id) ? prev.doneIds : [...prev.doneIds, id],
              }
            : { key: runKey, doneIds: [id], finished: false },
        );
        setResults((previous) => ({
          ...previous,
          [id]: result.failed ? { ...previous[id], failed: true } : result,
        }));
      },
      request,
      undefined,
      currentForce,
    )
      .then(() => {
        if (!controller.signal.aborted) {
          lastRefresh.current = currentRevision;
          setSettledRevision(currentRevision);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) {
          setRun((prev) =>
            prev?.key === runKey
              ? { ...prev, finished: true }
              : { key: runKey, doneIds: [], finished: true },
          );
        }
      });
    return () => controller.abort();
  }, [active, membership, limit, attempt, refresh, request, runKey]);

  return {
    results,
    loading,
    pending,
    membership,
    checked: games.filter((game) => results[game.id]).length,
    failed: games.some((game) => results[game.id]?.failed),
    retry: () => setAttempt((value) => value + 1),
    more: () => setLimit((value) => value + BATCH),
  };
}

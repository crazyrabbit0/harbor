import { useEffect, useState } from "react";
import { getCachedPlaylist, loadPlaylist, subscribePlaylists } from "@/lib/iptv/store";
import type { IptvPlaylist, IptvPlaylistSource } from "@/lib/iptv/types";

type PlaylistState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; playlist: IptvPlaylist }
  | { kind: "error"; message: string };

export function useIptvPlaylist(source: IptvPlaylistSource | null): {
  state: PlaylistState;
  refresh: () => void;
} {
  const [tick, setTick] = useState(0);
  const requestKey = source ? `${source.id}\n${source.url}\n${tick}` : null;
  const [result, setResult] = useState<{ key: string; state: PlaylistState } | null>(null);
  if (requestKey === null && result !== null) setResult(null);
  const state: PlaylistState =
    requestKey === null
      ? { kind: "idle" }
      : result?.key === requestKey
        ? result.state
        : { kind: "loading" };

  useEffect(() => {
    if (!source || requestKey === null) return;
    const id = source.id;
    let cancelled = false;
    const settle = (next: PlaylistState) => setResult({ key: requestKey, state: next });
    loadPlaylist(source, { force: tick > 0 })
      .then((pl) => {
        if (cancelled) return;
        settle({ kind: "ready", playlist: pl });
      })
      .catch((e) => {
        if (cancelled) return;
        settle({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      });
    const unsub = subscribePlaylists(() => {
      if (cancelled) return;
      const cached = getCachedPlaylist(id);
      if (cached) settle({ kind: "ready", playlist: cached });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [requestKey, source?.id, source?.url, tick]);

  return {
    state,
    refresh: () => setTick((n) => n + 1),
  };
}

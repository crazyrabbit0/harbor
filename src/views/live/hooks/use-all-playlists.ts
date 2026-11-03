import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCachedPlaylist, loadPlaylist, subscribePlaylists } from "@/lib/iptv/store";
import type { IptvPlaylist, IptvPlaylistSource } from "@/lib/iptv/types";

export function useAllPlaylists(
  sources: IptvPlaylistSource[],
  enabled: boolean,
): Map<string, IptvPlaylist> {
  const sourceKey = sources.map((s) => s.id).join("|");

  const [playlists, setPlaylists] = useState<Map<string, IptvPlaylist>>(() => snapshot(sources));
  const sourcesRef = useRef(sources);
  useLayoutEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  useEffect(() => {
    const sources = sourcesRef.current;
    setPlaylists(snapshot(sources));
    if (!enabled) return;
    let cancelled = false;
    for (const s of sources) {
      if (getCachedPlaylist(s.id)) continue;
      loadPlaylist(s).catch(() => {});
    }
    const unsub = subscribePlaylists(() => {
      if (cancelled) return;
      setPlaylists(snapshot(sources));
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [enabled, sourceKey]);

  return playlists;
}

function snapshot(sources: IptvPlaylistSource[]): Map<string, IptvPlaylist> {
  const m = new Map<string, IptvPlaylist>();
  for (const s of sources) {
    const pl = getCachedPlaylist(s.id);
    if (pl) m.set(s.id, pl);
  }
  return m;
}

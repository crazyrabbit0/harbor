import { useEffect, useRef, useState } from "react";
import {
  fetchEngineStats,
  GENUINE_FAILURE_WINDOW_MS,
  COLD_CONNECT_DEADLINE_MS,
  ENGINE_DOWN_STRIKES,
  type EngineStats,
} from "@/lib/torrent/engine-stats";
import { isBundledEngineUrl, isLocalEngineUrl } from "@/lib/stremio-server";

const POLL_MS = 2000;
const GROWTH_THRESHOLD = 64 * 1024;

// A stalled or finished torrent repeats the same numbers; keeping the old object skips the player re-render.
function sameStats(a: EngineStats, b: EngineStats): boolean {
  return (
    a.peers === b.peers &&
    a.unchoked === b.unchoked &&
    a.downloaded === b.downloaded &&
    a.downloadSpeed === b.downloadSpeed &&
    a.streamProgress === b.streamProgress &&
    a.streamLen === b.streamLen &&
    a.peerSearchRunning === b.peerSearchRunning &&
    a.sawData === b.sawData
  );
}

export function useEngineStats(args: {
  url: string;
  infoHash: string | null;
  fileIdx: number | null;
  active: boolean;
}): { stats: EngineStats | null; genuineFailure: boolean } {
  const { url, infoHash, fileIdx, active } = args;
  const enabled = active && (isBundledEngineUrl(url) || isLocalEngineUrl(url)) && !!infoHash;
  const statsKey = enabled && infoHash != null ? `${url}|${infoHash}|${fileIdx ?? ""}` : "";
  const [statsState, setStatsState] = useState<{
    key: string;
    stats: EngineStats | null;
    genuineFailure: boolean;
  }>({ key: statsKey, stats: null, genuineFailure: false });
  if (statsState.key !== statsKey) {
    setStatsState({ key: statsKey, stats: null, genuineFailure: false });
  }
  const stats = statsState.key === statsKey ? statsState.stats : null;
  const genuineFailure = statsState.key === statsKey ? statsState.genuineFailure : false;
  const prevRef = useRef<EngineStats | null>(null);
  const lastGrowthRef = useRef(0);
  const lastGrowthAtRef = useRef(0);
  const firstPeerSeenAtRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const downStrikesRef = useRef(0);

  useEffect(() => {
    prevRef.current = null;
    lastGrowthRef.current = 0;
    lastGrowthAtRef.current = 0;
    firstPeerSeenAtRef.current = null;
    startedAtRef.current = Date.now();
    downStrikesRef.current = 0;
    if (!enabled || infoHash == null) return;
    const idx = fileIdx == null || fileIdx < 0 ? -1 : fileIdx;
    const ac = new AbortController();
    let cancelled = false;
    const setFailure = (value: boolean) =>
      setStatsState((cur) =>
        cur.key === statsKey && cur.genuineFailure !== value
          ? { ...cur, genuineFailure: value }
          : cur,
      );

    const tick = async () => {
      const res = await fetchEngineStats(infoHash, idx, prevRef.current, ac.signal, url);
      if (cancelled) return;
      const now = Date.now();

      if (res.kind === "down") {
        downStrikesRef.current += 1;
        if (downStrikesRef.current >= ENGINE_DOWN_STRIKES && !prevRef.current?.sawData) {
          setFailure(true);
        }
        return;
      }
      downStrikesRef.current = 0;
      if (res.kind === "empty") {
        setFailure(false);
        return;
      }

      const next = res.stats;
      prevRef.current = next;
      setStatsState((cur) =>
        cur.key === statsKey && (!cur.stats || !sameStats(cur.stats, next))
          ? { ...cur, stats: next }
          : cur,
      );

      if ((next.peers > 0 || next.unchoked > 0) && firstPeerSeenAtRef.current == null) {
        firstPeerSeenAtRef.current = now;
      }
      if (next.downloaded > lastGrowthRef.current + GROWTH_THRESHOLD) {
        lastGrowthRef.current = next.downloaded;
        lastGrowthAtRef.current = now;
        setFailure(false);
        return;
      }

      const moving = next.unchoked > 0 || next.downloadSpeed > 0 || next.peerSearchRunning;
      if (moving) {
        setFailure(false);
        return;
      }

      if (!next.sawData) return;

      if (firstPeerSeenAtRef.current == null) {
        if (next.peers === 0 && now - startedAtRef.current > COLD_CONNECT_DEADLINE_MS) {
          setFailure(true);
        }
        return;
      }

      const anchor = Math.max(firstPeerSeenAtRef.current, lastGrowthAtRef.current);
      if (next.peers === 0 && now - anchor > GENUINE_FAILURE_WINDOW_MS) {
        setFailure(true);
      }
    };

    let id: number | null = null;
    // Polls only while the window is shown; a reveal refreshes at once.
    const sync = () => {
      if (id !== null) window.clearInterval(id);
      id = null;
      if (document.hidden) return;
      void tick();
      id = window.setInterval(() => void tick(), POLL_MS);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelled = true;
      ac.abort();
      if (id !== null) window.clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [enabled, url, infoHash, fileIdx, statsKey]);

  return { stats, genuineFailure };
}

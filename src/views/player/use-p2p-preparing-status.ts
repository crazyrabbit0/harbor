import { useEffect, useRef, useState } from "react";
import { torrentEngineStats } from "@/lib/torrent/local-engine";
import { startStatsPoll } from "@/lib/torrent/stats-poll";
import { isLocalEngineUrl } from "@/lib/stremio-server";

export type P2pPreparingPhase = "searching" | "connected" | "slow" | "no-peers";

export type P2pPreparingStatus = {
  enabled: boolean;
  phase: P2pPreparingPhase;
  peers: number;
  downloadSpeed: number;
  retry: () => void;
};

const NO_PEERS_MS = 75_000;
const SLOW_MS = 90_000;

export function useP2pPreparingStatus(params: {
  url: string;
  infoHash: string | null | undefined;
  fileIdx: number | null | undefined;
  active: boolean;
}): P2pPreparingStatus {
  const { url, infoHash, fileIdx, active } = params;
  const enabled = active && !!infoHash && isLocalEngineUrl(url);
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<{
    enabled: boolean;
    phase: P2pPreparingPhase;
    peers: number;
    downloadSpeed: number;
  }>({ enabled, phase: "searching", peers: 0, downloadSpeed: 0 });
  if (!enabled && status.enabled) {
    setStatus({ enabled: false, phase: "searching", peers: 0, downloadSpeed: 0 });
  } else if (enabled && !status.enabled) {
    setStatus((cur) => ({ ...cur, enabled: true }));
  }
  const phase = enabled ? status.phase : "searching";
  const peers = enabled ? status.peers : 0;
  const downloadSpeed = enabled ? status.downloadSpeed : 0;
  const failedRef = useRef(false);
  const sawDataRef = useRef(false);

  useEffect(() => {
    if (!enabled || !infoHash) {
      failedRef.current = false;
      sawDataRef.current = false;
      return;
    }
    const idx = typeof fileIdx === "number" && fileIdx >= 0 ? fileIdx : null;
    const startAt = Date.now();
    let cancelled = false;
    const tick = async () => {
      const s = await torrentEngineStats(infoHash, idx);
      if (cancelled) return;
      const p = s ? (s.unchoked > 0 ? s.unchoked : s.peers) : 0;
      const speed = s?.downloadSpeed ?? 0;
      const progress = s?.streamProgress ?? 0;
      if (speed > 0 || progress > 0) sawDataRef.current = true;
      let nextPhase: P2pPreparingPhase;
      if (failedRef.current) {
        nextPhase = "no-peers";
      } else {
        const idle = !sawDataRef.current && speed === 0 && progress === 0;
        const elapsed = Date.now() - startAt;
        if (idle && p === 0 && elapsed >= NO_PEERS_MS) {
          failedRef.current = true;
          nextPhase = "no-peers";
        } else if (idle && p > 0 && elapsed >= SLOW_MS) {
          nextPhase = "slow";
        } else {
          nextPhase = p > 0 ? "connected" : "searching";
        }
      }
      setStatus({ enabled: true, phase: nextPhase, peers: p, downloadSpeed: speed });
    };
    const stop = startStatsPoll(tick);
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, url, infoHash, fileIdx, nonce]);

  return {
    enabled,
    phase,
    peers,
    downloadSpeed,
    retry: () => {
      failedRef.current = false;
      sawDataRef.current = false;
      setStatus((cur) => ({ ...cur, phase: "searching" }));
      setNonce((n) => n + 1);
    },
  };
}

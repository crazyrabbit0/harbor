import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerBridge } from "@/lib/player/bridge";
import type { RoomSnapshot } from "@/lib/together/client";
import { GUEST_ESCAPE_MS, READY_STALE_MS } from "../player-utils";

const EMPTY_STALE_IDS = new Set<string>();

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export function useLobbyGate(params: {
  inRoom: boolean;
  isHost: boolean;
  hasStarted: boolean;
  setHasStarted: (v: boolean) => void;
  roomSnapshot: RoomSnapshot;
  startRoom: () => void;
  suppressOutgoingFor: (ms: number) => void;
  bridgeRef: RefObject<PlayerBridge | null>;
  initialSyncDoneRef: RefObject<boolean>;
  mediaKey: string;
}): {
  startHost: () => void;
  playWithoutSync: () => void;
  guestEscapeReady: boolean;
  staleIds: Set<string>;
} {
  const {
    inRoom,
    isHost,
    hasStarted,
    setHasStarted,
    roomSnapshot,
    startRoom,
    suppressOutgoingFor,
    bridgeRef,
    initialSyncDoneRef,
    mediaKey,
  } = params;

  const startHost = () => {
    setHasStarted(true);
    startRoom();
    suppressOutgoingFor(0);
    bridgeRef.current?.play().catch(() => {});
  };

  useEffect(() => {
    if (!inRoom || !isHost || !hasStarted || roomSnapshot.started) return;
    startRoom();
  }, [inRoom, isHost, hasStarted, roomSnapshot.started, startRoom]);

  const playWithoutSync = () => {
    initialSyncDoneRef.current = true;
    setHasStarted(true);
    bridgeRef.current?.play().catch(() => {});
  };

  const escapeKey = inRoom && !isHost && !hasStarted ? mediaKey : null;
  const [escapeReadyFor, setEscapeReadyFor] = useState<string | null>(null);
  if (escapeReadyFor !== null && escapeReadyFor !== escapeKey) {
    setEscapeReadyFor(null);
  }
  const guestEscapeReady = escapeKey !== null && escapeReadyFor === escapeKey;
  useEffect(() => {
    if (escapeKey === null) return;
    const t = window.setTimeout(() => setEscapeReadyFor(escapeKey), GUEST_ESCAPE_MS);
    return () => {
      window.clearTimeout(t);
    };
  }, [escapeKey]);

  const firstSeenRef = useRef<Map<string, number>>(new Map());
  const staleActive = inRoom && isHost && !hasStarted;
  const [staleState, setStaleState] = useState<{
    key: string;
    active: boolean;
    ids: Set<string>;
  }>({ key: mediaKey, active: staleActive, ids: EMPTY_STALE_IDS });
  if (staleState.key !== mediaKey || staleState.active !== staleActive) {
    setStaleState({
      key: mediaKey,
      active: staleActive,
      ids: staleState.key === mediaKey && staleActive ? staleState.ids : EMPTY_STALE_IDS,
    });
  }
  const staleIds = staleActive && staleState.key === mediaKey ? staleState.ids : EMPTY_STALE_IDS;
  useEffect(() => {
    firstSeenRef.current = new Map();
  }, [mediaKey]);
  useEffect(() => {
    if (!staleActive) return;
    const tick = () => {
      const now = Date.now();
      const seen = firstSeenRef.current;
      const ids = new Set(roomSnapshot.participants.map((p) => p.id));
      for (const id of ids) if (!seen.has(id)) seen.set(id, now);
      for (const id of seen.keys()) if (!ids.has(id)) seen.delete(id);
      const next = new Set<string>();
      for (const p of roomSnapshot.participants) {
        if (!p.ready && now - (seen.get(p.id) ?? now) > READY_STALE_MS) next.add(p.id);
      }
      setStaleState((prev) =>
        prev.key === mediaKey && prev.active && !sameSet(prev.ids, next)
          ? { ...prev, ids: next }
          : prev,
      );
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [staleActive, mediaKey, roomSnapshot.participants]);

  return { startHost, playWithoutSync, guestEscapeReady, staleIds };
}

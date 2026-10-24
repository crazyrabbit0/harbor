import { useEffect, useRef, type RefObject } from "react";
import type { PlayerBridge } from "@/lib/player/bridge";
import { notifyMediaSeeked } from "@/lib/media-session";

export function usePendingSeekApply(params: {
  pendingSeekSec: number | null;
  clearPendingSeek: () => void;
  durationSec: number;
  bridgeRef: RefObject<PlayerBridge | null>;
  inRoomRef: RefObject<boolean>;
  sourceKey: string;
  startPaused?: boolean;
}) {
  const {
    pendingSeekSec,
    clearPendingSeek,
    durationSec,
    bridgeRef,
    inRoomRef,
    sourceKey,
    startPaused,
  } = params;
  const onApplied = useRef(clearPendingSeek);
  onApplied.current = clearPendingSeek;
  useEffect(() => {
    if (pendingSeekSec == null) return;
    if (durationSec <= 0) return;
    const b = bridgeRef.current;
    if (!b) return;
    const target = pendingSeekSec;
    const t = target <= 5 || target >= durationSec - 20 ? 0 : Math.min(target, durationSec - 1);
    let issued = false;
    let applied = false;
    let alreadyThere = false;
    const atTarget = (snap: { status: string; positionSec: number }) =>
      snap.status !== "loading" &&
      Number.isFinite(snap.positionSec) &&
      Math.abs(snap.positionSec - t) <= 1;
    const apply = () => {
      applied = true;
      notifyMediaSeeked(t);
      onApplied.current();
      if (!inRoomRef.current && !startPaused) b.play().catch(() => {});
    };
    const off = b.subscribe((snap) => {
      if (!issued) {
        alreadyThere = atTarget(snap);
        return;
      }
      // Intro/outro automation stays blocked until the player reports the requested position, even while paused.
      if (applied || bridgeRef.current !== b || !atTarget(snap)) return;
      apply();
    });
    issued = true;
    // A load that started at the resume point (start=) is already there; seeking again restarts the exact seek and its decode.
    if (alreadyThere && t > 0) {
      apply();
      return off;
    }
    b.seek(t);
    return off;
  }, [pendingSeekSec, durationSec, bridgeRef, inRoomRef, sourceKey, startPaused]);
}

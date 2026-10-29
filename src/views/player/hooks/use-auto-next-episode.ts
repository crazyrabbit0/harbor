import { useEffect, useRef, type RefObject } from "react";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { isNaturalEnd } from "@/lib/player/playback-end";
import type { PlayEpisode, PlayerSrc } from "@/lib/view";

const STUB_MAX_SEC = 150;

export function useAutoNextEpisode(params: {
  src: PlayerSrc;
  snap: PlayerSnapshot;
  nextEp: PlayEpisode | null;
  canChangeEpisode: boolean;
  cancelled: boolean;
  startedNearEndRef: RefObject<boolean>;
  goToEpisode: (ep: PlayEpisode | null) => void;
}) {
  const { src, snap, nextEp, canChangeEpisode, cancelled, startedNearEndRef, goToEpisode } = params;
  const firedForRef = useRef<string | null>(null);
  // The previous episode's "ended" snapshot survives a source change until the new load starts; never act on it.
  const loadSeenForRef = useRef<string | null>(src.url);
  if (snap.status === "loading" || snap.status === "idle") loadSeenForRef.current = src.url;

  useEffect(() => {
    if (cancelled) return;
    if (loadSeenForRef.current !== src.url) return;
    if (!nextEp) return;
    if (!canChangeEpisode) return;
    if (snap.durationSec <= 0) return;
    if (snap.durationSec < STUB_MAX_SEC) return;
    if (startedNearEndRef.current) return;
    const pos = getPlaybackPosition();
    const naturalEnd = isNaturalEnd(snap, getPlaybackPosition());
    const errorAtEnd = snap.errorCode != null && pos >= snap.durationSec - 2;
    const reachedEnd = snap.status !== "playing" && pos >= snap.durationSec - 1;
    if (!naturalEnd && !errorAtEnd && !reachedEnd) return;
    if (firedForRef.current === src.url) return;
    firedForRef.current = src.url;
    goToEpisode(nextEp);
  }, [
    snap.status,
    snap.errorCode,
    snap.durationSec,
    src.url,
    nextEp,
    canChangeEpisode,
    cancelled,
    goToEpisode,
  ]);
}

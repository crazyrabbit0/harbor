import { useEffect, useRef, type RefObject } from "react";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { isLocalUrl } from "@/lib/player/local-url";
import { isLivePlaybackSrc } from "@/lib/player/live-src";
import type { PlayerSrc } from "@/lib/view";

const WAKE_GAP_MS = 30_000;
const TICK_MS = 2_000;

export function useWakeReconnect(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  src: PlayerSrc;
  snap: PlayerSnapshot;
  activeUrlRef?: RefObject<string | null>;
}) {
  const { bridgeRef, src, snap, activeUrlRef } = params;
  const srcRef = useRef(src);
  srcRef.current = src;
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const gap = now - last;
      last = now;
      if (gap < WAKE_GAP_MS) return;

      const s = srcRef.current;
      if (isLocalUrl(s.url)) return;
      const snap = snapRef.current;
      if (snap.status === "ended" || snap.status === "idle") return;
      if (snap.durationSec <= 0 && getPlaybackPosition() <= 0) return;
      const b = bridgeRef.current;
      if (!b) return;

      const pos = getPlaybackPosition();
      const live = isLivePlaybackSrc(s);
      console.warn(
        `[player] system resumed after ${Math.round(gap / 1000)}s asleep — reconnecting stream`,
      );
      // Reconnect what is playing now; a manual swap's own headers live in its proxy URL, so src headers stay with src.url.
      const url = activeUrlRef?.current ?? s.url;
      void b.load({
        url,
        subtitles: s.subtitles,
        notWebReady: s.notWebReady,
        isLive: live,
        headers: url === s.url ? s.headers : undefined,
        startAtSec: !live && pos > 1 ? pos : undefined,
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [bridgeRef, activeUrlRef]);
}

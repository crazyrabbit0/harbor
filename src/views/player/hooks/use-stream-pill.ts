import { useCallback, useEffect, useState } from "react";
import type { PlayerSnapshot } from "@/lib/player/bridge";

export type StreamPillVariant = "check" | "stalled" | "failed";

export function resolveStreamPillVariant(input: {
  snap: PlayerSnapshot;
  dismissed: boolean;
  pillSuppressed: boolean;
  pipMode: boolean;
  showWaiting: boolean;
  isLocalSrc: boolean;
  slowLoad: boolean;
  inRoom: boolean;
  streamCheckOpen: boolean;
}): StreamPillVariant | null {
  const {
    snap,
    dismissed,
    pillSuppressed,
    pipMode,
    showWaiting,
    isLocalSrc,
    slowLoad,
    inRoom,
    streamCheckOpen,
  } = input;
  if (dismissed || pipMode || showWaiting || snap.status === "ended" || isLocalSrc) return null;
  if (snap.errorCode != null && snap.status === "error" && !pillSuppressed) return "failed";
  if (slowLoad && !inRoom && !snap.firstFrameReady) return "stalled";
  return streamCheckOpen ? "check" : null;
}

export function useStreamPill(params: {
  srcUrl: string;
  snap: PlayerSnapshot;
  pipMode: boolean;
  showWaiting: boolean;
  isLocalSrc: boolean;
  slowLoad: boolean;
  inRoom: boolean;
  streamCheckOpen: boolean;
}): { variant: StreamPillVariant | null; dismiss: () => void } {
  const { srcUrl, snap, pipMode, showWaiting, isLocalSrc, slowLoad, inRoom, streamCheckOpen } =
    params;
  const [pillState, setPillState] = useState({
    srcUrl,
    pillSuppressed: true,
    dismissed: false,
  });
  if (pillState.srcUrl !== srcUrl) {
    setPillState({ srcUrl, pillSuppressed: true, dismissed: false });
  }
  const pillSuppressed = pillState.srcUrl === srcUrl ? pillState.pillSuppressed : true;
  const dismissed = pillState.srcUrl === srcUrl ? pillState.dismissed : false;

  useEffect(() => {
    const t = window.setTimeout(
      () =>
        setPillState((cur) => (cur.srcUrl === srcUrl ? { ...cur, pillSuppressed: false } : cur)),
      2500,
    );
    return () => window.clearTimeout(t);
  }, [srcUrl]);
  const dismiss = useCallback(
    () => setPillState((cur) => (cur.srcUrl === srcUrl ? { ...cur, dismissed: true } : cur)),
    [srcUrl],
  );

  const variant = resolveStreamPillVariant({
    snap,
    dismissed,
    pillSuppressed,
    pipMode,
    showWaiting,
    isLocalSrc,
    slowLoad,
    inRoom,
    streamCheckOpen,
  });
  return { variant, dismiss };
}

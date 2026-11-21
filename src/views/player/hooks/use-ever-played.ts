import { useState } from "react";
import type { PlayerStatus } from "@/lib/player/bridge";
import { getPlaybackPosition, usePlaybackFlag } from "@/lib/player/playback-clock";

export function useEverPlayed(params: {
  url: string;
  status: PlayerStatus;
  durationSec: number;
  swappingEp: boolean;
  swapResolvingKey: string | null;
}) {
  const { url, status, durationSec, swappingEp, swapResolvingKey } = params;
  const [playedFor, setPlayedFor] = useState({ url, everPlayed: false });
  const hasProgress = usePlaybackFlag(() => getPlaybackPosition() > 0.3);
  const sameUrl = playedFor.url === url;
  const playedNow = (durationSec > 0 && hasProgress) || status === "playing" || status === "paused";
  const everPlayed = (sameUrl && playedFor.everPlayed) || playedNow;
  if (!sameUrl || everPlayed !== playedFor.everPlayed) {
    setPlayedFor({ url, everPlayed });
  }

  const loaderActive = swappingEp || swapResolvingKey != null || !everPlayed;

  return { everPlayed, loaderActive };
}

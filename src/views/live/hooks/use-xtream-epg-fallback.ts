import { useEffect, useMemo, useState } from "react";
import { hydrateShortEpg } from "@/lib/iptv/xtream-short-epg";
import { credsFromServer } from "@/lib/iptv/xtream";
import type { EpgIndex, IptvChannel, IptvPlaylistSource } from "@/lib/iptv/types";

const MAX_CHANNELS = 120;

export function useXtreamEpgFallback(
  source: IptvPlaylistSource | null,
  channels: IptvChannel[],
  base: EpgIndex | null,
): EpgIndex | null {
  const [augmented, setAugmented] = useState<EpgIndex | null>(null);

  const kind = source?.kind;
  const xtream = source?.xtream;
  const creds = useMemo(() => {
    if (kind !== "xtream" || !xtream) return null;
    return credsFromServer(xtream.server, xtream.username, xtream.password);
  }, [kind, xtream]);

  const baseEmpty = !base || base.byChannel.size === 0;
  const subset = useMemo(() => channels.slice(0, MAX_CHANNELS), [channels]);

  const fallbackActive = !!creds && baseEmpty && subset.length > 0;
  if (!fallbackActive && augmented !== null) setAugmented(null);

  useEffect(() => {
    if (!creds || !fallbackActive) return;
    let cancelled = false;
    hydrateShortEpg(creds, subset, base)
      .then((idx) => {
        if (!cancelled && idx && idx !== base) setAugmented(idx);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [creds, fallbackActive, baseEmpty, subset, base]);

  return augmented && baseEmpty ? augmented : base;
}

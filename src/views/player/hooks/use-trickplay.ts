import { useEffect, useState } from "react";
import { isBundledEngineUrl } from "@/lib/stremio-server";
import {
  setTrickplayState,
  trickplayPrefetch,
  trickplaySetUrl,
  trickplaySpawnEager,
  trickplayStop,
} from "@/lib/trickplay";
import { JUMP_FRAME_BUCKET_SEC, jumpTargets } from "@/lib/player/jump-marks";

export function useTrickplay({
  url,
  enabled,
  isLive,
  prefetchDurationSec = 0,
}: {
  url: string;
  enabled: boolean;
  isLive?: boolean;
  /** When set, the 0-9 jump frames for this duration render as soon as the source opens. */
  prefetchDurationSec?: number;
}) {
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !url) {
      setTrickplayState({ active: false, bufferedOnly: false });
      return;
    }
    const isTorrent = isBundledEngineUrl(url);
    setTrickplayState({ active: true, bufferedOnly: isTorrent });
    let alive = true;
    void trickplaySetUrl(url).then(() => {
      if (!alive) return;
      setReady(url);
      if (!isLive) void trickplaySpawnEager();
    });
    return () => {
      alive = false;
      setReady(null);
      setTrickplayState({ active: false, bufferedOnly: false });
      void trickplayStop();
    };
  }, [url, enabled, isLive]);

  const prefetchable = ready === url && !isLive && !isBundledEngineUrl(url);
  const dur = Math.floor(prefetchDurationSec);
  useEffect(() => {
    if (!prefetchable || dur <= 0) return;
    void trickplayPrefetch(jumpTargets(dur), JUMP_FRAME_BUCKET_SEC);
  }, [prefetchable, dur]);
}

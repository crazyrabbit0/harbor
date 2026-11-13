import { useEffect, useMemo, useState } from "react";
import { getCachedEpg, loadEpg, subscribeEpg } from "@/lib/iptv/epg-store";
import { deriveEpgUrls } from "@/lib/iptv/m3u";
import { findCurrent } from "@/lib/iptv/xmltv";
import type { EpgIndex, EpgProgram, IptvPlaylistSource } from "@/lib/iptv/types";

export function useEpg(
  source: IptvPlaylistSource | null,
  extraUrls: string[] = [],
): {
  index: EpgIndex | null;
  loading: boolean;
  error: string | null;
} {
  const [index, setIndex] = useState<EpgIndex | null>(() =>
    source ? getCachedEpg(source.id) : null,
  );
  const extraKey = JSON.stringify(extraUrls);
  const sourceId = source?.id;
  const sourceUrl = source?.url;
  const sourceEpgUrl = source?.epgUrl;
  const urlsKey = useMemo(() => {
    if (sourceId === undefined || sourceUrl === undefined) return null;
    const own = sourceEpgUrl ? [sourceEpgUrl] : deriveEpgUrls(sourceUrl);
    const extras: string[] = JSON.parse(extraKey);
    const urls = [...new Set([...own, ...extras.filter(Boolean)])];
    return urls.length === 0 ? null : JSON.stringify(urls);
  }, [sourceId, sourceUrl, sourceEpgUrl, extraKey]);
  const requestKey =
    urlsKey === null ? null : `${sourceId}\n${sourceUrl}\n${sourceEpgUrl}\n${extraKey}`;
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null);
  if (requestKey === null && settled !== null) setSettled(null);
  const loading = requestKey !== null && settled?.key !== requestKey;
  const error = requestKey !== null && settled?.key === requestKey ? settled.error : null;
  if (requestKey === null && index !== null) setIndex(null);

  useEffect(() => {
    if (sourceId === undefined || urlsKey === null || requestKey === null) return;
    const urls: string[] = JSON.parse(urlsKey);
    let cancelled = false;
    loadEpg({ playlistId: sourceId, urls })
      .then((idx) => {
        if (cancelled) return;
        setIndex(idx);
        setSettled({ key: requestKey, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setSettled({ key: requestKey, error: e instanceof Error ? e.message : String(e) });
      });
    const unsub = subscribeEpg(() => {
      if (cancelled) return;
      const next = getCachedEpg(sourceId);
      if (next) setIndex(next);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [sourceId, urlsKey, requestKey]);

  return { index, loading, error };
}

export function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function nowOn(
  index: EpgIndex | null,
  tvgId: string | null,
  now: number,
): { current: EpgProgram | null; next: EpgProgram | null } {
  if (!index || !tvgId) return { current: null, next: null };
  const arr = index.byChannel.get(tvgId);
  return findCurrent(arr, now);
}

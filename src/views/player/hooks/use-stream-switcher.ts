import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackPosition, usePlaybackFlag } from "@/lib/player/playback-clock";
import { pinPickerCache, unpinPickerCache } from "@/lib/picker-cache";
import { readResumeMs } from "@/lib/resume";
import { SHORT_PLAYBACK_SEC } from "@/lib/dead-streams";
import { savePlayback } from "@/lib/playback-history";
import { resolveStream } from "@/lib/streams/resolve";
import type { ScoredStream } from "@/lib/streams/types";
import { registerStreamProxy, unregisterStreamProxy } from "@/lib/stream-proxy";
import { playbackStartupProfile } from "@/lib/player/startup-profile";
import { resolvePlaybackRedirect } from "@/lib/streams/playback-redirect";
import type { PlayerSrc } from "@/lib/view";
import type { DebridStore } from "@/lib/debrid/types";

let checkShownThisSession = false;

export function useStreamSwitcher(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  src: PlayerSrc;
  snap: PlayerSnapshot;
  debrids: DebridStore[];
}) {
  const { bridgeRef, src, snap, debrids } = params;
  const snapRef = useRef(snap);
  useLayoutEffect(() => {
    snapRef.current = snap;
  });
  // An in-place episode change keeps this hook mounted, so a swap reads the current episode, not the one it began with.
  const srcRef = useRef(src);
  useLayoutEffect(() => {
    srcRef.current = src;
  });

  const [streamCheckState, setStreamCheckState] = useState<{
    url: string;
    open: boolean;
    shown: boolean;
  }>(() => ({ url: src.url, open: false, shown: checkShownThisSession }));
  if (streamCheckState.url !== src.url) {
    setStreamCheckState({ url: src.url, open: false, shown: streamCheckState.shown });
  }
  const isLive = src.meta.id?.startsWith("iptv:") ?? false;
  const startedEnough = usePlaybackFlag(() => getPlaybackPosition() >= 1.5);
  const baseCheckShown = streamCheckState.shown;
  const shouldOpenCheck = !baseCheckShown && !isLive && snap.status === "playing" && startedEnough;
  if (shouldOpenCheck) {
    setStreamCheckState({ url: src.url, open: true, shown: true });
  }
  const streamCheckOpen =
    (streamCheckState.url === src.url && streamCheckState.open) || shouldOpenCheck;
  const setStreamCheckOpen = useCallback((next: boolean | ((cur: boolean) => boolean)) => {
    setStreamCheckState((cur) => {
      const open = typeof next === "function" ? next(cur.open) : next;
      return cur.open === open ? cur : { ...cur, open };
    });
  }, []);
  useEffect(() => {
    if (streamCheckState.shown) checkShownThisSession = true;
  }, [streamCheckState.shown]);
  useEffect(() => {
    if (!streamCheckOpen) return;
    const t = window.setTimeout(() => setStreamCheckOpen(false), 5500);
    return () => window.clearTimeout(t);
  }, [streamCheckOpen, setStreamCheckOpen]);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [liveState, setLiveState] = useState(() => ({
    srcUrl: src.url,
    srcHistoryUrl: src.historyUrl,
    srcStreamRef: src.streamRef,
    liveUrl: src.url,
    liveHistoryUrl: src.historyUrl ?? src.url,
    liveStreamRef: src.streamRef,
    swapResolvingKey: null as string | null,
  }));
  const srcChanged =
    liveState.srcUrl !== src.url ||
    liveState.srcHistoryUrl !== src.historyUrl ||
    liveState.srcStreamRef !== src.streamRef;
  if (srcChanged) {
    setLiveState({
      srcUrl: src.url,
      srcHistoryUrl: src.historyUrl,
      srcStreamRef: src.streamRef,
      liveUrl: src.url,
      liveHistoryUrl: src.historyUrl ?? src.url,
      liveStreamRef: src.streamRef,
      swapResolvingKey: null,
    });
  }
  const liveUrl = srcChanged ? src.url : liveState.liveUrl;
  const liveHistoryUrl = srcChanged ? (src.historyUrl ?? src.url) : liveState.liveHistoryUrl;
  const liveStreamRef = srcChanged ? src.streamRef : liveState.liveStreamRef;
  const swapResolvingKey = srcChanged ? null : liveState.swapResolvingKey;
  const swapAcRef = useRef<AbortController | null>(null);
  useEffect(() => {
    swapAcRef.current?.abort();
  }, [src.url, src.historyUrl, src.streamRef]);

  const switchProxySessionRef = useRef<string | null>(null);

  // Pin this item's streams in the picker cache for the whole playback session
  // so they survive the 30-min stale sweep. Without this, opening the switcher
  // after watching a while found a cold cache and fell back to the full picker.
  useEffect(() => {
    pinPickerCache(src.meta, src.episode);
    return () => unpinPickerCache(src.meta, src.episode);
  }, [src.meta, src.episode]);

  // Always open the in-place switcher overlay. NEVER navigate to the full
  // picker from here: that unmounts the player and stops the movie, which is
  // the "switching stream kicked me out of the movie" bug. The pinned cache
  // above keeps this item's streams available for the overlay.
  const pickAnother = () => {
    setSwitcherOpen(true);
  };

  const onSwitchStream = async (stream: ScoredStream) => {
    const src = srcRef.current;
    const key = stream.infoHash ?? stream.url ?? `${stream.addonId}:${stream.title ?? ""}`;
    setLiveState((cur) => ({ ...cur, swapResolvingKey: key }));
    swapAcRef.current?.abort();
    const ac = new AbortController();
    swapAcRef.current = ac;
    const hint = src.episode
      ? { season: src.episode.season ?? null, episode: src.episode.episode ?? null }
      : undefined;
    const r = await resolveStream(stream, debrids, ac.signal, true, false, hint);
    if (ac.signal.aborted) {
      if (swapAcRef.current === ac) {
        setLiveState((cur) =>
          cur.swapResolvingKey === null ? cur : { ...cur, swapResolvingKey: null },
        );
      }
      return;
    }
    if (!r.ok) {
      console.warn(`[player] stream swap failed: ${r.code}`);
      setLiveState((cur) => ({ ...cur, swapResolvingKey: null }));
      return;
    }
    let playUrl = r.data.url;
    if (r.via === "direct") {
      playUrl = await resolvePlaybackRedirect({
        url: playUrl,
        headers: r.data.headers,
        signal: ac.signal,
      });
      if (ac.signal.aborted) {
        if (swapAcRef.current === ac) {
          setLiveState((cur) =>
            cur.swapResolvingKey === null ? cur : { ...cur, swapResolvingKey: null },
          );
        }
        return;
      }
    }
    let nextProxySessionId: string | null = null;
    const hasProxyHeaders = !!r.data.headers && Object.keys(r.data.headers).length > 0;
    if (hasProxyHeaders) {
      try {
        const proxied = await registerStreamProxy(r.data.url, r.data.headers);
        playUrl = proxied.url;
        nextProxySessionId = proxied.sessionId;
      } catch {
        setLiveState((cur) => ({ ...cur, swapResolvingKey: null }));
        return;
      }
    }
    const b = bridgeRef.current;
    if (!b) {
      if (nextProxySessionId) void unregisterStreamProxy(nextProxySessionId).catch(() => {});
      setLiveState((cur) => ({ ...cur, swapResolvingKey: null }));
      return;
    }
    const swapIn = async () => {
      const current = getPlaybackPosition();
      const savedSec = readResumeMs(src.meta.id, src.episode?.season, src.episode?.episode) / 1000;
      const curDur = snapRef.current.durationSec;
      const currentIsStub = curDur > 0 && curDur < SHORT_PLAYBACK_SEC;
      const resumeAt = !currentIsStub && current > 5 ? current : savedSec;
      await b.load({
        url: playUrl,
        subtitles: r.data.subtitles,
        notWebReady: r.data.notWebReady,
        startAtSec: resumeAt > 5 ? resumeAt : undefined,
        startupProfile: playbackStartupProfile(stream),
      });
      await b.play().catch(() => {});
    };
    const swapped = await swapIn().then(
      () => true,
      (e) => {
        if (nextProxySessionId) void unregisterStreamProxy(nextProxySessionId).catch(() => {});
        console.warn("[player] stream swap failed", e);
        setLiveState((cur) => ({ ...cur, swapResolvingKey: null }));
        return false;
      },
    );
    if (!swapped) return;
    const previousProxySessionId = switchProxySessionRef.current;
    switchProxySessionRef.current = nextProxySessionId;
    if (previousProxySessionId) {
      void unregisterStreamProxy(previousProxySessionId).catch(() => {});
    }
    setLiveState((cur) => ({
      ...cur,
      liveUrl: playUrl,
      liveHistoryUrl: r.data.url,
      liveStreamRef: {
        resolvedFilename:
          r.data.filename ??
          stream.behaviorHints?.filename ??
          stream.behaviorHints?.fileName ??
          null,
        infoHash: stream.infoHash ?? null,
        fileIdx: r.data.fileIdx ?? stream.fileIdx ?? null,
        addonId: stream.addonId ?? null,
        title: stream.title ?? null,
        parsedTitle: stream.parsedTitle ?? null,
        resolution: stream.resolution ?? null,
        releaseGroup: stream.releaseGroupNormalized ?? null,
        source: stream.source ?? null,
        size: stream.size ?? null,
        bingeGroup: stream.behaviorHints?.bingeGroup ?? null,
        cachedSlugs: Object.entries(stream.cached ?? {})
          .filter(([, v]) => v === true)
          .map(([k]) => k),
      },
      swapResolvingKey: null,
    }));
    if (src.meta.id && !src.meta.id.startsWith("iptv:")) {
      savePlayback(
        src.meta.id,
        {
          infoHash: stream.infoHash ?? null,
          fileIdx: r.data.fileIdx ?? stream.fileIdx ?? null,
          addonId: stream.addonId ?? null,
          url: r.data.url,
          title: src.meta.name,
          parsedTitle: stream.parsedTitle ?? null,
          resolution: stream.resolution ?? null,
          releaseGroup: stream.releaseGroupNormalized ?? null,
          source: stream.source ?? null,
          size: stream.size ?? null,
          bingeGroup: stream.behaviorHints?.bingeGroup ?? null,
          cachedSlugs: Object.entries(stream.cached ?? {})
            .filter(([, v]) => v === true)
            .map(([k]) => k),
        },
        src.episode?.season,
        src.episode?.episode,
      );
    }
    setSwitcherOpen(false);
    setStreamCheckOpen(false);
  };

  useEffect(
    () => () => {
      swapAcRef.current?.abort();
      if (switchProxySessionRef.current) {
        void unregisterStreamProxy(switchProxySessionRef.current).catch(() => {});
      }
    },
    [],
  );

  return {
    streamCheckOpen,
    setStreamCheckOpen,
    switcherOpen,
    setSwitcherOpen,
    swapResolvingKey,
    liveUrl,
    liveHistoryUrl,
    liveStreamRef,
    pickAnother,
    onSwitchStream,
  };
}

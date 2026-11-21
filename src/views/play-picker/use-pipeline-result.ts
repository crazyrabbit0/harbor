import { useCallback, useEffect, useMemo, useState } from "react";
import type { Addon } from "@/lib/addons";
import type { Meta } from "@/lib/cinemeta";
import { useDebridClients } from "@/lib/debrid/registry";
import {
  buildPickerConfigHash,
  clearOnePickerCache,
  getPickerCache,
  peekPickerCache,
  setPickerCache,
} from "@/lib/picker-cache";
import { useSettings } from "@/lib/settings";
import type { AddonProgress } from "@/lib/streams/addons";
import { pluginCacheTokens } from "@/lib/streams/plugins";
import { runPipeline, type PipelineResult } from "@/lib/streams/pipeline";
import { buildEpisodePipelineInput } from "@/lib/streams/episode-pipeline-input";
import type { PlayEpisode } from "@/lib/view";
import {
  pickerErrorTransport,
  pipelineError,
  stampAddonOrder,
  type PickerError,
} from "./picker-utils";

type Settings = ReturnType<typeof useSettings>["settings"];

const EMPTY_QUORUM: AddonProgress = {
  settled: 0,
  total: 0,
  queriedAddonIds: [],
  settledAddonIds: [],
};

const COMPLETE_CACHE_QUORUM: AddonProgress = {
  settled: 1,
  total: 1,
  queriedAddonIds: [],
  settledAddonIds: [],
};

export function usePipelineResult({
  meta,
  episode,
  imdbId,
  streamIds,
  addons,
  debrids,
  settings,
  strictMode,
  filterDisabled,
  animeTitles,
}: {
  meta: Meta;
  episode: PlayEpisode | undefined;
  imdbId: string | null;
  streamIds: string[] | null;
  addons: Addon[] | null;
  debrids: ReturnType<typeof useDebridClients>;
  settings: Settings;
  strictMode: boolean;
  filterDisabled: boolean;
  animeTitles: string[] | null;
}) {
  const [mountAt] = useState(() => performance.now());
  const [refreshInfo, setRefreshInfo] = useState<{ nonce: number; at: number }>({
    nonce: 0,
    at: 0,
  });
  const baseTimestamp = refreshInfo.nonce > 0 ? refreshInfo.at : mountAt;

  const configHash = useMemo(
    () =>
      buildPickerConfigHash({
        addonTransportUrls: (addons ?? []).map((a) => a.transportUrl),
        debridSlugs: debrids.map((d) => d.slug),
        scraperKeys: pluginCacheTokens(),
        filterMode: filterDisabled ? "off" : strictMode ? "strict" : "balanced",
      }),
    [addons, debrids, filterDisabled, strictMode],
  );

  const ready = streamIds !== null && addons !== null;
  const requestKey = ready
    ? [
        streamIds.join("\0"),
        imdbId ?? "",
        configHash,
        addons.map((a) => a.manifest?.id ?? "").join("\0"),
        meta.id,
        meta.name,
        meta.type,
        meta.releaseInfo ?? "",
        episode?.season ?? "",
        episode?.episode ?? "",
        episode?.videoId ?? "",
        (settings.preferredLanguages ?? []).join("\0"),
        settings.requirePreferredLanguage ? "1" : "0",
        strictMode ? "1" : "0",
        filterDisabled ? "1" : "0",
        (animeTitles ?? []).join("|"),
        refreshInfo.nonce,
      ].join("::")
    : null;

  const rawCached = ready ? peekPickerCache(meta, episode) : null;
  const cached = rawCached && rawCached.configHash === configHash ? rawCached : null;
  const initialComplete = cached != null && cached.complete;
  const initialHead =
    !initialComplete && cached && cached.result.picker.all.length > 0 ? cached : null;

  const [prevKey, setPrevKey] = useState<string | null>(requestKey);
  const [result, setResult] = useState<PipelineResult | null>(() =>
    initialComplete
      ? { ...cached.result, raw: { addon: [], library: [] } }
      : initialHead
        ? { ...initialHead.result, raw: { addon: [], library: [] } }
        : null,
  );
  const [loading, setLoading] = useState(() =>
    requestKey === null ? true : initialComplete ? false : !initialHead,
  );
  const [pipelineDone, setPipelineDone] = useState(() => initialComplete);
  const [firstResultAt, setFirstResultAt] = useState<number | null>(() =>
    initialComplete || initialHead ? baseTimestamp : null,
  );
  const [autoSettleReady, setAutoSettleReady] = useState(() => initialComplete);
  const [pickerError, setResolveError] = useState<PickerError | null>(null);
  const [addonQuorum, setAddonQuorum] = useState<AddonProgress>(() =>
    initialComplete ? COMPLETE_CACHE_QUORUM : EMPTY_QUORUM,
  );
  const [pipelineStartedAt, setPipelineStartedAt] = useState<number | null>(() =>
    requestKey === null ? null : baseTimestamp,
  );

  if (prevKey !== requestKey) {
    setPrevKey(requestKey);
    if (requestKey === null) {
      setResult(null);
      setLoading(true);
      setPipelineDone(false);
      setFirstResultAt(null);
      setAutoSettleReady(false);
      setResolveError(null);
      setAddonQuorum(EMPTY_QUORUM);
      setPipelineStartedAt(null);
    } else if (cached && cached.complete) {
      setResult({ ...cached.result, raw: { addon: [], library: [] } });
      setLoading(false);
      setPipelineDone(true);
      setFirstResultAt(baseTimestamp);
      setAutoSettleReady(true);
      setResolveError(null);
      setAddonQuorum(COMPLETE_CACHE_QUORUM);
      setPipelineStartedAt(baseTimestamp);
    } else {
      // A background prefetch (next episode without plugins) is shown at once while the full search runs.
      const head = cached && cached.result.picker.all.length > 0 ? cached : null;
      setLoading(!head);
      setResult(head ? { ...head.result, raw: { addon: [], library: [] } } : null);
      setResolveError(null);
      setPipelineDone(false);
      setFirstResultAt(head ? baseTimestamp : null);
      setAutoSettleReady(false);
      setAddonQuorum(EMPTY_QUORUM);
      setPipelineStartedAt(baseTimestamp);
    }
  }

  useEffect(() => {
    if (!streamIds || addons === null) return;
    const ac = new AbortController();
    const cachedEntry = getPickerCache(meta, episode, configHash);
    if (cachedEntry && cachedEntry.complete) {
      return () => ac.abort();
    }
    const startedAt = performance.now();
    runPipeline(
      buildEpisodePipelineInput({
        meta,
        episode,
        imdbId,
        streamIds,
        addons,
        debrids,
        settings,
        strictMode,
        filterDisabled,
        animeTitles,
      }),
      ac.signal,
      (partial) => {
        if (ac.signal.aborted) return;
        if (partial.picker.all.length === 0) return;
        stampAddonOrder(partial.picker.all, partial.raw.addon);
        setResult(partial);
        setLoading(false);
        setFirstResultAt((prev) => prev ?? performance.now());
        setPipelineStartedAt((prev) => prev ?? startedAt);
        setPickerCache(meta, episode, partial, configHash, false);
      },
      (progress) => {
        if (ac.signal.aborted) return;
        setPipelineStartedAt((prev) => prev ?? startedAt);
        setAddonQuorum(progress);
      },
    )
      .then((r) => {
        if (ac.signal.aborted) return;
        stampAddonOrder(r.picker.all, r.raw.addon);
        setResult(r);
        setLoading(false);
        setPipelineDone(true);
        setAutoSettleReady(true);
        setPickerCache(meta, episode, r, configHash);
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setResolveError(pipelineError(e instanceof Error ? e.message : undefined));
        setLoading(false);
        setPipelineDone(true);
        setAutoSettleReady(true);
      });
    return () => ac.abort();
  }, [requestKey]);

  const refresh = useCallback(() => {
    clearOnePickerCache(meta, episode);
    setRefreshInfo((prev) => ({ nonce: prev.nonce + 1, at: performance.now() }));
  }, [meta, episode]);
  const resolveError = pickerErrorTransport(pickerError);

  return {
    result,
    loading,
    pipelineDone,
    firstResultAt,
    autoSettleReady,
    addonQuorum,
    pipelineStartedAt,
    resolveError,
    pickerError,
    refresh,
    setResult,
    setLoading,
    setPipelineDone,
    setFirstResultAt,
    setAutoSettleReady,
    setResolveError,
  };
}

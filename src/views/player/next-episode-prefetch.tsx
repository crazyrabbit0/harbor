import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { Meta } from "@/lib/cinemeta";
import { prepareCachedDebridStreams } from "@/lib/debrid/playback-preparation";
import { useDebridClients } from "@/lib/debrid/registry";
import {
  buildPickerConfigHash,
  getPickerCache,
  keepPrefetchedPickerCache,
  setPickerCache,
} from "@/lib/picker-cache";
import { getPlaybackPosition, usePlaybackFlag } from "@/lib/player/playback-clock";
import { useSettings } from "@/lib/settings";
import { buildEpisodePipelineInput } from "@/lib/streams/episode-pipeline-input";
import { runPipeline } from "@/lib/streams/pipeline";
import { isPluginAddon, pluginCacheTokens } from "@/lib/streams/plugins";
import { warmStreamUrl } from "@/lib/streams/preflight";
import type { RankedPicker } from "@/lib/streams/types";
import type { PlayEpisode } from "@/lib/view";
import { useAddons } from "@/views/play-picker/use-addons";
import { useAnimeAltTitles } from "@/views/play-picker/use-anime-alt-titles";
import { useImdbId } from "@/views/play-picker/use-imdb-id";
import { useStreamIds } from "@/views/play-picker/use-stream-ids";
import { stampAddonOrder } from "@/views/play-picker/picker-utils";

const WARM_BEFORE_END_SEC = 90;

/** Fills the picker cache for the next episode so Next and auto-advance skip the addon search. */
export function NextEpisodePrefetch({
  meta,
  episode,
  durationSec,
}: {
  meta: Meta;
  episode: PlayEpisode;
  durationSec: number;
}) {
  // Prepared debrid links expire after two minutes, so they are opened only in the last 90 s.
  const warm = usePlaybackFlag(
    () => durationSec > 0 && getPlaybackPosition() >= durationSec - WARM_BEFORE_END_SEC,
  );
  const { settings } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const { authKey } = useAuth();
  const debrids = useDebridClients();
  const imdb = useImdbId(meta, settings.tmdbKey);
  const streamIds = useStreamIds(meta, episode, imdb.id);
  const { addons: allAddons } = useAddons(authKey, settings);
  const addons = useMemo(
    () =>
      allAddons
        ? allAddons.filter((a) => settings.pluginsBackground || !isPluginAddon(a))
        : allAddons,
    [allAddons, settings.pluginsBackground],
  );
  const animeTitles = useAnimeAltTitles(meta);

  const strictMode = settings.streamFilterLevel === "strict";
  const filterDisabled = settings.streamFilterLevel === "off";

  // The picker hashes its full addon list (plugins included), so the entry must be stored under that hash to be found.
  const pickerConfigHash = useMemo(
    () =>
      buildPickerConfigHash({
        addonTransportUrls: (allAddons ?? []).map((a) => a.transportUrl),
        debridSlugs: debrids.map((d) => d.slug),
        scraperKeys: pluginCacheTokens(),
        filterMode: filterDisabled ? "off" : strictMode ? "strict" : "balanced",
      }),
    [allAddons, debrids, filterDisabled, strictMode],
  );

  const [ready, setReady] = useState<RankedPicker | null>(null);

  useEffect(() => {
    if (!streamIds || addons === null || allAddons === null) return;
    keepPrefetchedPickerCache(meta, episode);
    const cached = getPickerCache(meta, episode, pickerConfigHash);
    if (cached?.complete) {
      setReady(cached.result.picker);
      return;
    }
    const ac = new AbortController();
    const s = settingsRef.current;
    const everyAddon = addons.length === allAddons.length;

    void runPipeline(
      buildEpisodePipelineInput({
        meta,
        episode,
        imdbId: imdb.id,
        streamIds,
        addons,
        debrids,
        settings: s,
        strictMode,
        filterDisabled,
        animeTitles,
      }),
      ac.signal,
    )
      .then((r) => {
        if (ac.signal.aborted || r.picker.all.length === 0) return;
        stampAddonOrder(r.picker.all, r.raw.addon);
        // Without the plugins it is only a head start: the picker still asks them, so it is stored as incomplete.
        setPickerCache(meta, episode, r, pickerConfigHash, everyAddon);
        setReady(r.picker);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [
    meta,
    episode,
    streamIds,
    addons,
    allAddons,
    debrids,
    strictMode,
    filterDisabled,
    animeTitles,
    imdb.id,
    pickerConfigHash,
  ]);

  // Opening a debrid link creates the transfer as pressing Play would, so it follows the same opt-in setting.
  const instant = settings.instantPlaybackPreparation;
  useEffect(() => {
    if (!warm || !instant || !ready) return;
    const ac = new AbortController();
    const hint = { season: episode.season ?? null, episode: episode.episode ?? null };
    void prepareCachedDebridStreams(ready.all, debrids, hint, ac.signal).catch(() => {});
    const top = ready.primary;
    if (top?.url && top.url !== "#") void warmStreamUrl(top.url, ac.signal);
    return () => ac.abort();
  }, [warm, instant, ready, debrids, episode.season, episode.episode]);

  return null;
}

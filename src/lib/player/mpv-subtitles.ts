import { invoke } from "@tauri-apps/api/core";
import { SubtitlePreparationError, prepareSubtitle } from "@/lib/subtitles/prepare";
import type { PreparedSubtitle } from "@/lib/subtitles/prepare";
import { subtitleTrackDownloadHeaders } from "@/lib/subtitles/provider-auth";
import { takePreparedSubtitle } from "@/lib/subtitles/prepared-registry";
import { markLimitReached } from "@/lib/subtitles/limit-signal";
import { clearPendingSub, markPendingSub } from "@/lib/subtitles/pending-subs";
import {
  createSubtitleTranslationQueue,
  registerTranslationJob,
} from "@/lib/subtitles/translation-jobs";
import { generatedLangTarget } from "@/lib/subtitles/language";
import type { SubtitleLoadMetadata } from "@/lib/subtitles/types";
import type { SubCue } from "@/lib/subtitles/parser";
import { PreparedSubtitleSeedBatch } from "@/lib/subtitles/seed-batch";
import { isSafeProviderSubtitleUrl } from "@/lib/subtitles/provider-url";
import { resetMpvSubtitleFpsForTransition } from "./mpv-properties";
import { SUBTITLE_FPS_TRANSITION_FAILED_EVENT } from "./subtitle-fps";
import { PreparedSubtitleCleanupRegistry } from "./prepared-subtitle-cleanups";
import {
  SubtitleSelectionCoordinator,
  type SubtitleSelectionOrigin,
  type SubtitleSelectionRequest,
} from "./subtitle-selection";
import {
  externalSubtitleMetadata,
  parseMpvTrackList,
  type ExternalSubtitleMetadata,
} from "./mpv-tracks";
import type { PlayerBridge, PlayerSnapshot, PlayerSource } from "./bridge";

export type MpvSubtitleContext = {
  snap: () => PlayerSnapshot;
  mediaRevision: () => number;
  mediaLoadId: () => number;
  emit: () => void;
};

type MpvSubtitleBridgeMethods = Pick<
  PlayerBridge,
  | "canAutoSelectSubtitle"
  | "setSubtitleTrack"
  | "setSecondarySubtitleTrack"
  | "addSubtitle"
  | "getSelectedTrackCues"
  | "getSelectedTrackUrl"
>;

async function resetSubtitleFpsBeforeMpvTransition(): Promise<void> {
  await resetMpvSubtitleFpsForTransition();
}

// Owns mpv's subtitle state for one bridge: seeds, provider adds, translations and main/secondary selection.
export function createMpvSubtitles(ctx: MpvSubtitleContext) {
  const { snap, mediaRevision, mediaLoadId, emit } = ctx;
  let secondarySid: string | null = null;
  let primarySubtitleOff = false;
  const confirmPrimarySubtitleVisibility = (off: boolean) => {
    primarySubtitleOff = off;
    if (off) {
      // mpv may not deliver an empty sub-text event when the track is disabled.
      snap().subText = "";
      snap().subStartSec = 0;
    }
  };
  let subtitleAddSelectionId = 0;
  const mainSubtitleSelection = new SubtitleSelectionCoordinator();
  const secondarySubtitleSelection = new SubtitleSelectionCoordinator();
  let pendingSubtitlePick: { id: string | null; origin: string } | null = null;
  let subtitleTransitionQueue: Promise<void> = Promise.resolve();
  const enqueueSubtitleTransition = <T>(task: () => Promise<T>): Promise<T> => {
    const result = subtitleTransitionQueue.then(task, task);
    subtitleTransitionQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const invalidateSubtitleSelections = () => {
    mainSubtitleSelection.invalidate();
    secondarySubtitleSelection.invalidate();
    pendingSubtitlePick = null;
  };
  const urlByExternalFilename = new Map<string, ExternalSubtitleMetadata>();
  const preparedSubtitleCleanups = new PreparedSubtitleCleanupRegistry();
  const clearPreparedSubtitles = () => preparedSubtitleCleanups.clearAll();
  // A translation is polled until the addon serves the finished file, then added once with its original selection request.
  type TranslationHandoff = {
    prepared: PreparedSubtitle;
    selection: SubtitleSelectionRequest | null;
  };
  const translations = createSubtitleTranslationQueue();
  const translationHandoffs = new Map<string, TranslationHandoff>();
  let translationEpoch = 0;
  const stopSubtitleTranslations = () => {
    translationEpoch += 1;
    translations.clear();
    translationHandoffs.clear();
  };
  const startSubtitleTranslation = async (
    request: {
      url: string;
      lang?: string;
      select?: boolean;
      metadata: SubtitleLoadMetadata;
      origin: SubtitleSelectionOrigin;
    },
    commit: (handoff: TranslationHandoff) => Promise<boolean>,
  ): Promise<boolean> => {
    const { url, metadata } = request;
    // Starting a translation costs the user a quota, so only an explicit, selecting pick may start one.
    if (request.origin !== "manual" || request.select !== true) return false;
    if (!/^https?:/i.test(url) || !isSafeProviderSubtitleUrl(url)) return false;
    const requestMediaRevision = mediaRevision();
    const requestEpoch = translationEpoch;
    mainSubtitleSelection.claim(requestMediaRevision, "manual");
    const selection = mainSubtitleSelection.begin(
      requestMediaRevision,
      `__harbor-translated-subtitle-${++subtitleAddSelectionId}__`,
      snap().subtitleTracks.find((track) => track.selected)?.id ?? null,
    );
    const owns = () =>
      requestEpoch === translationEpoch &&
      requestMediaRevision === mediaRevision() &&
      mainSubtitleSelection.isCurrent(selection, mediaRevision());
    await translations.run(url, owns, async () => {
      const prepared = await prepareSubtitle({
        url,
        translation: true,
        language: generatedLangTarget(request.lang) ?? undefined,
        format: metadata.format,
        encoding: metadata.encoding,
        release: metadata.release,
        filename: metadata.rawFilename,
        requestHeaders: subtitleTrackDownloadHeaders(
          metadata.downloadAuth,
          url,
          metadata.providerDerived ?? Boolean(metadata.provider),
        ),
      });
      if (!owns()) {
        prepared.cleanup();
        return false;
      }
      return commit({ prepared, selection });
    });
    return false;
  };

  const addSeedSubtitles = async (subtitles: PlayerSource["subtitles"], expectedLoadId: number) => {
    const orderedSeeds = subtitles ?? [];
    const seedBatch = new PreparedSubtitleSeedBatch(orderedSeeds);
    const metadataBySeed = new Map<(typeof orderedSeeds)[number], ExternalSubtitleMetadata>();
    for (const subtitle of orderedSeeds) {
      if (expectedLoadId !== mediaLoadId()) return;
      const originalUrl = subtitle.url;
      if (subtitle.trustedSource !== true && !isSafeProviderSubtitleUrl(originalUrl)) continue;
      let mpvUrl = originalUrl;
      let cleanup: (() => void) | null = null;
      let preparedFormat: SubtitleLoadMetadata["format"];
      let preparedCues: SubCue[] | undefined;
      if (/^https?:/i.test(mpvUrl)) {
        try {
          const prepared = await prepareSubtitle({
            url: mpvUrl,
            language: subtitle.lang,
            requestHeaders: subtitleTrackDownloadHeaders(
              undefined,
              mpvUrl,
              subtitle.trustedSource !== true,
            ),
          });
          mpvUrl = prepared.playableUrl;
          cleanup = prepared.cleanup;
          preparedFormat = prepared.format;
          preparedCues = prepared.cues;
        } catch (error) {
          console.warn("[mpv] seed subtitle preparation failed", {
            error: error instanceof Error ? error.name : "unknown",
          });
          continue;
        }
      }
      if (expectedLoadId !== mediaLoadId()) {
        cleanup?.();
        return;
      }
      mpvUrl = mpvUrl.replace(/\\/g, "/");
      const externalMetadata: ExternalSubtitleMetadata = {
        url: originalUrl,
        lang: subtitle.lang,
        cues: preparedCues,
        originalUrl,
        format: preparedFormat,
        prepared: cleanup != null,
        autoSelectionEligible: false,
      };
      metadataBySeed.set(subtitle, externalMetadata);
      urlByExternalFilename.set(mpvUrl, externalMetadata);
      try {
        await invoke("mpv_sub_add", {
          url: mpvUrl,
          lang: subtitle.lang ?? null,
          title: null,
          select: false,
        });
        if (expectedLoadId !== mediaLoadId()) {
          if (urlByExternalFilename.get(mpvUrl) === externalMetadata) {
            urlByExternalFilename.delete(mpvUrl);
          }
          cleanup?.();
          return;
        }
        if (cleanup) {
          preparedSubtitleCleanups.register(cleanup, expectedLoadId);
        }
        seedBatch.markReady(subtitle);
      } catch {
        if (urlByExternalFilename.get(mpvUrl) === externalMetadata) {
          urlByExternalFilename.delete(mpvUrl);
        }
        cleanup?.();
        /* one unavailable subtitle must not block media startup */
      }
    }
    seedBatch.commit(
      () => expectedLoadId === mediaLoadId(),
      (readySeeds) => {
        const readyMetadata = new Set(
          readySeeds
            .map((subtitle) => metadataBySeed.get(subtitle))
            .filter((metadata): metadata is ExternalSubtitleMetadata => metadata != null),
        );
        for (const metadata of readyMetadata) {
          metadata.prepared = true;
          metadata.autoSelectionEligible = true;
        }
        snap().subtitleTracks = snap().subtitleTracks.map((track) => {
          const externalFilename = track.externalFilename?.replace(/\\/g, "/");
          const metadata = externalFilename
            ? urlByExternalFilename.get(externalFilename)
            : undefined;
          return metadata && readyMetadata.has(metadata)
            ? { ...track, prepared: true, autoSelectionEligible: true }
            : track;
        });
        emit();
      },
    );
  };

  const applyTrackList = (list: Array<Record<string, unknown>>) => {
    const tracks = parseMpvTrackList(list, secondarySid, urlByExternalFilename);
    snap().audioTracks = tracks.audio;
    snap().subtitleTracks = tracks.subtitles;
    confirmPrimarySubtitleVisibility(!tracks.subtitles.some((track) => track.selected));
  };
  const applySubtitleText = (name: string, data: unknown) => {
    if (name === "sub-text") {
      snap().subText = !primarySubtitleOff && typeof data === "string" ? data : "";
    }
    if (name === "sub-start") {
      snap().subStartSec = !primarySubtitleOff && typeof data === "number" ? data : 0;
    }
  };
  const resetSubtitlesForLoad = () => {
    primarySubtitleOff = false;
    secondarySid = null;
    urlByExternalFilename.clear();
  };

  const methods: MpvSubtitleBridgeMethods = {
    canAutoSelectSubtitle: () => mainSubtitleSelection.canAutoSelect(mediaRevision()),
    setSubtitleTrack(id, origin = "manual") {
      if (!mainSubtitleSelection.claim(mediaRevision(), origin)) return;
      translations.clear();
      const requestMediaRevision = mediaRevision();
      mainSubtitleSelection.begin(
        requestMediaRevision,
        id ?? "__harbor-subtitles-off__",
        snap().subtitleTracks.find((track) => track.selected)?.id ?? null,
      );
      if (pendingSubtitlePick?.id === id && pendingSubtitlePick.origin === origin) return;
      const pick = { id, origin };
      pendingSubtitlePick = pick;
      const canCommit = () =>
        requestMediaRevision === mediaRevision() &&
        (origin === "manual" || mainSubtitleSelection.canAutoSelect(mediaRevision()));
      void enqueueSubtitleTransition(async () => {
        if (!canCommit()) return;
        await resetSubtitleFpsBeforeMpvTransition();
        if (!canCommit()) return;
        await invoke("mpv_set_property", {
          name: "sid",
          value: id == null ? "no" : Number(id) || id,
        });
        if (requestMediaRevision !== mediaRevision()) return;
        const selectedSid = await invoke<string | number | boolean>("mpv_get_property", {
          name: "sid",
        });
        if (requestMediaRevision !== mediaRevision()) return;
        confirmPrimarySubtitleVisibility(
          selectedSid === false ||
            selectedSid === "no" ||
            selectedSid === "" ||
            selectedSid == null,
        );
        snap().subtitleTracks = snap().subtitleTracks.map((track) => ({
          ...track,
          selected: track.id === String(selectedSid),
        }));
        emit();
      })
        .catch((error) => {
          if (requestMediaRevision === mediaRevision()) {
            console.warn("[mpv] could not select a subtitle after resetting subtitle FPS", error);
            window.dispatchEvent(new Event(SUBTITLE_FPS_TRANSITION_FAILED_EVENT));
          }
        })
        .finally(() => {
          if (pendingSubtitlePick === pick) pendingSubtitlePick = null;
        });
    },
    setSecondarySubtitleTrack(id) {
      const requestMediaRevision = mediaRevision();
      const previousSecondarySid = secondarySid;
      const request = secondarySubtitleSelection.begin(
        requestMediaRevision,
        id ?? "__harbor-secondary-subtitles-off__",
        previousSecondarySid,
      );
      snap().secondarySubText = "";
      emit();
      void enqueueSubtitleTransition(async () => {
        if (requestMediaRevision !== mediaRevision()) return;
        await resetSubtitleFpsBeforeMpvTransition();
        if (requestMediaRevision !== mediaRevision()) return;
        secondarySid = id;
        try {
          await invoke("mpv_set_property", {
            name: "secondary-sid",
            value: id == null ? "no" : Number(id) || id,
          });
        } catch (error) {
          if (secondarySubtitleSelection.isCurrent(request, mediaRevision())) {
            secondarySid = previousSecondarySid;
          }
          throw error;
        }
      }).catch((error) => {
        if (secondarySubtitleSelection.isCurrent(request, mediaRevision())) {
          console.warn(
            "[mpv] could not select a secondary subtitle after resetting subtitle FPS",
            error,
          );
          window.dispatchEvent(new Event(SUBTITLE_FPS_TRANSITION_FAILED_EVENT));
        }
      });
    },
    async addSubtitle(url, lang, title, select, metadata, origin = "manual"): Promise<boolean> {
      const handoff = translationHandoffs.get(url);
      translationHandoffs.delete(url);
      if (metadata?.translation === true && !handoff) {
        return startSubtitleTranslation({ url, lang, select, metadata, origin }, (next) => {
          translationHandoffs.set(url, next);
          return methods.addSubtitle(
            url,
            generatedLangTarget(lang) ?? lang,
            title,
            select,
            metadata,
          );
        });
      }
      const requestMediaRevision = mediaRevision();
      const requestLoadId = mediaLoadId();
      const wantsSelection = handoff
        ? handoff.selection !== null
        : (select ?? true) && mainSubtitleSelection.claim(mediaRevision(), origin);
      const selectionRequest = handoff
        ? handoff.selection
        : wantsSelection
          ? mainSubtitleSelection.begin(
              mediaRevision(),
              `__harbor-added-subtitle-${++subtitleAddSelectionId}__`,
              snap().subtitleTracks.find((track) => track.selected)?.id ?? null,
            )
          : null;
      let mpvUrl = url;
      const transferredPrepared = takePreparedSubtitle(url) ?? handoff?.prepared ?? null;
      const providerDerived = metadata?.providerDerived ?? Boolean(metadata?.provider);
      if (!transferredPrepared && providerDerived && !isSafeProviderSubtitleUrl(url)) {
        return false;
      }
      // A provider subtitle can be re-fetched (e.g. a translating addon that only serves
      // the finished file later). Replace the previous track for the same source rather
      // than stacking a duplicate. mpv's sub-remove only touches external subtitle files,
      // which is the only case that can match here.
      const sourceUrl = metadata?.originalUrl ?? url;
      const prior = transferredPrepared
        ? undefined
        : snap().subtitleTracks.find(
            (track) =>
              track.kind === "subtitle" &&
              track.external === true &&
              (track.originalUrl === sourceUrl || track.url === sourceUrl),
          );
      if (prior) {
        try {
          await invoke("mpv_sub_remove", { id: prior.id });
        } catch {
          // Track already gone; adding the refreshed file below still works.
        }
        const priorFile = prior.externalFilename?.replace(/\\/g, "/");
        if (priorFile) urlByExternalFilename.delete(priorFile);
      }
      let preparedCleanup: (() => void) | null = transferredPrepared?.cleanup ?? null;
      let preparedCues: SubCue[] | undefined = transferredPrepared?.cues;
      let registeredMetadata: ExternalSubtitleMetadata | null = null;
      if (/^https?:/i.test(url) && !transferredPrepared) {
        try {
          const prepared = await prepareSubtitle({
            url,
            language: lang,
            format: metadata?.format,
            encoding: metadata?.encoding,
            release: metadata?.release,
            filename: metadata?.rawFilename,
            requestHeaders: subtitleTrackDownloadHeaders(
              metadata?.downloadAuth,
              url,
              providerDerived,
            ),
          });
          mpvUrl = prepared.playableUrl;
          preparedCleanup = prepared.cleanup;
          preparedCues = prepared.cues;
          metadata = {
            ...metadata,
            format: prepared.format,
            encoding: prepared.encoding,
            rawFilename: prepared.rawFilename,
            archive: prepared.archive,
            prepared: true,
          };
          clearPendingSub(url);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.warn("[mpv] subtitle preparation failed", {
            error: e instanceof Error ? e.name : "unknown",
          });
          preparedCleanup?.();
          if (/status 429/.test(message)) {
            markLimitReached(url);
          }
          if (
            metadata?.refreshable === true &&
            e instanceof SubtitlePreparationError &&
            (e.reason === "invalid-cues" || e.reason === "unsupported-format")
          ) {
            // The addon answered before the subtitle was ready. Treat it as a pending
            // job so the UI says "try again shortly", and never surface the placeholder.
            markPendingSub(url);
            registerTranslationJob({ url, lang, title, metadata });
          }
          return false;
        }
      }
      if (requestMediaRevision !== mediaRevision()) {
        preparedCleanup?.();
        return false;
      }
      mpvUrl = mpvUrl.replace(/\\/g, "/");
      try {
        const externalMetadata = externalSubtitleMetadata(url, lang, title, preparedCues, metadata);
        urlByExternalFilename.set(mpvUrl, externalMetadata);
        registeredMetadata = externalMetadata;
        const addToMpv = async (): Promise<boolean> => {
          if (requestMediaRevision !== mediaRevision()) return false;
          let selectAtCommit = false;
          if (
            selectionRequest &&
            mainSubtitleSelection.isCurrent(selectionRequest, mediaRevision())
          ) {
            await resetSubtitleFpsBeforeMpvTransition();
            if (requestMediaRevision !== mediaRevision()) return false;
            selectAtCommit = mainSubtitleSelection.isCurrent(selectionRequest, mediaRevision());
          }
          await invoke("mpv_sub_add", {
            url: mpvUrl,
            lang: lang ?? null,
            title: title ?? null,
            select: selectAtCommit,
          });
          return true;
        };
        const added = selectionRequest
          ? await enqueueSubtitleTransition(addToMpv)
          : await addToMpv();
        if (!added) {
          if (urlByExternalFilename.get(mpvUrl) === externalMetadata) {
            urlByExternalFilename.delete(mpvUrl);
          }
          preparedCleanup?.();
          return false;
        }
        if (requestMediaRevision !== mediaRevision()) {
          if (urlByExternalFilename.get(mpvUrl) === externalMetadata) {
            urlByExternalFilename.delete(mpvUrl);
          }
          preparedCleanup?.();
          return false;
        }
        if (preparedCleanup) preparedSubtitleCleanups.register(preparedCleanup, requestLoadId);
        return true;
      } catch (e) {
        if (registeredMetadata && urlByExternalFilename.get(mpvUrl) === registeredMetadata) {
          urlByExternalFilename.delete(mpvUrl);
        }
        preparedCleanup?.();
        console.warn("[mpv] sub-add failed", e);
        return false;
      }
    },
    getSelectedTrackCues() {
      const selected = snap().subtitleTracks.find((track) => track.selected);
      if (!selected?.externalFilename) return null;
      return urlByExternalFilename.get(selected.externalFilename.replace(/\\/g, "/"))?.cues ?? null;
    },
    getSelectedTrackUrl() {
      const sel = snap().subtitleTracks.find((t) => t.selected);
      if (!sel || !sel.external) return null;
      if (sel.prepared && sel.externalFilename) return sel.externalFilename;
      return sel.url ?? sel.externalFilename ?? null;
    },
  };

  return {
    bridgeMethods: methods,
    addSeedSubtitles,
    applySubtitleText,
    applyTrackList,
    clearPreparedBefore: (loadId: number) => preparedSubtitleCleanups.clearBefore(loadId),
    clearPreparedSubtitles,
    clearSecondarySid: () => {
      secondarySid = null;
    },
    invalidateSubtitleSelections,
    resetSubtitlesForLoad,
    stopSubtitleTranslations,
  };
}

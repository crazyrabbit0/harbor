import { invoke } from "@tauri-apps/api/core";
import {
  defaultVodBufferProperties,
  hasCustomBufferPolicy,
  mpvReuseConfigKey,
  mpvStartArgs,
  type BufferPhase,
  type MpvOptions,
  type StartupProfile,
} from "./mpv-config";
import {
  forgetRetainedMpv,
  retainedStartupProfile,
  takeRetainedMpv,
  waitForRetainedRelease,
} from "./mpv-session";
import {
  markMpvSubtitleFpsSessionRecreated,
  resetMpvSubtitleFpsForTransition,
} from "./mpv-properties";
import { finishPlaybackTrace, markPlaybackTrace } from "@/lib/perf/playback-trace";
import { isWindowsDesktop } from "@/lib/platform";
import type { PlayerSnapshot, PlayerSource } from "./bridge";
import type { createMpvSubtitles } from "./mpv-subtitles";

type MpvSubtitles = ReturnType<typeof createMpvSubtitles>;

/** Bridge state that loading, the event runner and destroy() all read and write. */
export type MpvLoadState = {
  mpvStarted: boolean;
  currentIsLive: boolean | null;
  currentStartupProfile: StartupProfile | null;
  mediaLoadId: number;
  activeTraceId: string | null;
  expectedMediaPath: string | null;
  mediaRevision: number;
  suppressEndFileUntil: number;
  svpFilterFailed: boolean;
};

export type MpvLoadContext = {
  state: MpvLoadState;
  options: MpvOptions | undefined;
  snap: () => PlayerSnapshot;
  hdrToSdr: () => boolean;
  emit: () => void;
  ensureEventListener: () => Promise<void>;
  ensureGeometryTracking: (opts: MpvOptions) => Promise<void>;
  resetAudioFilters: () => void;
  subtitles: Pick<
    MpvSubtitles,
    | "addSeedSubtitles"
    | "clearPreparedBefore"
    | "clearSecondarySid"
    | "invalidateSubtitleSelections"
    | "resetSubtitlesForLoad"
    | "stopSubtitleTranslations"
  >;
};

const DEFAULT_UA = "VLC/3.0.20 LibVLC/3.0.20";

async function applyHeaderProps(headers?: Record<string, string>): Promise<void> {
  let ua = DEFAULT_UA;
  const fields: string[] = [];
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (k.toLowerCase() === "user-agent") ua = v;
    else fields.push(`${k}: ${v}`);
  }
  await invoke("mpv_set_property", { name: "user-agent", value: ua }).catch(() => {});
  await invoke("mpv_set_property", { name: "http-header-fields", value: fields.join(",") }).catch(
    () => {},
  );
}

export function createMpvLoad(ctx: MpvLoadContext) {
  const { state, options: mpvOptions, subtitles } = ctx;

  const applyDefaultVodBufferPhase = async (profile: StartupProfile, phase: BufferPhase) => {
    if (mpvOptions?.fullDownload || hasCustomBufferPolicy(mpvOptions?.extraOptions)) return;
    await Promise.all(
      defaultVodBufferProperties(profile, phase).map(async ([name, value]) => {
        try {
          await invoke("mpv_set_property", { name, value });
        } catch (error) {
          console.warn(`[mpv] could not set ${name} for the ${phase} buffer phase`, error);
        }
      }),
    );
  };

  /** Clears the previous media from the snapshot and subtitles before a new file starts. */
  const resetForLoad = (url: string) => {
    state.expectedMediaPath = url;
    state.mediaRevision += 1;
    subtitles.invalidateSubtitleSelections();
    subtitles.stopSubtitleTranslations();
    state.svpFilterFailed = false;
    const snap = ctx.snap();
    snap.status = "loading";
    snap.errorCode = null;
    snap.errorMessage = null;
    snap.audioTracks = [];
    snap.subtitleTracks = [];
    snap.subText = "";
    snap.subStartSec = 0;
    snap.secondarySubText = "";
    snap.positionSec = 0;
    snap.durationSec = 0;
    snap.bufferedSec = 0;
    snap.buffering = false;
    snap.firstFrameReady = false;
    snap.hdrGamma = "";
    subtitles.resetSubtitlesForLoad();
    ctx.emit();
  };

  /** Swaps the file inside the running mpv; false means the session must be recreated. */
  const reloadInSession = async (
    src: PlayerSource,
    loadId: number,
    nextIsLive: boolean,
    nextStartupProfile: StartupProfile,
    opts: MpvOptions,
  ): Promise<boolean> => {
    try {
      state.suppressEndFileUntil = Date.now() + 1500;
      await invoke("mpv_command", { cmd: ["stop"] });
      subtitles.clearSecondarySid();
      await Promise.all([
        invoke("mpv_set_property", { name: "sid", value: "no" }),
        invoke("mpv_set_property", { name: "secondary-sid", value: "no" }),
      ]);
      if (!nextIsLive) {
        await applyDefaultVodBufferPhase(nextStartupProfile, "startup");
      }
      await applyHeaderProps(src.headers);
      const startAt = typeof src.startAtSec === "number" && src.startAtSec > 0 ? src.startAtSec : 0;
      const cmd: Array<string | number> = ["loadfile", src.url, "replace", 0, `start=${startAt}`];
      await invoke("mpv_command", { cmd });
      subtitles.clearPreparedBefore(loadId);
      state.currentIsLive = nextIsLive;
      state.currentStartupProfile = nextStartupProfile;
      markPlaybackTrace(state.activeTraceId, "loadfile-accepted");
      await invoke("mpv_restore_media_surface");
      await ctx.ensureGeometryTracking(opts);
      void subtitles.addSeedSubtitles(src.subtitles, loadId);
      window.dispatchEvent(new Event("harbor:mpv-refresh-geom"));
      return true;
    } catch (err) {
      console.warn("[mpv] loadfile reload failed, falling back to recreate", err);
      state.mpvStarted = false;
      return false;
    }
  };

  /** Starts a fresh mpv session with the file in its start arguments. */
  const startSession = async (
    src: PlayerSource,
    loadId: number,
    nextIsLive: boolean,
    nextStartupProfile: StartupProfile,
    opts: MpvOptions,
  ) => {
    forgetRetainedMpv();
    ctx.resetAudioFilters();
    await invoke("mpv_start", {
      args: mpvStartArgs(opts, src, ctx.hdrToSdr(), nextStartupProfile),
    });
    subtitles.clearPreparedBefore(loadId);
    markPlaybackTrace(state.activeTraceId, "loadfile-accepted");
    state.mpvStarted = true;
    state.currentIsLive = nextIsLive;
    state.currentStartupProfile = nextStartupProfile;
    void subtitles.addSeedSubtitles(src.subtitles, loadId);
    if (opts.embed) {
      await invoke("mpv_set_property", { name: "sub-visibility", value: false }).catch(() => {});
    }
    await ctx.ensureGeometryTracking(opts);
  };

  async function load(src: PlayerSource) {
    const activeLoadId = ++state.mediaLoadId;
    if (state.activeTraceId && state.activeTraceId !== src.traceId) {
      finishPlaybackTrace(state.activeTraceId, "replaced");
    }
    state.activeTraceId = src.traceId ?? null;
    markPlaybackTrace(state.activeTraceId, "bridge-load");
    await waitForRetainedRelease();
    const nextIsLive = src.isLive === true;
    const nextStartupProfile =
      src.startupProfile ?? state.currentStartupProfile ?? retainedStartupProfile() ?? "standard";
    const reuseConfigKey = mpvReuseConfigKey(mpvOptions, ctx.hdrToSdr());
    const canRetain = isWindowsDesktop() && mpvOptions?.embed === true;
    if (!state.mpvStarted && canRetain && takeRetainedMpv(reuseConfigKey, nextIsLive)) {
      state.mpvStarted = true;
      state.currentIsLive = nextIsLive;
      state.currentStartupProfile = nextStartupProfile;
    } else if (
      state.mpvStarted &&
      state.currentIsLive != null &&
      state.currentIsLive !== nextIsLive
    ) {
      state.mpvStarted = false;
    }
    resetForLoad(src.url);
    try {
      await resetMpvSubtitleFpsForTransition();
    } catch (error) {
      console.warn(
        "[mpv] could not reset subtitle FPS before loading media; recreating the mpv session",
        error,
      );
      markMpvSubtitleFpsSessionRecreated();
      state.mpvStarted = false;
    }
    await ctx.ensureEventListener();
    try {
      const opts = mpvOptions ?? { anime4k: false, hdrToSdr: true };
      if (
        state.mpvStarted &&
        (await reloadInSession(src, activeLoadId, nextIsLive, nextStartupProfile, opts))
      ) {
        return;
      }
      await startSession(src, activeLoadId, nextIsLive, nextStartupProfile, opts);
    } catch (e) {
      finishPlaybackTrace(state.activeTraceId, "failed");
      state.activeTraceId = null;
      const snap = ctx.snap();
      snap.status = "error";
      snap.errorCode = "source";
      snap.errorMessage = e instanceof Error ? e.message : String(e);
      ctx.emit();
    }
  }

  return { load, applyDefaultVodBufferPhase };
}

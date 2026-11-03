import { invoke } from "@tauri-apps/api/core";
import { startGeometryTracking, type GeometryTracker } from "./mpv-geometry";
import { createMpvAudio } from "./mpv-audio";
import { createMpvControls } from "./mpv-controls";
import {
  defaultVodBufferProperties,
  hasCustomBufferPolicy,
  hdrToSdrProperties,
  mpvReuseConfigKey,
  mpvStartArgs,
  type BufferPhase,
  type MpvOptions,
} from "./mpv-config";
import {
  forgetRetainedMpv,
  releaseOrStopMpv,
  retainedStartupProfile,
  takeRetainedMpv,
  waitForRetainedRelease,
} from "./mpv-session";
import { createMpvSubtitles } from "./mpv-subtitles";
import { reduceMpvEvent, type MpvEvent, type MpvEventEffect } from "./mpv-events";
import type { AudioDevice, MpvProbe } from "@/lib/generated/mpv-ipc";
import { isLinuxDesktop, isWindowsDesktop } from "@/lib/platform";
import { makeSafeTauriUnlisten } from "@/lib/tauri-unlisten";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  markMpvSubtitleFpsSessionRecreated,
  resetMpvSubtitleFpsForTransition,
} from "./mpv-properties";
import { finishPlaybackTrace, markPlaybackTrace } from "@/lib/perf/playback-trace";
import {
  initialPlayerSnapshot,
  type PlayerBridge,
  type PlayerSeekPrecision,
  type PlayerSnapshot,
  type PlayerSource,
} from "./bridge";

export type { MpvOptions, MpvRect } from "./mpv-config";

export type { MpvProbe } from "@/lib/generated/mpv-ipc";

let mpvProbePromise: Promise<MpvProbe> | null = null;

export function probeMpv(): Promise<MpvProbe> {
  if (mpvProbePromise) return mpvProbePromise;
  mpvProbePromise = runMpvProbe();
  return mpvProbePromise;
}

async function runMpvProbe(): Promise<MpvProbe> {
  try {
    return await invoke<MpvProbe>("mpv_probe");
  } catch (e) {
    return {
      available: false,
      binary: null,
      version: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type MpvAudioDevice = AudioDevice;

export async function listMpvAudioDevices(): Promise<MpvAudioDevice[]> {
  try {
    return await invoke<MpvAudioDevice[]>("mpv_audio_devices");
  } catch {
    return [];
  }
}

const DEFAULT_UA = "VLC/3.0.20 LibVLC/3.0.20";

async function resetSubtitleFpsBeforeMpvTransition(): Promise<void> {
  await resetMpvSubtitleFpsForTransition();
}

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

export function createMpvBridge(mpvOptions?: MpvOptions): PlayerBridge {
  let host: HTMLElement | null = null;
  let snap: PlayerSnapshot = initialPlayerSnapshot();
  let hdrToSdr = mpvOptions?.hdrToSdr ?? true;
  const audio = createMpvAudio({
    snap: () => snap,
    mpvStarted: () => mpvStarted,
  });
  const { scheduleAudioDeviceReload } = audio;
  const listeners = new Set<(s: PlayerSnapshot) => void>();
  let unlistenEvent: UnlistenFn | null = null;
  let geometry: GeometryTracker | null = null;
  let geometryStarting = false;
  let destroyed = false;
  let mpvStarted = false;
  let currentIsLive: boolean | null = null;
  let currentStartupProfile: "standard" | "high-bitrate" | null = null;
  let mediaLoadId = 0;
  let steadyBufferLoadId = 0;
  let activeTraceId: string | null = null;
  let expectedMediaPath: string | null = null;
  let observedMediaPath: string | null = null;
  let mediaRevision = 0;
  let suppressEndFileUntil = 0;
  let svpFilterFailed = false;
  const subtitles = createMpvSubtitles({
    snap: () => snap,
    mediaRevision: () => mediaRevision,
    mediaLoadId: () => mediaLoadId,
    emit: () => emit(),
  });
  const {
    addSeedSubtitles,
    applySubtitleText,
    applyTrackList,
    clearPreparedBefore,
    clearPreparedSubtitles,
    clearSecondarySid,
    invalidateSubtitleSelections,
    resetSubtitlesForLoad,
    stopSubtitleTranslations,
  } = subtitles;
  let observedPaused: boolean | null = null;
  const applyDefaultVodBufferPhase = async (
    profile: "standard" | "high-bitrate",
    phase: BufferPhase,
  ) => {
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
  const ensureGeometryTracking = async (opts: MpvOptions) => {
    if (!opts.embed || !opts.getEmbedRect || geometry || geometryStarting || isLinuxDesktop())
      return;
    geometryStarting = true;
    try {
      const tracker = await startGeometryTracking(host, opts.getEmbedRect);
      // A tracker that finishes starting after destroy() must not outlive the bridge.
      if (destroyed) tracker.stop();
      else geometry = tracker;
    } finally {
      geometryStarting = false;
    }
  };

  const handleSvpFilterFailure = () => {
    if (svpFilterFailed) return;
    if (!(mpvOptions?.extraOptions ?? "").includes("vapoursynth")) return;
    svpFilterFailed = true;
    invoke("mpv_command", { cmd: ["vf", "remove", "@harbor-svp"] }).catch(() => {});
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("harbor:svp-failed"));
    }
  };

  const emit = () => {
    const next: PlayerSnapshot = { ...snap };
    listeners.forEach((l) => l(next));
  };

  const runEventEffect = (effect: MpvEventEffect) => {
    switch (effect.kind) {
      case "svp-filter-failed":
        handleSvpFilterFailure();
        break;
      case "player-failed":
        mediaRevision += 1;
        invalidateSubtitleSelections();
        stopSubtitleTranslations();
        clearPreparedSubtitles();
        mpvStarted = false;
        finishPlaybackTrace(activeTraceId, "failed");
        activeTraceId = null;
        invoke("mpv_stop").catch(() => {});
        break;
      case "property":
        if (effect.name === "audio-device-list") scheduleAudioDeviceReload();
        if (effect.name === "track-list" && Array.isArray(effect.data)) {
          applyTrackList(effect.data as Array<Record<string, unknown>>);
        }
        applySubtitleText(effect.name, effect.data);
        break;
      case "trace-mark":
        markPlaybackTrace(activeTraceId, effect.mark);
        break;
      case "trace-ready":
        finishPlaybackTrace(activeTraceId, "ready");
        activeTraceId = null;
        break;
      case "steady-buffer":
        void applyDefaultVodBufferPhase(effect.profile, "steady");
        break;
      case "emit":
        emit();
        break;
    }
  };
  const handleEvent = (raw: MpvEvent) => {
    const result = reduceMpvEvent(
      {
        snap,
        observedPaused,
        observedMediaPath,
        expectedMediaPath,
        currentIsLive,
        currentStartupProfile,
        mediaLoadId,
        steadyBufferLoadId,
        suppressEndFileUntil,
      },
      raw,
      Date.now(),
    );
    ({ snap, observedPaused, observedMediaPath, steadyBufferLoadId } = result.state);
    for (const effect of result.effects) runEventEffect(effect);
  };

  const bridge: PlayerBridge = {
    moveEmbeddedSurface: (rect, commit) => geometry?.moveEmbeddedSurface(rect, commit) ?? false,
    attach(h) {
      host = h;
      const embed = mpvOptions?.embed === true;
      const placeholder = document.createElement("div");
      placeholder.style.width = "100%";
      placeholder.style.height = "100%";
      if (embed) {
        placeholder.style.background = "transparent";
      } else {
        placeholder.style.background = "black";
        placeholder.style.display = "flex";
        placeholder.style.alignItems = "center";
        placeholder.style.justifyContent = "center";
        placeholder.style.color = "rgba(255,255,255,0.45)";
        placeholder.style.fontFamily = "Inter, system-ui, sans-serif";
        placeholder.style.fontSize = "13px";
        placeholder.textContent = "mpv plays in its own window. Controls remain here.";
      }
      h.appendChild(placeholder);
    },
    detach() {
      stopSubtitleTranslations();
      if (host) {
        while (host.firstChild) host.removeChild(host.firstChild);
      }
      host = null;
    },
    async load(src: PlayerSource) {
      const activeLoadId = ++mediaLoadId;
      if (activeTraceId && activeTraceId !== src.traceId) {
        finishPlaybackTrace(activeTraceId, "replaced");
      }
      activeTraceId = src.traceId ?? null;
      markPlaybackTrace(activeTraceId, "bridge-load");
      await waitForRetainedRelease();
      const nextIsLive = src.isLive === true;
      const nextStartupProfile =
        src.startupProfile ?? currentStartupProfile ?? retainedStartupProfile() ?? "standard";
      const reuseConfigKey = mpvReuseConfigKey(mpvOptions, hdrToSdr);
      const canRetain = isWindowsDesktop() && mpvOptions?.embed === true;
      if (!mpvStarted && canRetain && takeRetainedMpv(reuseConfigKey, nextIsLive)) {
        mpvStarted = true;
        currentIsLive = nextIsLive;
        currentStartupProfile = nextStartupProfile;
      } else if (mpvStarted && currentIsLive != null && currentIsLive !== nextIsLive) {
        mpvStarted = false;
      }
      expectedMediaPath = src.url;
      mediaRevision += 1;
      invalidateSubtitleSelections();
      stopSubtitleTranslations();
      svpFilterFailed = false;
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
      resetSubtitlesForLoad();
      emit();
      try {
        await resetSubtitleFpsBeforeMpvTransition();
      } catch (error) {
        console.warn(
          "[mpv] could not reset subtitle FPS before loading media; recreating the mpv session",
          error,
        );
        markMpvSubtitleFpsSessionRecreated();
        mpvStarted = false;
      }
      if (!unlistenEvent) {
        unlistenEvent = makeSafeTauriUnlisten(
          await listen<MpvEvent>("mpv://event", (ev) => handleEvent(ev.payload)),
        );
      }
      try {
        const opts = mpvOptions ?? { anime4k: false, hdrToSdr: true };
        if (mpvStarted) {
          try {
            suppressEndFileUntil = Date.now() + 1500;
            await invoke("mpv_command", { cmd: ["stop"] });
            clearSecondarySid();
            await Promise.all([
              invoke("mpv_set_property", { name: "sid", value: "no" }),
              invoke("mpv_set_property", { name: "secondary-sid", value: "no" }),
            ]);
            if (!nextIsLive) {
              await applyDefaultVodBufferPhase(nextStartupProfile, "startup");
            }
            await applyHeaderProps(src.headers);
            const startAt =
              typeof src.startAtSec === "number" && src.startAtSec > 0 ? src.startAtSec : 0;
            const cmd: Array<string | number> = [
              "loadfile",
              src.url,
              "replace",
              0,
              `start=${startAt}`,
            ];
            await invoke("mpv_command", { cmd });
            clearPreparedBefore(activeLoadId);
            currentIsLive = nextIsLive;
            currentStartupProfile = nextStartupProfile;
            markPlaybackTrace(activeTraceId, "loadfile-accepted");
            await invoke("mpv_restore_media_surface");
            await ensureGeometryTracking(opts);
            void addSeedSubtitles(src.subtitles, activeLoadId);
            window.dispatchEvent(new Event("harbor:mpv-refresh-geom"));
            return;
          } catch (err) {
            console.warn("[mpv] loadfile reload failed, falling back to recreate", err);
            mpvStarted = false;
          }
        }
        forgetRetainedMpv();
        audio.resetAppliedFilters();
        await invoke("mpv_start", {
          args: mpvStartArgs(opts, src, hdrToSdr, nextStartupProfile),
        });
        clearPreparedBefore(activeLoadId);
        markPlaybackTrace(activeTraceId, "loadfile-accepted");
        mpvStarted = true;
        currentIsLive = nextIsLive;
        currentStartupProfile = nextStartupProfile;
        void addSeedSubtitles(src.subtitles, activeLoadId);
        if (opts.embed) {
          await invoke("mpv_set_property", { name: "sub-visibility", value: false }).catch(
            () => {},
          );
        }
        await ensureGeometryTracking(opts);
      } catch (e) {
        finishPlaybackTrace(activeTraceId, "failed");
        activeTraceId = null;
        snap.status = "error";
        snap.errorCode = "source";
        snap.errorMessage = e instanceof Error ? e.message : String(e);
        emit();
      }
    },
    ...createMpvControls(),
    seek(sec, precision: PlayerSeekPrecision = "exact") {
      snap.subText = "";
      snap.subStartSec = 0;
      snap.secondarySubText = "";
      emit();
      const flags = precision === "keyframes" ? "absolute+keyframes" : "absolute+exact";
      invoke("mpv_command", { cmd: ["seek", sec, flags] }).catch(() => {});
    },
    setVolume(v) {
      snap.volume = v;
      if (v > 0) snap.muted = false;
      emit();
      invoke("mpv_set_property", { name: "volume", value: Math.round(v * 100) }).catch(() => {});
    },
    setMuted(m) {
      snap.muted = m;
      emit();
      invoke("mpv_set_property", { name: "mute", value: m }).catch(() => {});
    },
    setRate(r) {
      snap.rate = r;
      emit();
      invoke("mpv_set_property", { name: "speed", value: r }).catch(() => {});
    },
    ...subtitles.bridgeMethods,
    setAudioNormalize(on) {
      snap.audioNormalize = on;
      audio.applyAudioFilters();
      emit();
    },
    setAudioProfile(profile) {
      audio.setAudioProfile(profile);
    },
    setHdrToSdr(on, oled) {
      hdrToSdr = on;
      const properties = hdrToSdrProperties(on, oled);
      for (const [name, value] of properties) {
        void invoke("mpv_set_property", { name, value }).catch(() => {});
      }
    },
    setAudioDevice(name) {
      audio.setAudioDevice(name);
    },
    subscribe(l) {
      listeners.add(l);
      l({ ...snap });
      return () => {
        listeners.delete(l);
      };
    },
    destroy() {
      destroyed = true;
      geometry?.stop();
      geometry = null;
      mediaRevision += 1;
      invalidateSubtitleSelections();
      stopSubtitleTranslations();
      clearPreparedSubtitles();
      finishPlaybackTrace(activeTraceId, "aborted");
      activeTraceId = null;
      const keepNativeSession =
        mpvStarted && currentIsLive != null && isWindowsDesktop() && mpvOptions?.embed === true;
      releaseOrStopMpv(
        keepNativeSession
          ? {
              configKey: mpvReuseConfigKey(mpvOptions, hdrToSdr),
              isLive: currentIsLive!,
              startupProfile: currentStartupProfile ?? "standard",
            }
          : null,
      );
      audio.stop();
      mpvStarted = false;
      currentIsLive = null;
      currentStartupProfile = null;
      if (unlistenEvent) {
        unlistenEvent();
        unlistenEvent = null;
      }
      if (host) {
        while (host.firstChild) host.removeChild(host.firstChild);
      }
      host = null;
      listeners.clear();
    },
  };
  return bridge;
}

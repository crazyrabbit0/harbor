import { invoke } from "@tauri-apps/api/core";
import { startGeometryTracking, type GeometryTracker } from "./mpv-geometry";
import { createMpvAudio } from "./mpv-audio";
import { createMpvControls } from "./mpv-controls";
import { hdrToSdrProperties, mpvReuseConfigKey, type MpvOptions } from "./mpv-config";
import { createMpvLoad, type MpvLoadState } from "./mpv-load";
import { releaseOrStopMpv } from "./mpv-session";
import { createMpvSubtitles } from "./mpv-subtitles";
import { reduceMpvEvent, type MpvEvent, type MpvEventEffect } from "./mpv-events";
import type { AudioDevice, MpvProbe } from "@/lib/generated/mpv-ipc";
import { isLinuxDesktop, isWindowsDesktop } from "@/lib/platform";
import { makeSafeTauriUnlisten } from "@/lib/tauri-unlisten";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { finishPlaybackTrace, markPlaybackTrace } from "@/lib/perf/playback-trace";
import {
  initialPlayerSnapshot,
  type PlayerBridge,
  type PlayerSeekPrecision,
  type PlayerSnapshot,
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

export function createMpvBridge(mpvOptions?: MpvOptions): PlayerBridge {
  let host: HTMLElement | null = null;
  let snap: PlayerSnapshot = initialPlayerSnapshot();
  let hdrToSdr = mpvOptions?.hdrToSdr ?? true;
  const audio = createMpvAudio({
    snap: () => snap,
    mpvStarted: () => state.mpvStarted,
  });
  const { scheduleAudioDeviceReload } = audio;
  const listeners = new Set<(s: PlayerSnapshot) => void>();
  let unlistenEvent: UnlistenFn | null = null;
  let geometry: GeometryTracker | null = null;
  let geometryStarting = false;
  let destroyed = false;
  const state: MpvLoadState = {
    mpvStarted: false,
    currentIsLive: null,
    currentStartupProfile: null,
    mediaLoadId: 0,
    activeTraceId: null,
    expectedMediaPath: null,
    mediaRevision: 0,
    suppressEndFileUntil: 0,
    svpFilterFailed: false,
  };
  let steadyBufferLoadId = 0;
  let observedMediaPath: string | null = null;
  const subtitles = createMpvSubtitles({
    snap: () => snap,
    mediaRevision: () => state.mediaRevision,
    mediaLoadId: () => state.mediaLoadId,
    emit: () => emit(),
  });
  const {
    applySubtitleText,
    applyTrackList,
    clearPreparedSubtitles,
    invalidateSubtitleSelections,
    stopSubtitleTranslations,
  } = subtitles;
  let observedPaused: boolean | null = null;
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
    if (state.svpFilterFailed) return;
    if (!(mpvOptions?.extraOptions ?? "").includes("vapoursynth")) return;
    state.svpFilterFailed = true;
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
        state.mediaRevision += 1;
        invalidateSubtitleSelections();
        stopSubtitleTranslations();
        clearPreparedSubtitles();
        state.mpvStarted = false;
        finishPlaybackTrace(state.activeTraceId, "failed");
        state.activeTraceId = null;
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
        markPlaybackTrace(state.activeTraceId, effect.mark);
        break;
      case "trace-ready":
        finishPlaybackTrace(state.activeTraceId, "ready");
        state.activeTraceId = null;
        break;
      case "steady-buffer":
        void loader.applyDefaultVodBufferPhase(effect.profile, "steady");
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
        expectedMediaPath: state.expectedMediaPath,
        currentIsLive: state.currentIsLive,
        currentStartupProfile: state.currentStartupProfile,
        mediaLoadId: state.mediaLoadId,
        steadyBufferLoadId,
        suppressEndFileUntil: state.suppressEndFileUntil,
      },
      raw,
      Date.now(),
    );
    ({ snap, observedPaused, observedMediaPath, steadyBufferLoadId } = result.state);
    for (const effect of result.effects) runEventEffect(effect);
  };

  const loader = createMpvLoad({
    state,
    options: mpvOptions,
    snap: () => snap,
    hdrToSdr: () => hdrToSdr,
    emit: () => emit(),
    ensureEventListener: async () => {
      if (unlistenEvent) return;
      unlistenEvent = makeSafeTauriUnlisten(
        await listen<MpvEvent>("mpv://event", (ev) => handleEvent(ev.payload)),
      );
    },
    ensureGeometryTracking,
    resetAudioFilters: () => audio.resetAppliedFilters(),
    subtitles,
  });

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
    load: loader.load,
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
      state.mediaRevision += 1;
      invalidateSubtitleSelections();
      stopSubtitleTranslations();
      clearPreparedSubtitles();
      finishPlaybackTrace(state.activeTraceId, "aborted");
      state.activeTraceId = null;
      const keepNativeSession =
        state.mpvStarted &&
        state.currentIsLive != null &&
        isWindowsDesktop() &&
        mpvOptions?.embed === true;
      releaseOrStopMpv(
        keepNativeSession
          ? {
              configKey: mpvReuseConfigKey(mpvOptions, hdrToSdr),
              isLive: state.currentIsLive!,
              startupProfile: state.currentStartupProfile ?? "standard",
            }
          : null,
      );
      audio.stop();
      state.mpvStarted = false;
      state.currentIsLive = null;
      state.currentStartupProfile = null;
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

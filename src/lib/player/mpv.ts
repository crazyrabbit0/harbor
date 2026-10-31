import { invoke } from "@tauri-apps/api/core";
import { mpvFailureSnapshot } from "./mpv-failure";
import { startGeometryTracking, type GeometryTracker } from "./mpv-geometry";
import { createMpvAudio } from "./mpv-audio";
import {
  defaultVodBufferProperties,
  hasCustomBufferPolicy,
  hdrToSdrProperties,
  mpvReuseConfigKey,
  mpvStartArgs,
  type BufferPhase,
  type MpvOptions,
} from "./mpv-config";
import { createMpvSubtitles } from "./mpv-subtitles";
import { applyMpvProperty } from "./mpv-tracks";
import { isLinuxDesktop, isWindowsDesktop } from "@/lib/platform";
import { makeSafeTauriUnlisten } from "@/lib/tauri-unlisten";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  invalidateMpvSubtitleFpsContext,
  markMpvSubtitleFpsSessionRecreated,
  resetMpvSubtitleFpsForTransition,
} from "./mpv-properties";
import { finishPlaybackTrace, markPlaybackTrace } from "@/lib/perf/playback-trace";
import {
  initialPlayerSnapshot,
  type PlayerBridge,
  type PlayerCapabilities,
  type PlayerSeekPrecision,
  type PlayerSnapshot,
  type PlayerSource,
} from "./bridge";

export type { MpvOptions, MpvRect } from "./mpv-config";

export type MpvProbe = {
  available: boolean;
  binary: string | null;
  version: string | null;
  error: string | null;
};

let mpvProbePromise: Promise<MpvProbe> | null = null;

type RetainedMpv = {
  configKey: string;
  isLive: boolean;
  startupProfile: "standard" | "high-bitrate";
};
let retainedMpv: RetainedMpv | null = null;
let retainedMpvRelease: Promise<void> | null = null;

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

export type MpvAudioDevice = { name: string; description: string };

export async function listMpvAudioDevices(): Promise<MpvAudioDevice[]> {
  try {
    return await invoke<MpvAudioDevice[]>("mpv_audio_devices");
  } catch {
    return [];
  }
}

type MpvEvent =
  | {
      event: "property-change";
      id?: number;
      name: string;
      data: unknown;
    }
  | { event: "end-file"; reason?: string }
  | { event: "playback-restart" }
  | { event: "file-loaded" }
  | { event: string; [k: string]: unknown };

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

function normalizeMediaPath(path: string): string {
  return path.replace(/\\/g, "/");
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

  const handleEvent = (raw: MpvEvent) => {
    if (raw.event === "log") {
      const prefix = String((raw as { prefix?: unknown }).prefix ?? "");
      const level = String((raw as { level?: unknown }).level ?? "");
      const text = String((raw as { text?: unknown }).text ?? "");
      if (
        text.includes("Creating filter 'vapoursynth' failed") ||
        (prefix.includes("vapoursynth") && (level === "fatal" || level === "error"))
      ) {
        handleSvpFilterFailure();
      }
      return;
    }
    if (raw.event === "player-failure") {
      const reason = String((raw as { reason?: unknown }).reason ?? "");
      snap = mpvFailureSnapshot(snap, reason);
      mediaRevision += 1;
      invalidateSubtitleSelections();
      stopSubtitleTranslations();
      clearPreparedSubtitles();
      mpvStarted = false;
      finishPlaybackTrace(activeTraceId, "failed");
      activeTraceId = null;
      invoke("mpv_stop").catch(() => {});
      emit();
    } else if (raw.event === "property-change") {
      const name = raw.name;
      const data = raw.data;
      applyMpvProperty(snap, String(name), data);
      if (name === "path" && typeof data === "string") observedMediaPath = data;
      if (name === "pause" && typeof data === "boolean") {
        observedPaused = data;
        snap.status = data ? "paused" : "playing";
      }
      if (name === "audio-device-list") scheduleAudioDeviceReload();
      if (name === "track-list" && Array.isArray(data)) {
        applyTrackList(data as Array<Record<string, unknown>>);
      }
      applySubtitleText(String(name), data);
      emit();
    } else if (raw.event === "end-file") {
      const reason = (raw as { reason?: string }).reason?.toLowerCase();
      if (reason === "stop" || reason === "quit" || reason === "redirect") return;
      if (Date.now() < suppressEndFileUntil) return;
      if (reason && reason !== "eof") {
        snap.status = "error";
        snap.errorCode = "decode";
        snap.errorMessage = `mpv ended playback: ${reason}`;
      } else {
        snap.status = "ended";
      }
      emit();
    } else if (raw.event === "file-loaded") {
      markPlaybackTrace(activeTraceId, "file-loaded");
      snap.status = observedPaused === true ? "paused" : "playing";
      snap.errorCode = null;
      snap.errorMessage = null;
      emit();
    } else if (raw.event === "playback-restart") {
      if (
        expectedMediaPath &&
        observedMediaPath &&
        normalizeMediaPath(expectedMediaPath) !== normalizeMediaPath(observedMediaPath)
      ) {
        return;
      }
      snap.status = observedPaused === true ? "paused" : "playing";
      snap.buffering = false; // Playback recovered, including when the user remains paused.
      snap.firstFrameReady = true;
      if (currentIsLive === false && currentStartupProfile && steadyBufferLoadId !== mediaLoadId) {
        steadyBufferLoadId = mediaLoadId;
        const profile = currentStartupProfile;
        void applyDefaultVodBufferPhase(profile, "steady");
      }
      markPlaybackTrace(activeTraceId, "first-frame");
      finishPlaybackTrace(activeTraceId, "ready");
      activeTraceId = null;
      snap.errorCode = null;
      snap.errorMessage = null;
      emit();
    }
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
      if (retainedMpvRelease) await retainedMpvRelease;
      const nextIsLive = src.isLive === true;
      const nextStartupProfile =
        src.startupProfile ?? currentStartupProfile ?? retainedMpv?.startupProfile ?? "standard";
      const reuseConfigKey = mpvReuseConfigKey(mpvOptions, hdrToSdr);
      const canRetain = isWindowsDesktop() && mpvOptions?.embed === true;
      if (
        !mpvStarted &&
        canRetain &&
        retainedMpv?.configKey === reuseConfigKey &&
        retainedMpv.isLive === nextIsLive
      ) {
        mpvStarted = true;
        currentIsLive = nextIsLive;
        currentStartupProfile = nextStartupProfile;
        retainedMpv = null;
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
        retainedMpv = null;
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
    async play() {
      await invoke("mpv_set_property", { name: "pause", value: false }).catch(() => {});
    },
    pause() {
      invoke("mpv_set_property", { name: "pause", value: true }).catch(() => {});
    },
    seek(sec, precision: PlayerSeekPrecision = "exact") {
      snap.subText = "";
      snap.subStartSec = 0;
      snap.secondarySubText = "";
      emit();
      const flags = precision === "keyframes" ? "absolute+keyframes" : "absolute+exact";
      invoke("mpv_command", { cmd: ["seek", sec, flags] }).catch(() => {});
    },
    frameStep(dir) {
      invoke("mpv_command", { cmd: [dir > 0 ? "frame-step" : "frame-back-step"] }).catch(() => {});
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
    setAudioTrack(id) {
      invoke("mpv_set_property", { name: "aid", value: Number(id) || id }).catch(() => {});
    },
    ...subtitles.bridgeMethods,
    setSubVisible(on) {
      invoke("mpv_set_property", { name: "sub-visibility", value: on }).catch(() => {});
    },
    setSubDelay(sec) {
      invoke("mpv_set_property", { name: "sub-delay", value: sec }).catch(() => {});
    },
    setAudioDelay(sec) {
      invoke("mpv_set_property", { name: "audio-delay", value: sec }).catch(() => {});
    },
    setPanscan(value) {
      const v = Math.max(0, Math.min(1, value));
      invoke("mpv_set_property", { name: "panscan", value: v }).catch(() => {});
    },
    setVideoZoom(log2) {
      invoke("mpv_set_property", { name: "video-zoom", value: log2 }).catch(() => {});
    },
    setAspectOverride(ratio) {
      invoke("mpv_set_property", { name: "video-aspect-override", value: ratio }).catch(() => {});
    },
    setStretch(on) {
      invoke("mpv_set_property", { name: "keepaspect", value: !on }).catch(() => {});
    },
    setVideoEq(name, value) {
      invoke("mpv_set_property", { name, value }).catch(() => {});
    },
    setAnime4kShaders(shaders) {
      const sep = isWindowsDesktop() ? ";" : ":";
      const value = shaders
        .filter(Boolean)
        .map((s) => s.replace(/\\/g, "/"))
        .join(sep);
      invoke("mpv_set_property", { name: "glsl-shaders", value }).catch((e) =>
        console.warn("[shaders] glsl-shaders apply failed", e),
      );
    },
    setShaderProps(props) {
      for (const [name, value] of Object.entries(props)) {
        invoke("mpv_set_property", { name, value }).catch((e) =>
          console.warn("[shaders] companion prop failed", name, e),
        );
      }
    },
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
    setMediaInfo(info) {
      invoke("mpv_set_property", { name: "force-media-title", value: info.title }).catch(() => {});
    },
    async screenshot(path) {
      try {
        const out = await invoke<string>("mpv_save_screenshot", { path });
        return { ok: true, path: out };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    setAbLoop(a, b) {
      invoke("mpv_set_property", { name: "ab-loop-a", value: a == null ? "no" : a }).catch(
        () => {},
      );
      invoke("mpv_set_property", { name: "ab-loop-b", value: b == null ? "no" : b }).catch(
        () => {},
      );
    },
    async requestPiP() {},
    async exitPiP() {},
    async requestFullscreen() {
      await invoke("mpv_set_property", { name: "fullscreen", value: true }).catch(() => {});
    },
    async exitFullscreen() {
      await invoke("mpv_set_property", { name: "fullscreen", value: false }).catch(() => {});
    },
    capabilities(): PlayerCapabilities {
      return {
        engine: "mpv",
        pictureInPicture: true,
        airplay: false,
        chromecast: true,
        hdrPassthrough: false,
        hardwareDecode: true,
      };
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
      if (keepNativeSession) {
        invalidateMpvSubtitleFpsContext();
        const retained: RetainedMpv = {
          configKey: mpvReuseConfigKey(mpvOptions, hdrToSdr),
          isLive: currentIsLive!,
          startupProfile: currentStartupProfile ?? "standard",
        };
        const release = invoke<boolean>("mpv_release_media")
          .then(async (kept) => {
            if (kept) {
              retainedMpv = retained;
              return;
            }
            retainedMpv = null;
            markMpvSubtitleFpsSessionRecreated();
            await invoke("mpv_stop").catch(() => {});
          })
          .catch(async () => {
            retainedMpv = null;
            markMpvSubtitleFpsSessionRecreated();
            await invoke("mpv_stop").catch(() => {});
          });
        retainedMpvRelease = release;
        void release.finally(() => {
          if (retainedMpvRelease === release) retainedMpvRelease = null;
        });
      } else {
        retainedMpv = null;
        markMpvSubtitleFpsSessionRecreated();
        invoke("mpv_stop").catch(() => {});
      }
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

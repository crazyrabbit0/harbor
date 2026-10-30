import { invoke } from "@tauri-apps/api/core";
import { mpvFailureSnapshot } from "./mpv-failure";
import { startGeometryTracking, type GeometryTracker } from "./mpv-geometry";
import { createMpvSubtitles } from "./mpv-subtitles";
import { applyMpvProperty } from "./mpv-tracks";
import { isLinuxDesktop, isMacDesktop, isWindowsDesktop } from "@/lib/platform";
import type { MonitorInfo } from "@/lib/monitors";
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
  type PlayerEmbedRect,
  type PlayerCapabilities,
  type PlayerSeekPrecision,
  type PlayerSnapshot,
  type PlayerSource,
} from "./bridge";

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

export type MpvRect = PlayerEmbedRect;

export type MpvOptions = {
  anime4k: boolean;
  hdrToSdr: boolean;
  rtxHdr?: boolean;
  rtxVsr?: boolean;
  embed?: boolean;
  anime4kShaders?: string[];
  d3d11Flip?: boolean;
  macEdr?: boolean;
  renderer?: "gpu-next" | "gpu";
  forceYuv420p?: boolean;
  extraOptions?: string;
  fullDownload?: boolean;
  separateDisplay?: MonitorInfo | null;
  separateCoverTaskbar?: boolean;
  cacheDir?: string;
  getEmbedRect?: () => Promise<MpvRect | null> | MpvRect | null;
};

const mpvCacheDir = (options: MpvOptions | undefined): string | null =>
  options?.cacheDir?.trim() || null;

function mpvReuseConfigKey(options: MpvOptions | undefined, hdrToSdr: boolean): string {
  return JSON.stringify({
    anime4k: options?.anime4k === true,
    hdrToSdr,
    rtxHdr: options?.rtxHdr === true,
    rtxVsr: options?.rtxVsr === true,
    embed: options?.embed === true,
    anime4kShaders: options?.anime4kShaders ?? [],
    d3d11Flip: options?.d3d11Flip === true,
    macEdr: options?.macEdr === true,
    renderer: options?.renderer ?? "gpu-next",
    forceYuv420p: options?.forceYuv420p === true,
    extraOptions: options?.extraOptions ?? "",
    fullDownload: options?.fullDownload === true,
    cacheDir: mpvCacheDir(options),
  });
}

const AUDIO_PROFILE_AF: Record<string, string> = {
  bass: "lavfi=[bass=g=7:f=110:w=0.6]",
  voice: "lavfi=[equalizer=f=300:t=q:w=1:g=-3,equalizer=f=2800:t=q:w=1:g=5]",
  "bass-reduce": "lavfi=[bass=g=-8:f=110:w=0.6]",
  night: "lavfi=[acompressor=ratio=3:threshold=-20dB:attack=20:release=300:makeup=4dB]",
};

const DEFAULT_UA = "VLC/3.0.20 LibVLC/3.0.20";

type BufferPhase = "startup" | "steady";

function hasCustomBufferPolicy(extraOptions: string | undefined): boolean {
  return /(?:^|\n)\s*(?:cache(?:-[\w-]+)?|demuxer-(?:max|readahead)[\w-]*|stream-buffer-size)\s*=/im.test(
    extraOptions ?? "",
  );
}

function defaultVodBufferProperties(
  profile: "standard" | "high-bitrate",
  phase: BufferPhase,
): Array<[string, string]> {
  const highBitrate = profile === "high-bitrate";
  if (phase === "startup") {
    return [
      ["cache-secs", highBitrate ? "45" : "30"],
      ["cache-pause-wait", highBitrate ? "2" : "1"],
      ["demuxer-max-bytes", highBitrate ? "256MiB" : "128MiB"],
      ["demuxer-max-back-bytes", highBitrate ? "64MiB" : "32MiB"],
      ["demuxer-readahead-secs", highBitrate ? "45" : "30"],
      ["stream-buffer-size", highBitrate ? "32MiB" : "16MiB"],
    ];
  }
  return [
    ["cache-secs", "300"],
    ["cache-pause-wait", highBitrate ? "2" : "1"],
    ["demuxer-max-bytes", highBitrate ? "768MiB" : "512MiB"],
    ["demuxer-max-back-bytes", "64MiB"],
    ["demuxer-readahead-secs", "300"],
    ["stream-buffer-size", highBitrate ? "64MiB" : "32MiB"],
  ];
}

async function resetSubtitleFpsBeforeMpvTransition(): Promise<void> {
  await resetMpvSubtitleFpsForTransition();
}

// Module-level on purpose: Rust runs one mpv instance, so every bridge shares its audio device.
let appliedAudioDevice: string | null = null;

async function applyAudioDevice(want: string): Promise<void> {
  let target = want;
  if (target !== "auto") {
    try {
      const devices = await invoke<Array<{ name: string }>>("mpv_audio_devices");
      if (devices.length > 0 && !devices.some((d) => d.name === target)) {
        console.warn(`[audio] device "${target}" is no longer present, falling back to auto`);
        target = "auto";
        appliedAudioDevice = "auto";
      }
    } catch {
      /* device list unavailable, try the stored value anyway */
    }
  }
  try {
    await invoke("mpv_set_property", { name: "audio-device", value: target });
  } catch (e) {
    if (target === "auto") return;
    console.warn(`[audio] could not select "${target}", falling back to auto`, e);
    appliedAudioDevice = "auto";
    await invoke("mpv_set_property", { name: "audio-device", value: "auto" }).catch(() => {});
  }
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
  let profileAf = "";
  let hdrToSdr = mpvOptions?.hdrToSdr ?? true;
  let appliedAf: string | null = null;
  const applyAudioFilters = () => {
    const parts: string[] = [];
    // Frame length × window size sets the look-ahead audio waits on at every start and seek; 250 ms × 15 is ~4× shorter than 500 × 31.
    if (snap.audioNormalize) parts.push("dynaudnorm=f=250:g=15:p=0.9:m=4:b=1");
    if (profileAf) parts.push(profileAf);
    if (parts.length > 0) parts.push("lavfi=[alimiter=limit=0.97]");
    const chain = parts.join(",");
    // Every `af set` rebuilds the chain and refills dynaudnorm's look-ahead, holding audio (and so playback) for seconds.
    if (chain === appliedAf) return;
    appliedAf = chain;
    invoke("mpv_command", { cmd: ["af", "set", chain] }).catch(() => {
      if (appliedAf === chain) appliedAf = null;
    });
  };
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

  // mpv's WASAPI output re-roots to the OS default audio device via its own
  // hotplug notification. For device-topology changes (e.g. HDMI <-> Bluetooth,
  // which differ in sample rate and format) that internal reload is unreliable
  // and can leave audio routed to a now-unavailable endpoint, producing silence
  // until the stream is restarted. When `audio-device-list` changes (mpv fires
  // a property-change on every hotplug / default-device switch) we re-assert the
  // device and force an `ao-reload`, which re-initializes the audio output onto
  // the current default device — the same re-init a stream restart performs.
  //
  // After screensaver / system sleep, Windows can release the WASAPI endpoint
  // without firing a hotplug event, leaving mpv with a stale device ID.  The
  // `visibilitychange` listener below catches that case: when the app becomes
  // visible again we schedule the same device re-assertion + ao-reload and
  // re-select whichever audio track was active before the failure.
  let audioDeviceReloadTimer: number | null = null;
  const scheduleAudioDeviceReload = () => {
    if (!isWindowsDesktop()) return;
    if (!mpvStarted) return;
    if (snap.status !== "playing" && snap.status !== "paused") return;
    if (audioDeviceReloadTimer != null) window.clearTimeout(audioDeviceReloadTimer);
    audioDeviceReloadTimer = window.setTimeout(() => {
      audioDeviceReloadTimer = null;
      void (async () => {
        // Remember the selected audio track so we can restore it after the
        // output reload deselects it (mpv drops the track on ao init failure).
        const prevAid = snap.audioTracks.find((t) => t.selected)?.id ?? null;
        await applyAudioDevice(appliedAudioDevice ?? "auto").catch(() => {});
        await invoke("mpv_command", { cmd: ["ao-reload"] }).catch(() => {});
        if (prevAid) {
          await invoke("mpv_set_property", { name: "aid", value: prevAid }).catch(() => {});
        }
        // dynaudnorm's look-ahead restarts audio ahead of video after a reload; an exact seek in place refills it.
        if (snap.audioNormalize) {
          await invoke("mpv_command", { cmd: ["seek", 0, "relative+exact"] }).catch(() => {});
        }
      })();
    }, 300);
  };

  // After screensaver / system sleep Windows may silently release the WASAPI
  // audio endpoint without firing a device-list hotplug event.  When the app
  // becomes visible again we schedule an audio output reload so mpv re-binds
  // to the current default device and restores audio.
  const onVisibilityRestore = () => {
    if (document.visibilityState !== "visible") return;
    scheduleAudioDeviceReload();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityRestore);
  }

  // A Windows screensaver paints over the window without hiding the document,
  // so `visibilitychange` never fires for it. Dismissing the screensaver does
  // return activation to the app window, so a refocus after a long absence is
  // the wake signal here. The absence gate keeps ordinary alt-tab returns
  // from paying for an `ao-reload` they don't need.
  const FOCUS_RELOAD_MIN_ABSENT_MS = 60_000;
  let lastWindowBlur = Date.now();
  const onWindowBlur = () => {
    lastWindowBlur = Date.now();
  };
  const onWindowFocusRestore = () => {
    if (Date.now() - lastWindowBlur < FOCUS_RELOAD_MIN_ABSENT_MS) return;
    scheduleAudioDeviceReload();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocusRestore);
  }

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
        appliedAf = null;
        await invoke("mpv_start", {
          args: {
            url: src.url,
            startAtSec: src.startAtSec ?? null,
            subtitles: [],
            anime4k: opts.anime4k,
            hdrToSdr,
            rtxHdr: opts.rtxHdr === true,
            rtxVsr: opts.rtxVsr === true,
            embed: opts.embed === true,
            anime4kShaders: opts.anime4kShaders ?? [],
            d3d11Flip: opts.d3d11Flip === true,
            macEdr: opts.macEdr === true,
            isLive: src.isLive === true,
            fullDownload: opts.fullDownload === true,
            cacheDir: mpvCacheDir(opts),
            startupProfile: nextStartupProfile,
            headers: src.headers ?? null,
            renderer: opts.renderer ?? "gpu-next",
            forceYuv420p: opts.forceYuv420p === true,
            extraOptions: opts.extraOptions || undefined,
            separateDisplay: opts.embed === true ? null : (opts.separateDisplay ?? null),
            separateCoverTaskbar: opts.separateCoverTaskbar ?? true,
          },
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
      applyAudioFilters();
      emit();
    },
    setAudioProfile(profile) {
      profileAf = AUDIO_PROFILE_AF[profile] ?? "";
      applyAudioFilters();
    },
    setHdrToSdr(on, oled) {
      hdrToSdr = on;
      const properties: Array<[string, string]> = on
        ? [
            ["tone-mapping", "spline"],
            ["gamut-mapping-mode", "perceptual"],
            ["hdr-compute-peak", "yes"],
            ["hdr-contrast-recovery", "0.30"],
            ["hdr-peak-percentile", "99.995"],
            ["dither-depth", "auto"],
            ["target-trc", "bt.1886"],
            ["target-prim", "bt.709"],
            ["target-contrast", oled ? "inf" : "auto"],
          ]
        : [
            ["tone-mapping", "auto"],
            ["gamut-mapping-mode", "auto"],
            ["hdr-compute-peak", "auto"],
            ["hdr-contrast-recovery", "0"],
            ["hdr-peak-percentile", "0"],
            ["dither-depth", "auto"],
            ["target-trc", "auto"],
            ["target-prim", "auto"],
            ["target-contrast", "auto"],
          ];
      if (isWindowsDesktop() || isMacDesktop()) {
        properties.push(["target-colorspace-hint", "yes"]);
      }
      for (const [name, value] of properties) {
        void invoke("mpv_set_property", { name, value }).catch(() => {});
      }
    },
    setAudioDevice(name) {
      const want = name && name !== "auto" ? name : "auto";
      if (want === appliedAudioDevice) return;
      appliedAudioDevice = want;
      void applyAudioDevice(want);
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
      document.removeEventListener("visibilitychange", onVisibilityRestore);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocusRestore);
      if (audioDeviceReloadTimer != null) {
        window.clearTimeout(audioDeviceReloadTimer);
        audioDeviceReloadTimer = null;
      }
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

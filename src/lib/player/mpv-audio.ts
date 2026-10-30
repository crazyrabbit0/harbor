import { invoke } from "@tauri-apps/api/core";
import { isWindowsDesktop } from "@/lib/platform";
import type { PlayerSnapshot } from "./bridge";

const AUDIO_PROFILE_AF: Record<string, string> = {
  bass: "lavfi=[bass=g=7:f=110:w=0.6]",
  voice: "lavfi=[equalizer=f=300:t=q:w=1:g=-3,equalizer=f=2800:t=q:w=1:g=5]",
  "bass-reduce": "lavfi=[bass=g=-8:f=110:w=0.6]",
  night: "lavfi=[acompressor=ratio=3:threshold=-20dB:attack=20:release=300:makeup=4dB]",
};

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

export type MpvAudioContext = {
  snap: () => PlayerSnapshot;
  mpvStarted: () => boolean;
};

// Owns one bridge's audio filter chain and the Windows output reloads after device changes, sleep and screensaver.
export function createMpvAudio(ctx: MpvAudioContext) {
  const { snap, mpvStarted } = ctx;
  let profileAf = "";
  let appliedAf: string | null = null;
  const applyAudioFilters = () => {
    const parts: string[] = [];
    // Frame length × window size sets the look-ahead audio waits on at every start and seek; 250 ms × 15 is ~4× shorter than 500 × 31.
    if (snap().audioNormalize) parts.push("dynaudnorm=f=250:g=15:p=0.9:m=4:b=1");
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

  // mpv's own WASAPI re-root is unreliable across HDMI/Bluetooth switches; see src/AGENTS.md (Player and streams).
  let audioDeviceReloadTimer: number | null = null;
  const scheduleAudioDeviceReload = () => {
    if (!isWindowsDesktop()) return;
    if (!mpvStarted()) return;
    if (snap().status !== "playing" && snap().status !== "paused") return;
    if (audioDeviceReloadTimer != null) window.clearTimeout(audioDeviceReloadTimer);
    audioDeviceReloadTimer = window.setTimeout(() => {
      audioDeviceReloadTimer = null;
      void (async () => {
        // mpv drops the audio track when ao init fails, so restore it after the reload.
        const prevAid = snap().audioTracks.find((t) => t.selected)?.id ?? null;
        await applyAudioDevice(appliedAudioDevice ?? "auto").catch(() => {});
        await invoke("mpv_command", { cmd: ["ao-reload"] }).catch(() => {});
        if (prevAid) {
          await invoke("mpv_set_property", { name: "aid", value: prevAid }).catch(() => {});
        }
        // dynaudnorm's look-ahead restarts audio ahead of video after a reload; an exact seek in place refills it.
        if (snap().audioNormalize) {
          await invoke("mpv_command", { cmd: ["seek", 0, "relative+exact"] }).catch(() => {});
        }
      })();
    }, 300);
  };

  // Sleep can release the WASAPI endpoint without a hotplug event; becoming visible again reloads the output.
  const onVisibilityRestore = () => {
    if (document.visibilityState !== "visible") return;
    scheduleAudioDeviceReload();
  };

  // A screensaver never hides the document, so a refocus after a long absence is the wake signal instead.
  const FOCUS_RELOAD_MIN_ABSENT_MS = 60_000;
  let lastWindowBlur = Date.now();
  const onWindowBlur = () => {
    lastWindowBlur = Date.now();
  };
  const onWindowFocusRestore = () => {
    if (Date.now() - lastWindowBlur < FOCUS_RELOAD_MIN_ABSENT_MS) return;
    scheduleAudioDeviceReload();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityRestore);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocusRestore);
  }

  return {
    applyAudioFilters,
    scheduleAudioDeviceReload,
    resetAppliedFilters: () => {
      appliedAf = null;
    },
    setAudioProfile: (profile: string) => {
      profileAf = AUDIO_PROFILE_AF[profile] ?? "";
      applyAudioFilters();
    },
    setAudioDevice: (name: string | null | undefined) => {
      const want = name && name !== "auto" ? name : "auto";
      if (want === appliedAudioDevice) return;
      appliedAudioDevice = want;
      void applyAudioDevice(want);
    },
    stop: () => {
      document.removeEventListener("visibilitychange", onVisibilityRestore);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocusRestore);
      if (audioDeviceReloadTimer != null) {
        window.clearTimeout(audioDeviceReloadTimer);
        audioDeviceReloadTimer = null;
      }
    },
  };
}

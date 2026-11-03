import { invoke } from "@tauri-apps/api/core";
import { isWindowsDesktop } from "@/lib/platform";
import type { PlayerBridge } from "./bridge";

const setProperty = (name: string, value: unknown) =>
  invoke("mpv_set_property", { name, value }).catch(() => {});

type MpvControls = Pick<
  PlayerBridge,
  | "play"
  | "pause"
  | "frameStep"
  | "setAudioTrack"
  | "setSubVisible"
  | "setSubDelay"
  | "setAudioDelay"
  | "setPanscan"
  | "setVideoZoom"
  | "setAspectOverride"
  | "setStretch"
  | "setVideoEq"
  | "setAnime4kShaders"
  | "setShaderProps"
  | "setMediaInfo"
  | "screenshot"
  | "setAbLoop"
  | "requestPiP"
  | "exitPiP"
  | "requestFullscreen"
  | "exitFullscreen"
  | "capabilities"
>;

// The bridge methods that only forward to mpv and keep no bridge state.
export function createMpvControls(): MpvControls {
  return {
    async play() {
      await setProperty("pause", false);
    },
    pause() {
      void setProperty("pause", true);
    },
    frameStep(dir) {
      invoke("mpv_command", { cmd: [dir > 0 ? "frame-step" : "frame-back-step"] }).catch(() => {});
    },
    setAudioTrack(id) {
      void setProperty("aid", Number(id) || id);
    },
    setSubVisible(on) {
      void setProperty("sub-visibility", on);
    },
    setSubDelay(sec) {
      void setProperty("sub-delay", sec);
    },
    setAudioDelay(sec) {
      void setProperty("audio-delay", sec);
    },
    setPanscan(value) {
      void setProperty("panscan", Math.max(0, Math.min(1, value)));
    },
    setVideoZoom(log2) {
      void setProperty("video-zoom", log2);
    },
    setAspectOverride(ratio) {
      void setProperty("video-aspect-override", ratio);
    },
    setStretch(on) {
      void setProperty("keepaspect", !on);
    },
    setVideoEq(name, value) {
      void setProperty(name, value);
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
    setMediaInfo(info) {
      void setProperty("force-media-title", info.title);
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
      void setProperty("ab-loop-a", a == null ? "no" : a);
      void setProperty("ab-loop-b", b == null ? "no" : b);
    },
    async requestPiP() {},
    async exitPiP() {},
    async requestFullscreen() {
      await setProperty("fullscreen", true);
    },
    async exitFullscreen() {
      await setProperty("fullscreen", false);
    },
    capabilities() {
      return {
        engine: "mpv",
        pictureInPicture: true,
        airplay: false,
        chromecast: true,
        hdrPassthrough: false,
        hardwareDecode: true,
      };
    },
  };
}

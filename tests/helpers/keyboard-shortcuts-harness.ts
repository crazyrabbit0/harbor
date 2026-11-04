import { emptySnapshot } from "../../src/lib/player/bridge.ts";
import { effectiveBinding, eventToBinding } from "../../src/lib/hotkeys.ts";
import { hookHarness } from "./hook-harness.ts";

type Handler = (e: Record<string, unknown>) => void;

/** Runs use-keyboard-shortcuts; `calls` records "mute", "toggle", "seek <delta>" and "sub-delay <sec>". */
export function keyboardShortcutsHarness(
  settings: Record<string, unknown> = {},
  snap: Record<string, unknown> = {},
) {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  let locked = false;
  const windowListeners = new Map<string, Set<Handler>>();
  const tauriListeners = new Map<string, (e: { payload: unknown }) => void>();
  const calls: string[] = [];
  const noop = () => {};
  const mocks: Record<string, unknown> = {
    "@/lib/player-prefs": { writePlayerPrefs: noop },
    "@/lib/player-volume": { writePlayerVolume: noop },
    "@/lib/hotkeys": {
      digitFromEvent: () => null,
      effectiveBinding,
      eventToBinding,
      isTypingTarget: () => false,
    },
    "@/lib/platform": { isWindowsDesktop: () => false },
    "@/lib/player/rtx-video-policy": { isRtxHdrBlocked: () => false, isRtxVsrBlocked: () => false },
    "@/lib/media-session": { mediaKeyGate: () => true },
    "@/lib/player/media-key-owner": { setVideoOwnsMediaKeys: noop },
    "@/lib/settings": {
      useSettingsSelector: (select: (s: unknown) => unknown) =>
        select({ hotkeys: {}, seekBackStepSec: 10, seekForwardStepSec: 10, ...settings }),
      useSettingsUpdate: () => noop,
    },
    "@/lib/fullscreen-state": { isAnyFullscreen: () => false, exitAnyFullscreen: noop },
    "@/lib/big-picture": { isBigPictureActive: () => false },
    "@/lib/player/leave-confirm": { getLeaveConfirm: () => null, openLeaveConfirm: noop },
    "@/lib/player/interaction-lock": { isPlayerInteractionLocked: () => locked },
    "@/lib/player/jump-marks": { flashJumpMarks: noop },
    "../player-utils": { round2: (n: number) => Math.round(n * 100) / 100 },
    "@/components/player/speed-indicator": { SPEED_MAX: 4, SPEED_MIN: 0.25 },
    "@/lib/sfx": { SFX: { volumeChange: noop } },
    "@/lib/i18n": { useT: () => (s: string) => s },
    "@/components/player/transport/transport-utils": { fmtTime: String },
    "@/lib/subtitles/track-label": { subtitleTrackLanguageLabel: () => "" },
    "@/lib/subtitles/language": { trackLanguageName: () => "" },
    "@tauri-apps/api/event": {
      listen: async (name: string, fn: (e: { payload: unknown }) => void) => {
        tauriListeners.set(name, fn);
        return noop;
      },
    },
  };
  const h = hookHarness(
    "src/views/player/hooks/use-keyboard-shortcuts.ts",
    "useKeyboardShortcuts",
    mocks,
    {
      window: {
        __TAURI_INTERNALS__: {},
        addEventListener: (name: string, fn: Handler) =>
          windowListeners.set(name, (windowListeners.get(name) ?? new Set()).add(fn)),
        removeEventListener: (name: string, fn: Handler) => windowListeners.get(name)?.delete(fn),
        setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
        clearTimeout: noop,
      },
      document: { querySelector: () => null },
    },
  );
  const bridge = {
    setMuted: () => calls.push("mute"),
    setRate: noop,
    setSubDelay: (sec: number) => calls.push(`sub-delay ${sec}`),
  };
  const args = {
    bridgeRef: { current: bridge },
    snap: { ...emptySnapshot, status: "playing", volume: 1, ...snap },
    drawMode: false,
    setDrawMode: noop,
    closePlayer: noop,
    playPauseToggle: () => calls.push("toggle"),
    seekStep: (d: number) => calls.push(`seek ${d}`),
    seekTo: noop,
    toggleFullscreen: noop,
    fullscreen: false,
    cycleSubtitles: noop,
    setShowStats: noop,
    metaId: "tt1",
    svpActive: false,
  };
  const render = () => h.render(args) as { subtitleOffsetSec: number | null };
  render();
  const key = (type: string, init: Record<string, unknown>) => {
    let prevented = false;
    const event = {
      type,
      key: "",
      code: "",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      repeat: false,
      cancelable: true,
      target: null,
      preventDefault: () => {
        prevented = true;
      },
      ...init,
    };
    for (const fn of windowListeners.get(type) ?? []) fn(event);
    return prevented;
  };
  return {
    calls,
    key,
    render,
    timers,
    taskbar: (payload: string) => tauriListeners.get("harbor://taskbar-button")?.({ payload }),
    lock: (value: boolean) => {
      locked = value;
    },
  };
}

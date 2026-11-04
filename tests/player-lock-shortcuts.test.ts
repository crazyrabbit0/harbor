// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { effectiveBinding, eventToBinding } from "../src/lib/hotkeys.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

type Handler = (e: Record<string, unknown>) => void;

function setup() {
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
        select({ hotkeys: {}, seekBackStepSec: 10, seekForwardStepSec: 10 }),
      useSettingsUpdate: () => noop,
    },
    "@/lib/fullscreen-state": { isAnyFullscreen: () => false, exitAnyFullscreen: noop },
    "@/lib/big-picture": { isBigPictureActive: () => false },
    "@/lib/player/leave-confirm": { getLeaveConfirm: () => null, openLeaveConfirm: noop },
    "@/lib/player/interaction-lock": { isPlayerInteractionLocked: () => locked },
    "@/lib/player/jump-marks": { flashJumpMarks: noop },
    "../player-utils": { round2: (n: number) => n },
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
        setTimeout: () => 1,
        clearTimeout: noop,
      },
      document: { querySelector: () => null },
    },
  );
  const bridge = { setMuted: () => calls.push("mute"), setRate: noop };
  h.render({
    bridgeRef: { current: bridge },
    snap: { ...emptySnapshot, status: "playing", volume: 1 },
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
  });
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
    taskbar: (payload: string) => tauriListeners.get("harbor://taskbar-button")?.({ payload }),
    lock: (value: boolean) => {
      locked = value;
    },
  };
}

test("player hotkeys and taskbar buttons do nothing while the screen is locked", async () => {
  const h = setup();
  await flushPromises();
  h.lock(true);
  assert.equal(h.key("keydown", { key: "m", code: "KeyM" }), true, "a locked key is swallowed");
  h.key("keydown", { key: " ", code: "Space" });
  h.key("keyup", { key: " ", code: "Space" });
  h.taskbar("toggle");
  h.taskbar("forward");
  h.taskbar("mute");
  assert.deepEqual(h.calls, []);

  h.lock(false);
  h.key("keydown", { key: "m", code: "KeyM" });
  h.taskbar("forward");
  h.taskbar("toggle");
  assert.deepEqual(h.calls, ["mute", "seek 10", "toggle"]);
});

test("a play/pause hold that started before locking releases without toggling", async () => {
  const h = setup();
  await flushPromises();
  h.key("keydown", { key: " ", code: "Space" });
  h.lock(true);
  h.key("keyup", { key: " ", code: "Space" });
  h.lock(false);
  h.key("keyup", { key: " ", code: "Space" });
  assert.deepEqual(h.calls, [], "the tap was cancelled by the lock, not replayed after it");
});

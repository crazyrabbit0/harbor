// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { html5BridgeHarness } from "./helpers/html5-bridge-harness.ts";
import { hookHarness } from "./helpers/hook-harness.ts";
import { callbackContaining, sourceCallback } from "./helpers/source-callback.ts";
import { effectiveBinding, eventToBinding, HOTKEYS } from "../src/lib/hotkeys.ts";
import { playerTvNavigationEnabled } from "../src/lib/player/tv-navigation.ts";

class FakeElement {
  unlock: boolean;
  constructor(unlock: boolean) {
    this.unlock = unlock;
  }
  closest(selector: string) {
    return this.unlock && selector === "[data-player-unlock-control]" ? this : null;
  }
}

type Listener = { fn: (e: unknown) => void; options: AddEventListenerOptions };

function lockHarness(settings = { playerScreenLockEnabled: true, hotkeys: {} }) {
  const listeners = new Map<string, Listener[]>();
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let locked = false;
  const h = hookHarness(
    "src/views/player/hooks/use-player-interaction-lock.ts",
    "usePlayerInteractionLock",
    {
      "@/lib/hotkeys": { effectiveBinding, eventToBinding },
      "@/lib/player/interaction-lock": {
        setPlayerInteractionLocked: (value: boolean) => {
          locked = value;
        },
      },
      "@/lib/settings": {
        useSettingsSelector: (select: (s: unknown) => unknown) => select(settings),
      },
    },
    {
      window: {
        addEventListener: (
          name: string,
          fn: (e: unknown) => void,
          options: AddEventListenerOptions,
        ) => listeners.set(name, [...(listeners.get(name) ?? []), { fn, options }]),
        removeEventListener: (name: string, fn: (e: unknown) => void) =>
          listeners.set(
            name,
            (listeners.get(name) ?? []).filter((l) => l.fn !== fn),
          ),
        setTimeout: (fn: () => void) => (timers.set(++timerId, fn), timerId),
        clearTimeout: (id: number) => timers.delete(id),
      },
      Element: FakeElement,
    },
  );
  const dispatch = (name: string, init: Record<string, unknown> = {}) => {
    const event = {
      type: name,
      cancelable: true,
      repeat: false,
      key: "",
      code: "",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      target: new FakeElement(false),
      stopped: false,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {
        event.stopped = true;
      },
      ...init,
    };
    for (const l of listeners.get(name) ?? []) l.fn(event);
    return event;
  };
  return {
    render: () => h.render() as { locked: boolean; controlsVisible: boolean },
    dispatch,
    listeners,
    timers,
    isLocked: () => locked,
  };
}

test("player lock is configurable and has a deliberate default shortcut", async () => {
  assert.equal(HOTKEYS.find((h) => h.id === "playerScreenLock")?.defaultBinding, "ctrl+l");
  const { DEFAULT } = await import("../src/lib/settings/defaults.ts");
  assert.equal(DEFAULT.playerScreenLockEnabled, false);

  const off = lockHarness({ playerScreenLockEnabled: false, hotkeys: {} });
  off.render();
  off.dispatch("keydown", { key: "l", code: "KeyL", ctrlKey: true });
  assert.equal(off.render().locked, false, "the shortcut does nothing while the setting is off");
  (off.render() as unknown as { lock: () => void }).lock();
  assert.equal(off.render().locked, false, "the lock button cannot flash the lock on either");

  const rebound = lockHarness({
    playerScreenLockEnabled: true,
    hotkeys: { playerScreenLock: "F8" },
  });
  rebound.render();
  rebound.dispatch("keydown", { key: "l", code: "KeyL", ctrlKey: true });
  assert.equal(rebound.render().locked, false, "the default no longer locks once rebound");
  rebound.dispatch("keydown", { key: "F8", code: "F8" });
  assert.equal(rebound.render().locked, true);
});

test("locked playback captures pointer and keyboard input while preserving unlock access", () => {
  const h = lockHarness();
  h.render();
  assert.equal(h.listeners.get("pointerdown")?.length ?? 0, 0, "unlocked pointers stay untouched");
  const toggle = h.dispatch("keydown", { key: "l", code: "KeyL", ctrlKey: true });
  assert.equal(toggle.stopped, true);
  const state = h.render();
  assert.equal(state.locked, true);
  assert.equal(h.isLocked(), true);
  assert.equal(state.controlsVisible, true);
  for (const name of ["pointerdown", "keydown"]) {
    assert.ok(
      h.listeners.get(name)?.every((l) => l.options.capture === true),
      name,
    );
  }

  assert.equal(h.dispatch("pointerdown").stopped, true, "a click on the video is swallowed");
  assert.equal(h.dispatch("keydown", { key: "k" }).stopped, true, "player hotkeys are swallowed");
  const unlockTarget = new FakeElement(true);
  assert.equal(h.dispatch("pointerdown", { target: unlockTarget }).stopped, false);
  assert.equal(h.dispatch("keydown", { key: "Enter", target: unlockTarget }).stopped, false);
  assert.equal(h.dispatch("keydown", { key: " ", target: unlockTarget }).stopped, false);
  assert.equal(
    h.dispatch("keydown", { key: "k", target: unlockTarget }).stopped,
    true,
    "only Enter and Space activate the unlock control",
  );

  for (const fn of h.timers.values()) fn();
  assert.equal(h.render().controlsVisible, false, "the unlock control hides when idle");
  h.dispatch("pointermove");
  assert.equal(h.render().controlsVisible, true, "activity while locked shows it again");

  h.dispatch("keydown", { key: "l", code: "KeyL", ctrlKey: true });
  assert.equal(h.render().locked, false);
  assert.equal(h.isLocked(), false);
  assert.equal(h.dispatch("keydown", { key: "k" }).stopped, false);
});

test("TV focus navigation stays off while the screen is locked or the player is docked", () => {
  const on = { tvNavigation: true, playerTvNavigation: true, screenLocked: false };
  assert.equal(playerTvNavigationEnabled(on), true);
  assert.equal(playerTvNavigationEnabled({ ...on, screenLocked: true }), false);
  assert.equal(playerTvNavigationEnabled({ ...on, pipDocked: true }), false);
  assert.equal(playerTvNavigationEnabled({ ...on, playerTvNavigation: false }), false);
  assert.equal(playerTvNavigationEnabled({ ...on, tvNavigation: false }), false);
  // player.tsx is too large to load, so only its playerTvNavigationEnabled argument runs with `scope`.
  const passed = (screenLocked: boolean, pipDocked: boolean) =>
    sourceCallback(
      "src/views/player.tsx",
      callbackContaining("playerTvNavigationEnabled", "screenLocked"),
      {
        settings: { tvNavigation: true, playerTvNavigation: true },
        screenLocked,
        src: { pipDocked },
      },
    );
  assert.equal(passed(true, false).screenLocked, true, "the player passes its live lock state");
  assert.equal(passed(false, false).screenLocked, false);
  assert.equal(passed(false, true).pipDocked, true);
  assert.equal(passed(false, false).pipDocked, false);
  assert.equal(playerTvNavigationEnabled(passed(false, false)), true);
  assert.equal(playerTvNavigationEnabled(passed(true, false)), false);
  assert.equal(playerTvNavigationEnabled(passed(false, true)), false);
});

test("the html5 media session ignores OS media keys while the screen is locked", async () => {
  let locked = true;
  const h = html5BridgeHarness({}, { locked: () => locked });
  await h.bridge.requestPiP();
  h.video.currentTime = 100;
  const press = () => {
    h.sessionHandlers.get("play")!();
    h.sessionHandlers.get("seekforward")!({ seekOffset: 10 });
    h.sessionHandlers.get("seekbackward")!({ seekOffset: 5 });
    h.sessionHandlers.get("seekto")!({ seekTime: 42 });
  };
  press();
  assert.equal(h.video.paused, true);
  assert.equal(h.video.currentTime, 100);
  locked = false;
  press();
  assert.equal(h.video.paused, false);
  assert.equal(h.video.currentTime, 42, "unlocked media keys reach the video");
  h.sessionHandlers.get("pause")!();
  assert.equal(h.video.paused, true);
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import arSettings from "../src/lib/i18n/locales/ar/settings.ts";
import ptSettings from "../src/lib/i18n/locales/pt/settings.ts";
import ruSettings from "../src/lib/i18n/locales/ru/settings.ts";
import {
  HOTKEYS,
  effectiveBinding,
  eventToBinding,
  findHotkeyMatch,
  shouldHandleGlobalKeyboardEvent,
} from "../src/lib/hotkeys.ts";
import { keyEvent, listenerWindow, sourceEffect } from "./helpers/source-effect.ts";
import { treeHarness } from "./helpers/tree-render.ts";

function keyboardEvent(key: string, init: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...init,
  } as KeyboardEvent;
}

test("open settings is a configurable Global Ctrl+S command", () => {
  const command = HOTKEYS.find((entry) => entry.id === "globalSettingsOpen");
  assert.deepEqual(command, {
    id: "globalSettingsOpen",
    scope: "Global",
    group: "Navigation",
    label: "Open settings",
    description: "Open Harbor's settings outside playback.",
    defaultBinding: "ctrl+s",
  });
});

test("open settings follows Global priority and effective binding rules", () => {
  const ctrlS = keyboardEvent("s", { ctrlKey: true });
  const ctrlShiftS = keyboardEvent("S", { ctrlKey: true, shiftKey: true });
  const metaS = keyboardEvent("s", { metaKey: true });
  const altP = keyboardEvent("p", { altKey: true });

  assert.equal(findHotkeyMatch(ctrlS, {}, "Global"), "globalSettingsOpen");
  // Shift is part of a letter binding, so Ctrl+Shift+S stays free for its own action.
  assert.equal(findHotkeyMatch(ctrlShiftS, {}, "Global"), null);
  assert.equal(
    findHotkeyMatch(ctrlShiftS, { globalSettingsOpen: "ctrl+shift+s" }, "Global"),
    "globalSettingsOpen",
  );
  assert.equal(findHotkeyMatch(metaS, {}, "Global"), null);
  assert.equal(
    findHotkeyMatch(ctrlS, { globalSearchFocus: "ctrl+s" }, "Global"),
    "globalSearchFocus",
  );
  assert.equal(
    findHotkeyMatch(altP, { globalSettingsOpen: "alt+p" }, "Global"),
    "globalSettingsOpen",
  );
  assert.equal(findHotkeyMatch(ctrlS, { globalSettingsOpen: "alt+p" }, "Global"), null);
});

test("supported catalogs translate the open-settings description", () => {
  const source = "Open Harbor's settings outside playback.";
  for (const [locale, catalog] of [
    ["ar", arSettings],
    ["pt", ptSettings],
    ["ru", ruSettings],
  ] as const) {
    assert.equal(typeof catalog[source], "string", locale);
    assert.notEqual(catalog[source]?.trim(), "", locale);
    assert.notEqual(catalog[source], source, locale);
  }
});

const input = { nodeType: 1, tagName: "INPUT", isContentEditable: false, getAttribute: () => null };

test("typing targets retain ownership of the global shortcut", () => {
  const event = keyboardEvent("s", {
    ctrlKey: true,
    target: input as unknown as EventTarget,
    isComposing: false,
  });
  assert.equal(shouldHandleGlobalKeyboardEvent(event), false);
});

// App.tsx is too large to render, so its two Shell keydown effects run alone against these stand-ins.
const settingsEffect = sourceEffect("src/App.tsx", '"globalSettingsOpen"');

function runSettingsEffect(player: unknown, multiview = false) {
  const win = listenerWindow();
  let opened = 0;
  const openSettings = () => (opened += 1);
  const settings = { hotkeys: {} };
  const document = {
    querySelector: (selector: string) =>
      multiview && selector === '[data-harbor-multiview-active="true"]' ? {} : null,
  };
  const run = settingsEffect({
    shouldHandleGlobalKeyboardEvent,
    findHotkeyMatch,
    settings,
    player,
    document,
    openSettings,
    window: win.window,
  });
  const press = (key: string, init: Record<string, unknown> = {}) => {
    const event = keyEvent(key, init);
    win.fire("keydown", event);
    return event;
  };
  return { win, run, press, opened: () => opened, openSettings, settings };
}

test("Shell consumes save before playback guards and navigates only outside playback", () => {
  const shell = runSettingsEffect(null);
  assert.deepEqual(
    shell.win.listeners.map((l) => [l.type, l.options]),
    [["keydown", true]],
  );
  const ctrlS = shell.press("s", { ctrlKey: true });
  assert.equal(shell.opened(), 1);
  assert.deepEqual([ctrlS.prevented, ctrlS.stopped], [true, true]);

  const repeat = shell.press("s", { ctrlKey: true, repeat: true });
  assert.equal(shell.opened(), 1, "a held key opens settings once");
  assert.deepEqual([repeat.prevented, repeat.stopped], [true, true]);

  const typing = shell.press("s", { ctrlKey: true, target: input });
  const other = shell.press("k", { ctrlKey: true });
  assert.deepEqual([typing.prevented, other.prevented, shell.opened()], [false, false, 1]);

  for (const blocked of [runSettingsEffect({ kind: "player" }), runSettingsEffect(null, true)]) {
    const event = blocked.press("s", { ctrlKey: true });
    assert.equal(event.prevented, true, "the browser save dialog never opens");
    assert.equal(event.stopped, false, "the player keeps its own handling");
    assert.equal(blocked.opened(), 0);
  }

  assert.deepEqual(shell.run.deps, [shell.openSettings, null, shell.settings.hotkeys]);
  shell.run.cleanup?.();
  assert.equal(shell.win.listeners.length, 0);
});

test("Shell defers implicit zoom aliases owned by a Settings rebind", () => {
  const settingsRebind = keyboardEvent("=", { metaKey: true });
  assert.equal(
    findHotkeyMatch(settingsRebind, { globalSettingsOpen: "meta+=" }, "Global"),
    "globalSettingsOpen",
  );

  const zoomEffect = sourceEffect("src/App.tsx", "const isDefaultUiScaleUp");
  const zoom = (hotkeys: Record<string, string>) => {
    const win = listenerWindow();
    const updates: unknown[] = [];
    zoomEffect({
      settings: { hotkeys },
      update: (patch: unknown) => updates.push(patch),
      uiScaleRef: { current: 1 },
      clampUiScale: (scale: number) => Math.round(scale * 100) / 100,
      UI_SCALE_STEP: 0.05,
      UI_SCALE_ACTIVITY_EVENT: "harbor:ui-scale-activity",
      shouldHandleGlobalKeyboardEvent,
      eventToBinding,
      findHotkeyMatch,
      effectiveBinding,
      window: win.window,
      Event: class {},
    });
    const event = keyEvent("=", { metaKey: true });
    win.fire("keydown", event);
    return { updates, prevented: event.prevented };
  };
  assert.deepEqual(zoom({}), { updates: [{ uiScale: 1.05 }], prevented: true });
  assert.deepEqual(zoom({ globalSettingsOpen: "meta+=" }), { updates: [], prevented: false });
});

test("Multiview marks only its active mounted root", () => {
  const root = (active: boolean) => {
    const store = { slots: [], layout: "1", audioFocus: 0, reset() {}, setSlot() {} };
    const h = treeHarness(
      "src/views/multiview.tsx",
      {
        "@/lib/multiview/store": { useMultiviewStore: () => store },
        "@/lib/i18n": { useT: () => (key: string) => key },
        "@/lib/use-window-fullscreen": { useWindowFullscreen: () => false },
        "@/lib/discord/activity-hint": { pushActivityHint: () => () => {} },
      },
      {
        lenient: true,
        globals: {
          window: { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} },
          CustomEvent: class {},
        },
      },
    );
    const tree = h.render({
      type: h.exports.MultiviewView,
      props: { channels: [], epg: null, active, sources: [], playlists: new Map(), loading: false },
    }) as { rendered: { props: Record<string, unknown> } };
    return tree.rendered.props["data-harbor-multiview-active"];
  };
  assert.equal(root(true), "true");
  assert.equal(root(false), undefined);
});

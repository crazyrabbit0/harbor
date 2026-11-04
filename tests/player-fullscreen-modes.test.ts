// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";

class PhysicalPosition {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
class PhysicalSize {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

const monitor = { position: { x: 1920, y: 0 }, size: { width: 2560, height: 1440 } };

function fullscreenState(settings: Record<string, unknown>, start = { maximized: false }) {
  const invoked: string[] = [];
  const win = {
    fullscreen: false,
    maximized: start.maximized,
    decorated: true,
    pos: { x: 2000, y: 100 },
    size: { width: 1280, height: 720 },
    setFullscreenCalls: [] as boolean[],
    isFullscreen: async () => win.fullscreen,
    setFullscreen: async (v: boolean) => {
      win.setFullscreenCalls.push(v);
      win.fullscreen = v;
    },
    isMaximized: async () => win.maximized,
    toggleMaximize: async () => {
      win.maximized = !win.maximized;
    },
    isDecorated: async () => win.decorated,
    setDecorations: async (v: boolean) => {
      win.decorated = v;
    },
    outerPosition: async () => ({ ...win.pos }),
    innerSize: async () => ({ ...win.size }),
    setPosition: async (p: PhysicalPosition) => {
      win.pos = { x: p.x, y: p.y };
    },
    setSize: async (s: PhysicalSize) => {
      win.size = { width: s.width, height: s.height };
    },
  };
  const api = loadModule(
    "src/lib/fullscreen-state.ts",
    {
      "@/lib/settings/load": { loadStoredSettings: () => settings },
      "@tauri-apps/api/window": {
        currentMonitor: async () => monitor,
        getCurrentWindow: () => win,
        PhysicalPosition,
        PhysicalSize,
      },
      "@tauri-apps/api/core": { invoke: async (name: string) => invoked.push(name) },
    },
    {
      window: { __TAURI_INTERNALS__: {} },
      document: { documentElement: {}, fullscreenElement: null },
      setTimeout: () => 0,
    },
  );
  return { api, win, invoked };
}

const covers = (win: ReturnType<typeof fullscreenState>["win"]) =>
  win.pos.x === monitor.position.x &&
  win.pos.y === monitor.position.y &&
  win.size.width === monitor.size.width &&
  win.size.height === monitor.size.height;

test("fullscreen state offers three distinct window modes", () => {
  const { api } = fullscreenState({});
  for (const mode of ["fullscreen", "borderless", "maximized"]) {
    assert.equal(api.normalizeFullscreenMode(mode), mode);
  }
  assert.equal(api.normalizeFullscreenMode("windowed"), "fullscreen");
  assert.equal(api.normalizeFullscreenMode(undefined), "fullscreen");
});

test("borderless covers the current monitor with an undecorated window", async () => {
  const { api, win, invoked } = fullscreenState({ fullscreenMode: "borderless" });
  await api.enterWindowFullscreen();
  assert.equal(win.decorated, false);
  assert.ok(covers(win), "the window covers the monitor it is on");
  assert.deepEqual(invoked, [], "no true fullscreen command");
  assert.deepEqual(win.setFullscreenCalls, []);
  assert.equal(api.getWindowFullscreen(), true);
  assert.equal(api.isBorderlessFullscreen(), true);
});

test("leaving borderless restores decorations and the saved geometry", async () => {
  for (const native of [true, false]) {
    const { api, win, invoked } = fullscreenState({
      fullscreenMode: "borderless",
      useNativeTitleBar: native,
    });
    await api.enterWindowFullscreen();
    await api.exitWindowFullscreen();
    assert.equal(win.decorated, native);
    assert.deepEqual(
      [win.pos, win.size],
      [
        { x: 2000, y: 100 },
        { width: 1280, height: 720 },
      ],
    );
    assert.equal(api.isBorderlessFullscreen(), false);
    assert.equal(api.getWindowFullscreen(), false);
    assert.deepEqual(invoked, []);
  }
  const centred = fullscreenState({
    fullscreenMode: "borderless",
    fullscreenRestorePosition: false,
  });
  await centred.api.enterWindowFullscreen();
  await centred.api.exitWindowFullscreen();
  assert.deepEqual(centred.win.pos, { x: 1920 + 640, y: 360 }, "centred when position is not kept");
});

test("a window maximized before borderless is maximized again on exit", async () => {
  const { api, win } = fullscreenState({ fullscreenMode: "borderless" }, { maximized: true });
  await api.enterWindowFullscreen();
  assert.equal(win.maximized, false);
  assert.ok(covers(win));
  await api.exitWindowFullscreen();
  assert.equal(win.maximized, true);
});

test("maximize mode uses the granted toggle, not the ungranted maximize command", async () => {
  const { api, win, invoked } = fullscreenState({ fullscreenMode: "maximized" });
  await api.enterWindowFullscreen();
  assert.equal(win.maximized, true);
  assert.deepEqual(invoked, [], "the fake window has no maximize(); a call would fall back");
  await api.exitWindowFullscreen();
  assert.equal(win.maximized, false);
  assert.deepEqual(invoked, []);
});

test("reasserting the mode keeps borderless instead of forcing true fullscreen", async () => {
  const borderless = fullscreenState({ fullscreenMode: "borderless" });
  await borderless.api.enterWindowFullscreen();
  borderless.win.pos = { x: 0, y: 0 };
  borderless.win.decorated = true;
  await borderless.api.reassertFullscreenMode();
  assert.ok(covers(borderless.win));
  assert.equal(borderless.win.decorated, false);
  assert.deepEqual(borderless.invoked, []);

  const fullscreen = fullscreenState({ fullscreenMode: "fullscreen" });
  await fullscreen.api.reassertFullscreenMode();
  assert.deepEqual(fullscreen.invoked, [], "nothing to reassert while windowed");
  await fullscreen.api.enterWindowFullscreen();
  await fullscreen.api.reassertFullscreenMode();
  assert.deepEqual(fullscreen.invoked, ["window_fullscreen_enter", "window_fullscreen_enter"]);
});

test("exiting any fullscreen also leaves borderless", async () => {
  const { api, win } = fullscreenState({ fullscreenMode: "borderless" });
  await api.enterWindowFullscreen();
  api.setWindowFullscreen(false);
  await api.exitAnyFullscreen();
  assert.equal(api.isBorderlessFullscreen(), false);
  assert.equal(win.decorated, false, "useNativeTitleBar is off");
  assert.deepEqual(win.pos, { x: 2000, y: 100 });
});

function playerHook(borderless: boolean) {
  const calls: string[] = [];
  const docListeners = new Map<string, () => void>();
  let fs = true;
  const h = hookHarness(
    "src/views/player/hooks/use-fullscreen.ts",
    "useFullscreen",
    {
      "@/lib/fullscreen-state": {
        consumeMarathonReenter: () => false,
        enterWindowFullscreen: async () => calls.push("enter"),
        exitWindowFullscreenOnPlayerClose: async () => calls.push("exit-on-close"),
        getWindowFullscreen: () => fs,
        isBorderlessFullscreen: () => borderless,
        reassertFullscreenMode: async () => calls.push("reassert"),
        setWindowFullscreen: (v: boolean) => {
          fs = v;
          calls.push(`set ${v}`);
        },
        subscribeFullscreen: () => () => {},
        toggleWindowFullscreen: async () => calls.push("toggle"),
      },
      "@tauri-apps/api/core": { invoke: async (name: string) => calls.push(name) },
    },
    {
      window: {
        dispatchEvent: () => true,
        addEventListener: () => {},
        removeEventListener: () => {},
        setTimeout: () => 1,
        clearTimeout: () => {},
      },
      document: {
        fullscreenElement: null,
        documentElement: { dataset: {} },
        addEventListener: (name: string, fn: () => void) => docListeners.set(name, fn),
        removeEventListener: () => {},
      },
      Event: class {},
    },
  );
  h.render();
  return { calls, change: () => docListeners.get("fullscreenchange")!() };
}

test("the player reasserts the chosen mode and keeps borderless on a stray fullscreenchange", async () => {
  const borderless = playerHook(true);
  await flushPromises();
  assert.ok(borderless.calls.includes("reassert"));
  assert.ok(!borderless.calls.includes("window_fullscreen_enter"));
  borderless.change();
  assert.ok(!borderless.calls.includes("set false"), "borderless survives the DOM event");

  const real = playerHook(false);
  real.change();
  assert.ok(real.calls.includes("set false"), "a real exit is still noticed");
});

test("the fullscreen mode setting exposes borderless to the user", async () => {
  const { normalizeFullscreenMode } = fullscreenState({}).api;
  type Node = { type: unknown; props: Record<string, any> & { children?: unknown } };
  const element = (type: unknown, props: Node["props"]) => ({ type, props });
  const all = (node: unknown): Node[] => {
    if (Array.isArray(node)) return node.flatMap(all);
    if (!node || typeof node !== "object") return [];
    return [node as Node, ...all((node as Node).props?.children)];
  };
  const patches: unknown[] = [];
  const render = (fullscreenMode: unknown) =>
    all(
      hookHarness("src/views/settings/quality-panel/window-options.tsx", "PlayerWindowOptions", {
        "@/lib/settings": {
          useSettings: () => ({
            settings: { fullscreenMode },
            update: (p: unknown) => patches.push(p),
          }),
        },
        "@/lib/i18n": { useT: () => (s: string) => s },
        "@/lib/fullscreen-state": { normalizeFullscreenMode },
        "../kit": { SettingRow: "SettingRow", SettingsWorkbench: "SettingsWorkbench" },
        "../shared": { Section: "Section", Segmented: "Segmented", ToggleRow: "ToggleRow" },
        "../player-panel/choice": { Anchored: "Anchored" },
        "../fullscreen-preview": { FullscreenPreview: "FullscreenPreview" },
        "../player-panel/volume-hud-preview": { VolumeHudPreview: "VolumeHudPreview" },
        "../player-panel/speed-hud-preview": { SpeedHudPreview: "SpeedHudPreview" },
        "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
      }).render(),
    );
  const select = (mode: unknown) =>
    render(mode).find((n) => n.props["aria-label"] === "What fullscreen does")!;
  const picker = select("borderless");
  assert.equal(picker.props.value, "borderless");
  assert.deepEqual(
    all(picker.props.children).map((o) => [o.props.value, o.props.children]),
    [
      ["fullscreen", "True fullscreen"],
      ["borderless", "Borderless window"],
      ["maximized", "Maximize"],
    ],
  );
  assert.equal(select("bogus").props.value, "fullscreen", "unknown values show as fullscreen");
  picker.props.onChange({ target: { value: "maximized" } });
  assert.deepEqual(patches, [{ fullscreenMode: "maximized" }]);
});

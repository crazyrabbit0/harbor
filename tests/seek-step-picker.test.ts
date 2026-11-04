// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as seekStepLib from "../src/lib/seek-step.ts";
import { DEFAULT } from "../src/lib/settings/defaults.ts";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import { keyboardShortcutsHarness } from "./helpers/keyboard-shortcuts-harness.ts";

const {
  CLIP_LENGTH_OPTIONS,
  SEEK_STEP_OPTIONS,
  nudgeStep,
  sanitizeClipLength,
  sanitizeSeekStep,
  seekSteps,
} = seekStepLib;

type Node = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: Node["props"]) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const all = (node: unknown): Node[] => {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!node || typeof node !== "object") return [];
  const n = node as Node;
  return [n, ...all(n.props?.children)];
};
const fmt = (s: string, vars: Record<string, unknown> = {}) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));

function controls(position: { now: number; clock: number }) {
  const seeks: unknown[][] = [];
  const notified: number[] = [];
  const h = hookHarness(
    "src/views/player/hooks/use-playback-controls.ts",
    "usePlaybackControls",
    {
      "@/lib/player/playback-clock": { getPlaybackPosition: () => position.clock },
      "@/lib/player-prefs": { writePlayerPrefs() {} },
      "@/lib/subtitles/subtitle-memory": {},
      "@/lib/player/imported-subs": {},
      "@/lib/subtitles/selected-subtitle-cache": {},
      "@/lib/media-session": { notifyMediaSeeked: (t: number) => notified.push(t) },
    },
    { performance: { now: () => position.now } },
  );
  const api = h.render({
    bridgeRef: { current: { seek: (...a: unknown[]) => seeks.push(a) } },
    snapRef: { current: { ...emptySnapshot, durationSec: 600 } },
    metaId: "tt1",
    mediaKey: "tt1",
    inRoom: false,
    isHost: false,
    hasStarted: true,
    canControl: true,
    castDevice: null,
  }) as { seekStep: (d: number) => void };
  return { seekStep: api.seekStep, seeks, notified };
}

test("step seeks use exact mode and notify the media session", () => {
  const pos = { now: 0, clock: 100 };
  const c = controls(pos);
  c.seekStep(10);
  assert.deepEqual(c.seeks, [[110, "exact"]]);
  assert.deepEqual(c.notified, [110]);
});

test("rapid steps chain onto the target until the clock ticks behind it", () => {
  const pos = { now: 0, clock: 100 };
  const c = controls(pos);
  c.seekStep(10);
  pos.now = 100;
  c.seekStep(10);
  assert.equal(c.seeks.at(-1)![0], 120, "the clock has not ticked, so the chain continues");
  pos.now = 200;
  pos.clock = 119.5;
  c.seekStep(10);
  assert.equal(c.seeks.at(-1)![0], 130, "within tolerance of the target, the chain continues");
  pos.now = 300;
  pos.clock = 104;
  c.seekStep(10);
  assert.equal(c.seeks.at(-1)![0], 114, "a landing well behind the target restarts from reality");
});

function button(
  settings: Record<string, number>,
  direction: "back" | "forward" = "back",
  frame = true,
) {
  const steps: number[] = [];
  const frames: number[] = [];
  const patches: unknown[] = [];
  const timers: Array<() => void> = [];
  const noop = () => {};
  const h = hookHarness(
    "src/components/player/transport/seek-step-btn.tsx",
    "SeekStepBtn",
    {
      "lucide-react": { Check: "Check", Minus: "Minus", Plus: "Plus", Settings2: "Settings2" },
      "@/lib/i18n": { useT: () => fmt },
      "@/lib/player/chrome-hold": { usePlayerChromeHold: noop },
      "@/lib/seek-step": seekStepLib,
      "@/lib/settings": {
        useSettingsSelector: (select: (s: unknown) => unknown) => select(settings),
        useSettingsUpdate: () => (patch: unknown) => patches.push(patch),
      },
      "@/lib/settings/defaults": { DEFAULT },
      "./hotkey-label": { KeyChips: "KeyChips" },
      "./tooltip": { Tooltip: "Tooltip" },
      "react/jsx-runtime": jsx,
    },
    {
      window: {
        setTimeout: (fn: () => void) => timers.push(fn),
        clearTimeout: noop,
        addEventListener: noop,
        removeEventListener: noop,
      },
    },
  );
  const props = {
    direction,
    onSeekStep: (d: number) => steps.push(d),
    onFrameStep: frame ? (d: number) => frames.push(d) : undefined,
  };
  const render = () => all(h.render(props));
  return { render, steps, frames, patches, timers };
}

const steps = {
  seekBackStepSec: 5,
  seekBackStepShortSec: 1,
  seekBackStepLongSec: 60,
  seekForwardStepSec: 15,
  seekForwardStepShortSec: 3,
  seekForwardStepLongSec: 90,
};
const main = (nodes: Node[]) => nodes.find((n) => n.props["aria-haspopup"] === "menu")!;
const open = (b: ReturnType<typeof button>) => {
  main(b.render()).props.onContextMenu({ preventDefault() {} });
  return b.render();
};
const items = (nodes: Node[]) => nodes.filter((n) => n.props.role === "menuitem");
const chips = (item: Node) => all(item).find((n) => n.type === "KeyChips")!.props.ids;

test("a click steps by the button's own setting", () => {
  const b = button(steps);
  const press = main(b.render()).props;
  press.onPointerDown({ button: 0 });
  press.onPointerUp();
  assert.deepEqual(b.steps, [-5]);
  const fwd = button(steps, "forward");
  const p = main(fwd.render()).props;
  p.onPointerDown({ button: 0 });
  p.onPointerUp();
  assert.deepEqual(fwd.steps, [15]);
});

test("holding opens the menu instead of stepping", () => {
  const b = button(steps);
  const press = main(b.render()).props;
  press.onPointerDown({ button: 0 });
  b.timers.at(-1)!();
  press.onPointerUp();
  assert.deepEqual(b.steps, []);
  assert.equal(main(b.render()).props["aria-expanded"], true);
});

test("the menu offers frame, short and long seeks in that order, not the button's own step", () => {
  const b = button(steps);
  assert.equal(items(b.render()).length, 0);
  const nodes = open(b);
  const menu = items(nodes);
  assert.deepEqual(menu.map(chips), [
    ["playerFrameBack"],
    ["playerSeekBackShort"],
    ["playerSeekBack30"],
  ]);
  assert.equal(
    nodes.find((n) => n.type === "Tooltip")!.props.hidden,
    true,
    "the tooltip hides while the menu is open",
  );
  for (const item of menu) item.props.onClick();
  assert.deepEqual(b.frames, [-1]);
  assert.deepEqual(b.steps, [-1, -60], "short and long sizes come from settings");

  const fwd = button(steps, "forward", false);
  const fwdMenu = items(open(fwd));
  assert.deepEqual(fwdMenu.map(chips), [["playerSeekForwardShort"], ["playerSeekForward30"]]);
  for (const item of fwdMenu) item.props.onClick();
  assert.deepEqual(fwd.steps, [3, 90]);
});

test("the menu's edit mode writes each step back to its own setting", () => {
  for (const [direction, keys] of [
    ["back", ["seekBackStepSec", "seekBackStepShortSec", "seekBackStepLongSec"]],
    ["forward", ["seekForwardStepSec", "seekForwardStepShortSec", "seekForwardStepLongSec"]],
  ] as const) {
    const b = button(steps, direction);
    open(b)
      .find((n) => n.props["aria-pressed"] === false)!
      .props.onClick();
    const nodes = b.render();
    for (const n of nodes.filter((n) => n.props.label === "Shorter")) n.props.onClick();
    for (const n of nodes.filter((n) => n.props.label === "Longer")) n.props.onClick();
    const expect = (delta: 1 | -1) =>
      keys.map((k) => ({ [k]: nudgeStep(steps[k as keyof typeof steps], delta) }));
    assert.deepEqual(b.patches, [...expect(-1), ...expect(1)]);
  }
});

test("hotkeys step by the short and long settings", async () => {
  const k = keyboardShortcutsHarness(steps);
  await flushPromises();
  for (const key of ["ArrowLeft", "ArrowRight"]) {
    k.key("keydown", { key, code: key, shiftKey: true });
    k.key("keydown", { key, code: key });
  }
  k.key("keydown", { key: ",", code: "Comma" });
  k.key("keydown", { key: ".", code: "Period" });
  assert.deepEqual(k.calls, ["seek -1", "seek -5", "seek 3", "seek 15", "seek -60", "seek 90"]);
});

test("nudging a step moves one option along and stops at the ends", () => {
  assert.equal(nudgeStep(10, 1), 15);
  assert.equal(nudgeStep(10, -1), 5);
  assert.equal(nudgeStep(1, -1), 1);
  assert.equal(nudgeStep(90, 1), 90);
  assert.equal(nudgeStep(7, 1), 10, "an off-scale value snaps to the next option");
  assert.equal(nudgeStep(7, -1), 5);
});

test("clip length nudges along its own options", () => {
  assert.equal(nudgeStep(30, 1, CLIP_LENGTH_OPTIONS), 45);
  assert.equal(nudgeStep(5, -1, CLIP_LENGTH_OPTIONS), 5);
  assert.equal(nudgeStep(120, 1, CLIP_LENGTH_OPTIONS), 120);
  assert.equal(sanitizeClipLength(45, 30), 45);
  assert.equal(sanitizeClipLength(7, 30), 30);
  assert.equal(sanitizeClipLength("60", 30), 30);
});

test("seek steps keep the same sanitized option set", () => {
  assert.deepEqual([...SEEK_STEP_OPTIONS], [1, 3, 5, 10, 15, 30, 60, 90]);
  for (const s of SEEK_STEP_OPTIONS) assert.equal(sanitizeSeekStep(s, 10), s);
  assert.equal(sanitizeSeekStep(7, 10), 10, "an off-scale value falls back");
  assert.equal(sanitizeSeekStep(undefined, 3), 3);
  assert.deepEqual(seekSteps({ seekBackStepSec: 5, seekForwardStepSec: 15 }), {
    back: 5,
    forward: 15,
  });
  assert.deepEqual(seekSteps({}), { back: 10, forward: 10 });
});

test("short and long steps fall back to the shipped defaults", () => {
  assert.equal(DEFAULT.seekBackStepShortSec, 3);
  assert.equal(DEFAULT.seekForwardStepShortSec, 3);
  assert.equal(DEFAULT.seekBackStepLongSec, 30);
  assert.equal(DEFAULT.seekForwardStepLongSec, 30);
  const b = button({});
  const menu = items(open(b));
  for (const item of menu) item.props.onClick();
  assert.deepEqual(b.steps, [-3, -30], "unset steps use the defaults");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hookHarness } from "./helpers/hook-harness.ts";
import { findElement } from "./helpers/component-harness.ts";
import { musicDockHarness } from "./helpers/music-dock-harness.ts";
import { all, nowPlaying } from "./helpers/music-now-playing-harness.ts";

const css = readFileSync("src/components/music/music-now-playing.css", "utf8");

/** The now-playing sheet in a rendered dock tree, if it is mounted. */
const sheetIn = (tree: unknown) =>
  findElement(tree, (el) => typeof el.props.onExplore === "function");
const expandButton = (tree: unknown) =>
  findElement(tree, (el) => "data-music-dock-art" in el.props)!;

function modalExit(reduce = false) {
  const timers: { fn: () => void; ms: number }[] = [];
  const closes: number[] = [];
  const h = hookHarness(
    "src/components/modal-shell.tsx",
    "useModalExit",
    {
      "react-dom": { createPortal: (tree: unknown) => tree },
      "react/jsx-runtime": { jsx() {}, jsxs() {}, Fragment: "Fragment" },
    },
    {
      window: {
        matchMedia: () => ({ matches: reduce }),
        setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
        clearTimeout() {},
      },
    },
  );
  const onClose = () => closes.push(1);
  const render = () => h.render(onClose) as { closing: boolean; close: () => void };
  return { render, timers, closes };
}

test("closing the pull-out runs an exit before it unmounts", () => {
  const exit = modalExit();
  const first = exit.render();
  assert.equal(first.closing, false);
  first.close();
  assert.equal(exit.render().closing, true, "close marks the sheet as closing first");
  assert.deepEqual(exit.closes, [], "the sheet is not unmounted at once");
  assert.equal(exit.timers.length, 1);
  exit.timers[0].fn();
  assert.deepEqual(exit.closes, [1], "the unmount runs after the exit delay");
});

test("the dock routes the pull-out's close through its exit hook", () => {
  const dock = musicDockHarness();
  assert.equal(sheetIn(dock.render()), undefined);
  assert.equal(dock.exits[0].open, false, "the sheet's exit starts closed");
  expandButton(dock.render()).props.onClick();
  const open = dock.render();
  assert.equal(dock.exits[0].open, true, "expanding opens the sheet's exit");
  assert.equal(sheetIn(open)!.props.closing, false);
  sheetIn(open)!.props.onClose();
  assert.equal(dock.exits[0].closed, 1, "Close goes through the exit, not straight to unmount");
  assert.equal(sheetIn(dock.render()), undefined, "the exit's close collapses the sheet");
  expandButton(dock.render()).props.onClick();
  assert.equal(sheetIn(dock.renderClosing(0))!.props.closing, true, "closing reaches the sheet");
});

test("the exit hooks run even when the dock returns early, or the app white-screens", () => {
  const dock = musicDockHarness();
  dock.render();
  const hooks = dock.exitCalls();
  assert.ok(hooks >= 1);
  dock.setTopKind("player");
  assert.equal(dock.render(), null, "the dock hides behind the player");
  assert.equal(
    dock.exitCalls(),
    hooks,
    "a hook below the early return throws Rendered fewer hooks",
  );
});

test("the sheet reflects the closing state in the DOM", async () => {
  const sheet = (tree: unknown) =>
    all(tree).find((n) => n.type === "section" && n.props.className === "music-now-playing")!;
  const n = nowPlaying();
  assert.equal(sheet(await n.settle()).props["data-closing"], undefined);
  assert.equal(sheet(n.render({ closing: true })).props["data-closing"], "1");
});

test("there is an exit animation, distinct from the entrance", () => {
  assert.match(css, /@keyframes music-now-fall/);
  assert.match(css, /\[data-closing="1"\][^}]*music-now-fall/);
  assert.match(css, /@keyframes music-now-rise/);
});

test("the exit animation is not slower than the entrance", () => {
  const rise = Number(/music-now-rise (\d+)ms/.exec(css)?.[1]);
  const fall = Number(/music-now-fall (\d+)ms/.exec(css)?.[1]);
  assert.ok(Number.isFinite(rise) && Number.isFinite(fall));
  assert.ok(fall <= rise, `exit ${fall}ms should not outlast entrance ${rise}ms`);
});

test("the css exit matches the unmount delay, so it is never cut off", () => {
  const exit = modalExit();
  exit.render().close();
  exit.render();
  const fall = Number(/music-now-fall (\d+)ms/.exec(css)?.[1]);
  assert.equal(exit.timers[0].ms, fall);
  const reduced = modalExit(true);
  reduced.render().close();
  reduced.render();
  assert.equal(reduced.timers[0].ms, 0, "reduced motion unmounts without waiting");
});

test("reduced motion suppresses the exit too", () => {
  const blocks = css.split("@media (prefers-reduced-motion: reduce)").slice(1);
  const sheet = blocks.find((block) => /^\s*\{\s*\.music-now-playing,/.test(block)) ?? "";
  assert.match(
    sheet.slice(0, 160),
    /\.music-now-playing\[data-closing="1"\] \{\s*animation: none;/,
  );
});

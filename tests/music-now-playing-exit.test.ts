import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hookHarness } from "./helpers/hook-harness.ts";
import { all, nowPlaying } from "./helpers/music-now-playing-harness.ts";

// music-dock.tsx is too large to load, so its wiring is checked line by line.
const dock = readFileSync("src/components/music/music-dock.tsx", "utf8");
const css = readFileSync("src/components/music/music-now-playing.css", "utf8");

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
  assert.match(dock, /^\s*const nowExit = useModalExit\(closeExpanded, expanded\);$/m);
  assert.match(dock, /^\s*onClose=\{nowExit\.close\}$/m);
  assert.match(dock, /^\s*closing=\{nowExit\.closing\}$/m);
});

test("the exit hook sits above the dock's early return, or the app white-screens", () => {
  const hook = dock.indexOf("useModalExit(closeExpanded");
  const guard = dock.indexOf("if (!visible || !current");
  assert.ok(hook > 0 && guard > 0, "anchors not found");
  assert.ok(hook < guard, "a hook below the early return throws Rendered fewer hooks");
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

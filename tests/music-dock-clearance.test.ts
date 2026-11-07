import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { musicDockHarness } from "./helpers/music-dock-harness";
import { floatingBottomOffsets, renderBackToTop, resolveOffset } from "./helpers/floating-surfaces";

const GAP = "var(--harbor-dock-gap";
const NEWLINE = String.fromCharCode(10);
const read = (p: string) => readFileSync(p, "utf8");
const DOCK = "--harbor-music-dock";
const LIFT = "--harbor-viewport-bottom";

function topLevelBlock(css: string, selector: string): string {
  const lines = css.split(NEWLINE);
  const start = lines.findIndex((line) => line.trimEnd() === selector + " {");
  assert.ok(start >= 0, selector + " rule not found at top level");
  const rest = lines.slice(start);
  const end = rest.findIndex((line) => line === "}");
  return rest.slice(0, end < 0 ? rest.length : end).join(NEWLINE);
}

test("the dock publishes its height for everything else to clear", () => {
  const dock = musicDockHarness();
  dock.render();
  assert.equal(dock.properties.get(DOCK), "76px");
  dock.unmount();
  assert.equal(dock.properties.has(DOCK), false, "a closed dock leaves no clearance behind");
});

test("the dock watches the viewport bottom once and stops when it closes", () => {
  const dock = musicDockHarness();
  dock.render();
  dock.render();
  assert.equal(dock.tracker.installs, 1, "re-rendering must not add another viewport listener");
  assert.equal(dock.tracker.removals, 0);
  dock.unmount();
  assert.equal(dock.tracker.removals, 1, "a closed dock removes its viewport listener");
});

test("settings content, rail and footer all clear the dock", () => {
  const css = read("src/index.css");
  for (const selector of [".hset-main", ".hset-rail", ".hset-main:has(.hset-footer)"]) {
    assert.ok(topLevelBlock(css, selector).includes(GAP), selector + " sits under the music dock");
  }
  assert.ok(
    topLevelBlock(css, ".hset-footer").includes("inset-block-end: 0"),
    "footer must not count the dock clearance twice",
  );
});

test("the composite gap covers both the dock and any viewport lift", () => {
  const dock = musicDockHarness();
  dock.render();
  const gap = dock.properties.get("--harbor-dock-gap")!;
  assert.equal(resolveOffset(gap, { [DOCK]: 76, [LIFT]: 30 }), 106);
  const collapsed = musicDockHarness();
  collapsed.collapse();
  const tabGap = collapsed.properties.get("--harbor-dock-gap")!;
  assert.equal(resolveOffset(tabGap, { [DOCK]: 48, [LIFT]: 30 }), 30, "the tab floats over pages");
});

test("floating bottom surfaces clear the dock", () => {
  for (const [surface, offset] of Object.entries(floatingBottomOffsets())) {
    assert.equal(
      resolveOffset(offset, { [DOCK]: 76 }) - resolveOffset(offset),
      76,
      surface + " floats at the bottom without clearing the dock",
    );
  }
});

test("the existing ebook back-to-top clears the music dock without a redesign", () => {
  // The ebook view is 3,400 lines with a large import graph, so its one offset line stays text.
  const ebook = read("src/views/ebook.tsx");
  const control = ebook.slice(ebook.indexOf("{showScrollTop && !reading"));
  const offset = /bottom:\s*"(calc\([^"]+\))"/.exec(control)?.[1];
  assert.ok(offset, "the ebook scroll-to-top control has a bottom offset");
  assert.equal(resolveOffset(offset, { [DOCK]: 76, [LIFT]: 30 }) - resolveOffset(offset), 106);
});

test("the sports hub scroller clears the dock so the last card is reachable", () => {
  const css = read("src/views/sports/hub.css");
  const block = topLevelBlock(css, ".sports-hub");
  assert.ok(block.includes(GAP), "the sports hub scrolls under the music dock");
});

test("the shared back-to-top is flat and on theme, not an accent slab", () => {
  const classes = new Set(String(renderBackToTop().props.className).split(/\s+/));
  for (const name of ["bg-elevated", "ring-1", "ring-edge-soft"])
    assert.ok(classes.has(name), name);
  assert.equal(classes.has("bg-accent"), false);
});

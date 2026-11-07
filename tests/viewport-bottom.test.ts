import test from "node:test";
import assert from "node:assert/strict";
import { viewportBottomGap } from "../src/lib/viewport-bottom";
import { musicDockHarness } from "./helpers/music-dock-harness";
import { floatingBottomOffsets, resolveOffset } from "./helpers/floating-surfaces";

test("with no zoom the layout and visual viewports agree and nothing is offset", () => {
  assert.equal(viewportBottomGap(900, 900, 0), 0);
});

test("zoomed in, the gap is what the layout viewport hides below the visible area", () => {
  assert.equal(viewportBottomGap(900, 720, 0), 180);
});

test("a scrolled visual viewport counts its own offset", () => {
  assert.equal(viewportBottomGap(900, 720, 100), 80);
});

test("a visual viewport larger than the layout never pushes content upward", () => {
  assert.equal(viewportBottomGap(900, 1000, 0), 0);
  assert.equal(viewportBottomGap(900, 900, -50), 0);
});

test("sub-pixel noise is not treated as a gap", () => {
  assert.equal(viewportBottomGap(900, 899.7, 0), 0);
});

test("a fractional ui zoom never lifts the dock", () => {
  assert.equal(viewportBottomGap(900, 899.0, 0), 0);
  assert.equal(viewportBottomGap(900, 898.2, 0), 0);
  assert.equal(viewportBottomGap(829, 828.47, 0), 0);
  assert.equal(viewportBottomGap(900, 877, 0), 0);
});

test("nonsense measurements are survivable", () => {
  assert.equal(viewportBottomGap(Number.NaN, 700, 0), 0);
  assert.equal(viewportBottomGap(900, Number.NaN, 0), 0);
});

test("the gap can never exceed the viewport itself", () => {
  assert.equal(viewportBottomGap(500, -1000, 0), 500);
});

const LIFT = "--harbor-viewport-bottom";

test("the dock anchors to the visual viewport, not the layout viewport", () => {
  const dock = musicDockHarness();
  const bar = dock.render();
  assert.equal(dock.tracker.installs, 1, "the tracker must be installed");
  assert.equal(resolveOffset(bar.props.style.bottom, { [LIFT]: 40 }), 40);
  const tab = dock.collapse();
  assert.equal(tab.props["data-music-dock-tab"], true);
  assert.equal(resolveOffset(tab.props.style.bottom, { [LIFT]: 40 }), 40, "the tab must anchor");
  assert.ok(
    dock.properties.has("--harbor-dock-gap"),
    "the dock must publish a composite gap for everything else to clear",
  );
  dock.unmount();
  assert.equal(dock.tracker.removals, 1, "the tracker is removed with the dock");
});

test("every floating bottom surface clears the zoom gap as well as the dock", () => {
  for (const [surface, offset] of Object.entries(floatingBottomOffsets())) {
    assert.equal(
      resolveOffset(offset, { [LIFT]: 40 }) - resolveOffset(offset),
      40,
      `${surface} would float away when zoomed`,
    );
  }
});

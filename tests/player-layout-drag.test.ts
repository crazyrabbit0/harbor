// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { placeControl } from "../src/views/settings/player-layout-panel/config-helpers.ts";
import type { PlayerChromeConfig } from "../src/lib/player-chrome.ts";

const config = (): PlayerChromeConfig => ({
  controls: [
    { id: "volume", slot: "bottom-left", order: 0 },
    { id: "dvr", slot: "bottom-left", order: 10 },
    { id: "seek-back", slot: "bottom-center", order: 0 },
    { id: "play-pause", slot: "bottom-center", order: 10 },
    { id: "seek-forward", slot: "bottom-center", order: 20 },
    { id: "pip", slot: "bottom-right", order: 0, hidden: true },
  ],
  options: { volumeStyle: "slider", timeFormat: "start-end" },
});

const order = (c: PlayerChromeConfig, slot: string) =>
  c.controls
    .filter((x) => x.slot === slot)
    .sort((a, b) => a.order - b.order)
    .map((x) => x.id);

test("dropping before a peer reorders within a slot", () => {
  const next = placeControl(config(), "seek-forward", "bottom-center", "seek-back");
  assert.deepEqual(order(next, "bottom-center"), ["seek-forward", "seek-back", "play-pause"]);
});

test("dropping into another slot moves it there at the drop point", () => {
  const next = placeControl(config(), "play-pause", "bottom-left", "dvr");
  assert.deepEqual(order(next, "bottom-left"), ["volume", "play-pause", "dvr"]);
  assert.deepEqual(order(next, "bottom-center"), ["seek-back", "seek-forward"]);
});

test("dropping with no peer after it appends to the slot", () => {
  const next = placeControl(config(), "volume", "bottom-center", null);
  assert.deepEqual(order(next, "bottom-center"), [
    "seek-back",
    "play-pause",
    "seek-forward",
    "volume",
  ]);
});

test("dropping on the hidden tray hides the control and keeps its slot", () => {
  const next = placeControl(config(), "dvr", "hidden", null);
  const dvr = next.controls.find((c) => c.id === "dvr");
  assert.equal(dvr?.hidden, true);
  assert.equal(dvr?.slot, "bottom-left");
});

test("dragging a hidden control onto the bar shows it at the drop point", () => {
  const next = placeControl(config(), "pip", "bottom-center", "play-pause");
  const pip = next.controls.find((c) => c.id === "pip");
  assert.equal(pip?.hidden, false);
  assert.deepEqual(order(next, "bottom-center"), [
    "seek-back",
    "pip",
    "play-pause",
    "seek-forward",
  ]);
});

test("a drop leaves other slots untouched", () => {
  const before = config();
  const next = placeControl(before, "seek-back", "bottom-left", null);
  assert.equal(next.controls.find((c) => c.id === "pip")?.hidden, true);
  assert.deepEqual(order(next, "bottom-right"), order(before, "bottom-right"));
  assert.equal(placeControl(before, "dvr", "bottom-left", "dvr"), before);
});

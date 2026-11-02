// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { settingsOptionBuilt } from "../src/views/settings/option-features.ts";

const noGames = { games: false, music: true };
const all = { games: true, music: true };

test("a no-games build drops only the Games display entry, not the game provider rows it still shows", () => {
  const display = { section: "theme", anchorTitle: "Games" };
  const providers = { section: "library", anchorTitle: "Games" };
  assert.equal(settingsOptionBuilt(display, noGames), false);
  assert.equal(settingsOptionBuilt(providers, noGames), true);
  assert.equal(settingsOptionBuilt(display, all), true);
  assert.equal(settingsOptionBuilt({ section: "theme", anchorTitle: "Fonts" }, noGames), true);
});

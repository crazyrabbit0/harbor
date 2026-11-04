import "./_localstorage-stub.ts";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { emptySnapshot, initialPlayerSnapshot } from "../src/lib/player/bridge.ts";
import { html5BridgeHarness } from "./helpers/html5-bridge-harness.ts";

test("the initial player snapshot uses the saved volume and mute preference", () => {
  localStorage.setItem("harbor.player.volume.v1", JSON.stringify({ volume: 0.42, muted: true }));
  const snapshot = initialPlayerSnapshot();
  assert.equal(snapshot.volume, 0.42);
  assert.equal(snapshot.muted, true);
  assert.equal(snapshot.status, emptySnapshot.status);
  assert.notEqual(snapshot, emptySnapshot);
});

test("the html5 engine starts from the saved volume and mute preference", () => {
  localStorage.setItem("harbor.player.volume.v1", JSON.stringify({ volume: 0.3, muted: true }));
  const first = html5BridgeHarness().snapshot();
  assert.equal(first.volume, 0.3);
  assert.equal(first.muted, true);
});

test("the mpv engine and the React bridge state use the seeded snapshot", () => {
  const mpv = readFileSync(new URL("../src/lib/player/mpv.ts", import.meta.url), "utf8");
  const hook = readFileSync(
    new URL("../src/views/player/hooks/use-player-bridge.ts", import.meta.url),
    "utf8",
  );
  assert.match(mpv, /let snap: PlayerSnapshot = initialPlayerSnapshot\(\)/);
  assert.match(hook, /useState<PlayerSnapshot>\(initialPlayerSnapshot\)/);
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { html5BridgeHarness } from "./helpers/html5-bridge-harness.ts";

const mpv = readFileSync(new URL("../src/lib/player/mpv-tracks.ts", import.meta.url), "utf8");
const selection = readFileSync(
  new URL("../src/lib/subtitles/track-selection.ts", import.meta.url),
  "utf8",
);

test("Windows path separators cannot drop loaded subtitle metadata", () => {
  assert.ok(
    mpv.includes(String.raw`externalFilename.replace(/\\/g, "/")`),
    "the track-list lookup must normalize mpv's Windows path separators",
  );
});

test("automatic subtitle selection excludes known incompatible releases", () => {
  assert.match(selection, /track\.matchConfidence !== "incompatible"/);
  assert.match(selection, /if \(eligible\.length === 0\) return null/);
  assert.match(selection, /subtitleConfidenceRank/);
});

test("subtitle load failures do not print private subtitle URLs", async () => {
  const url = "https://subs.test/download?token=SECRET";
  const h = html5BridgeHarness({ [url]: new Error(`fetch ${url} failed`) });
  assert.equal(await h.bridge.addSubtitle(url, "en", "A", true, { provider: "Fixture" }), false);
  assert.equal(h.warnings.length, 1, "the failure is still logged");
  assert.doesNotMatch(JSON.stringify(h.warnings), /SECRET|subs\.test/);
  assert.match(JSON.stringify(h.warnings), /Fixture/);
});

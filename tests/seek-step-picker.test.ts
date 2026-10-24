// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  CLIP_LENGTH_OPTIONS,
  SEEK_STEP_OPTIONS,
  nudgeStep,
  sanitizeClipLength,
  sanitizeSeekStep,
  seekSteps,
} from "../src/lib/seek-step.ts";

const at = (p: string) => new URL(`../${p}`, import.meta.url);
const btn = readFileSync(at("src/components/player/transport/seek-step-btn.tsx"), "utf8");
const keys = readFileSync(at("src/views/player/hooks/use-keyboard-shortcuts.ts"), "utf8");

test("step seeks use exact mode and retain Linux media notifications", () => {
  const controls = readFileSync(at("src/views/player/hooks/use-playback-controls.ts"), "utf8");
  const step = controls.slice(
    controls.indexOf("const seekStep ="),
    controls.indexOf("const seekTo ="),
  );
  assert.match(step, /seek\(target, "exact"\);\s*notifyMediaSeeked\(target\)/);
  assert.match(step, /observed !== acc.clock && observed < acc.target - SEEK_REBASE_TOLERANCE_SEC/);
  assert.match(step, /clock: observed/);
});

test("the menu offers frame, short and long seeks in that order, not the button's own step", () => {
  const menu = btn.slice(btn.indexOf("const actions: SeekAction[]"), btn.indexOf("const word ="));
  const frame = menu.indexOf('"playerFrameBack"');
  const short = menu.indexOf('"playerSeekBackShort"');
  const long = menu.indexOf('"playerSeekBack30"');
  assert.ok(frame >= 0 && frame < short && short < long, "frame, then short, then long");
  assert.doesNotMatch(menu, /"playerSeekBack10"/);
  assert.doesNotMatch(btn, /StepBack|StepForward/);
  assert.match(btn, /<KeyChips ids=\{\[a\.hotkey\]\} \/>/);
});

test("every seek size comes from settings, never a literal", () => {
  for (const key of ["seekBackStepSec", "seekBackStepShortSec", "seekBackStepLongSec"]) {
    assert.match(btn, new RegExp(`settings\\.${key}`));
    assert.match(btn, new RegExp(`settings\\.${key.replace("Back", "Forward")}`));
  }
  assert.doesNotMatch(btn, /LONG_SEC|onSeekStep\(sign \* \d/);
  assert.match(keys, /seekBy\(-seekBackStepShortSec\)/);
  assert.match(keys, /seekBy\(seekForwardStepShortSec\)/);
  assert.match(keys, /seekBy\(-seekBackStepLongSec\)/);
  assert.match(keys, /seekBy\(seekForwardStepLongSec\)/);
  assert.doesNotMatch(keys, /seekBy\(-?30\)/);
});

test("the tooltip names both ways in and hides while the menu is open", () => {
  assert.match(btn, /t\("Right-click or hold for more options"\)/);
  assert.match(btn, /hidden=\{pickerOpen\}/);
});

test("the menu's edit mode writes each step back to its own setting", () => {
  assert.match(btn, /update\(\{ \[s\.setting\]: nudgeStep\(s\.value, -1\) \}\)/);
  assert.match(btn, /update\(\{ \[s\.setting\]: nudgeStep\(s\.value, 1\) \}\)/);
  for (const key of ["seekBackStepSec", "seekBackStepShortSec", "seekBackStepLongSec"]) {
    assert.match(btn, new RegExp(`"${key}"`));
    assert.match(btn, new RegExp(`"${key.replace("Back", "Forward")}"`));
  }
});

test("nudging a step moves one option along and stops at the ends", () => {
  assert.equal(nudgeStep(10, 1), 15);
  assert.equal(nudgeStep(10, -1), 5);
  assert.equal(nudgeStep(1, -1), 1);
  assert.equal(nudgeStep(90, 1), 90);
  assert.equal(nudgeStep(7, 1), 10, "an off-scale value snaps to the next option");
  assert.equal(nudgeStep(7, -1), 5);
});

test("clip length nudges along its own options and the recorder uses the setting", () => {
  assert.equal(nudgeStep(30, 1, CLIP_LENGTH_OPTIONS), 45);
  assert.equal(nudgeStep(5, -1, CLIP_LENGTH_OPTIONS), 5);
  assert.equal(nudgeStep(120, 1, CLIP_LENGTH_OPTIONS), 120);
  assert.equal(sanitizeClipLength(45, 30), 45);
  assert.equal(sanitizeClipLength(7, 30), 30);
  assert.equal(sanitizeClipLength("60", 30), 30);
  const recorder = readFileSync(at("src/views/player/hooks/use-clip-recorder.ts"), "utf8");
  assert.match(recorder, /beforeSec: seconds/);
  assert.doesNotMatch(recorder, /CLIP_SECONDS/);
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
  const defaults = readFileSync(at("src/lib/settings/defaults.ts"), "utf8");
  assert.match(defaults, /seekBackStepShortSec: 3/);
  assert.match(defaults, /seekForwardStepShortSec: 3/);
  assert.match(defaults, /seekBackStepLongSec: 30/);
  assert.match(defaults, /seekForwardStepLongSec: 30/);
});

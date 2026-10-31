// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const at = (p: string) => new URL(`../${p}`, import.meta.url);
const mpv = readFileSync(at("src/lib/player/mpv.ts"), "utf8");
const audio = readFileSync(at("src/lib/player/mpv-audio.ts"), "utf8");
const mpvRs = readFileSync(at("src-tauri/src/mpv.rs"), "utf8");

// An audio-device-list change reaches the bridge, which asks mpv-audio.ts for a Windows ao-reload while a stream is active.
const schedule = audio.slice(
  audio.indexOf("const scheduleAudioDeviceReload = () => {"),
  audio.indexOf("const onVisibilityRestore = () => {"),
);

test("audio-device-list property change is wired to schedule the reload", () => {
  assert.match(mpv, /name === "audio-device-list"\) scheduleAudioDeviceReload\(\)/);
});

test("the reload re-init guard is Windows-only while actively playing", () => {
  assert.match(schedule, /if \(!isWindowsDesktop\(\)\) return;/);
  assert.match(schedule, /if \(!mpvStarted\(\)\) return;/);
  assert.match(schedule, /snap\(\)\.status !== "playing" && snap\(\)\.status !== "paused"/);
});

test("the reload re-asserts the device then forces ao-reload on the current default", () => {
  assert.match(schedule, /applyAudioDevice\(appliedAudioDevice \?\? "auto"\)/);
  assert.match(schedule, /cmd: \["ao-reload"\]/);
  // ao-reload must appear after the Windows gate so it only fires on desktop.
  assert.ok(schedule.indexOf("isWindowsDesktop()") < schedule.indexOf("ao-reload"));
});

test("with normalization on, the reload re-syncs audio with an exact seek in place", () => {
  assert.match(
    schedule,
    /if \(snap\(\)\.audioNormalize\) \{\s*await invoke\("mpv_command", \{ cmd: \["seek", 0, "relative\+exact"\] \}\)/,
  );
  assert.ok(schedule.indexOf("ao-reload") < schedule.indexOf('"relative+exact"'));
});

test("Rust observes audio-device-list so the event reaches the frontend", () => {
  assert.match(mpvRs, /\("audio-device-list", 21, PropertyKind::Node\)/);
});

test("Rust allows the ao-reload command", () => {
  assert.match(mpvRs, /"ao-reload",/);
});

test("refocus reload waits for a long absence and removes both listeners on disposal", () => {
  assert.match(audio, /const FOCUS_RELOAD_MIN_ABSENT_MS = 60_000/);
  assert.match(audio, /const onWindowBlur = \(\) => \{\s*lastWindowBlur = Date.now\(\)/);
  assert.match(
    audio,
    /Date.now\(\) - lastWindowBlur < FOCUS_RELOAD_MIN_ABSENT_MS\) return;\s*scheduleAudioDeviceReload\(\)/,
  );
  for (const [event, callback] of [
    ["blur", "onWindowBlur"],
    ["focus", "onWindowFocusRestore"],
  ]) {
    assert.ok(audio.includes(`window.addEventListener("${event}", ${callback})`));
    assert.ok(audio.includes(`window.removeEventListener("${event}", ${callback})`));
  }
});

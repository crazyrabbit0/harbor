// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushBridge, mpvBridgeHarness } from "./helpers/mpv-bridge-harness.ts";

const mpvRs = readFileSync(new URL("../src-tauri/src/mpv.rs", import.meta.url), "utf8");

type Harness = ReturnType<typeof mpvBridgeHarness>;

// Loads a file and lets mpv report it playing with audio track 2 selected.
async function playing(windows = true) {
  const h = mpvBridgeHarness(undefined, undefined, { windows });
  await h.bridge.load({ url: "https://media.test/a.mkv" });
  h.emitEvent({ event: "file-loaded" });
  h.emit("track-list", [
    { id: 1, type: "audio", selected: false },
    { id: 2, type: "audio", selected: true },
  ]);
  h.commands.length = 0;
  return h;
}

const reloadCommands = (h: Harness) =>
  h.commands
    .filter(({ command }) => command === "mpv_command" || command === "mpv_set_property")
    .map(({ command, args }) =>
      command === "mpv_command" ? (args.cmd as unknown[]).join(" ") : `${args.name}=${args.value}`,
    );

async function fire(t: any, trigger: () => void) {
  trigger();
  t.mock.timers.tick(300);
  await flushBridge();
}

test("an audio-device-list change reloads the output and reselects the dropped track", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const h = await playing();
  await fire(t, () => h.emit("audio-device-list", []));
  assert.deepEqual(reloadCommands(h), ["audio-device=auto", "ao-reload", "aid=2"]);
  h.bridge.destroy();
});

test("the reload runs only on Windows while a stream is playing or paused", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const other = await playing(false);
  await fire(t, () => other.emit("audio-device-list", []));
  assert.deepEqual(reloadCommands(other), [], "not on Linux/macOS");
  other.bridge.destroy();

  const idle = mpvBridgeHarness();
  await fire(t, () => idle.emit("audio-device-list", []));
  assert.deepEqual(reloadCommands(idle), [], "not before mpv started");
  idle.bridge.destroy();

  const loading = mpvBridgeHarness();
  await loading.bridge.load({ url: "https://media.test/a.mkv" });
  loading.commands.length = 0;
  await fire(t, () => loading.emit("audio-device-list", []));
  assert.deepEqual(reloadCommands(loading), [], "not while still loading");
  loading.bridge.destroy();

  const paused = await playing();
  paused.emit("pause", true);
  paused.emitEvent({ event: "file-loaded" });
  paused.commands.length = 0;
  await fire(t, () => paused.emit("audio-device-list", []));
  assert.ok(reloadCommands(paused).includes("ao-reload"), "a paused stream reloads too");
  paused.bridge.destroy();
});

test("the reload re-asserts the chosen device before ao-reload", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const h = await playing();
  h.invokeWith(async (command, args) => {
    if (command === "mpv_audio_devices") return [{ name: "wasapi/hdmi" }];
    if (command === "mpv_get_property") return "";
    return args;
  });
  h.bridge.setAudioDevice("wasapi/hdmi");
  await flushBridge();
  h.commands.length = 0;
  await fire(t, () => h.emit("audio-device-list", []));
  const calls = reloadCommands(h);
  assert.deepEqual(calls.slice(0, 2), ["audio-device=wasapi/hdmi", "ao-reload"]);
  h.bridge.destroy();
});

test("with normalization on, the reload re-syncs audio with an exact seek in place", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const h = await playing();
  h.bridge.setAudioNormalize(true);
  h.commands.length = 0;
  await fire(t, () => h.emit("audio-device-list", []));
  assert.deepEqual(reloadCommands(h), [
    "audio-device=auto",
    "ao-reload",
    "aid=2",
    "seek 0 relative+exact",
  ]);
  h.bridge.destroy();
});

test("Rust observes audio-device-list so the event reaches the frontend", () => {
  assert.match(mpvRs, /\("audio-device-list", 21, PropertyKind::Node\)/);
});

test("Rust allows the ao-reload command", () => {
  assert.match(mpvRs, /"ao-reload",/);
});

test("refocus reloads only after a long absence, and destroy removes both listeners", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const h = await playing();
  h.emitWindow("blur");
  t.mock.timers.tick(59_000);
  await fire(t, () => h.emitWindow("focus"));
  assert.deepEqual(reloadCommands(h), [], "a short absence does not reload");
  h.emitWindow("blur");
  t.mock.timers.tick(60_000);
  await fire(t, () => h.emitWindow("focus"));
  assert.ok(reloadCommands(h).includes("ao-reload"), "a long absence reloads");
  assert.equal(h.windowListenerCount("blur"), 1);
  assert.equal(h.windowListenerCount("focus"), 1);
  h.bridge.destroy();
  assert.equal(h.windowListenerCount("blur"), 0);
  assert.equal(h.windowListenerCount("focus"), 0);
  h.commands.length = 0;
  h.emitWindow("blur");
  t.mock.timers.tick(120_000);
  await fire(t, () => h.emitWindow("focus"));
  assert.deepEqual(reloadCommands(h), [], "a destroyed bridge no longer listens");
});

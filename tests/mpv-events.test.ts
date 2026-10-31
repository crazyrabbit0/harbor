// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { reduceMpvEvent, type MpvEventState } from "../src/lib/player/mpv-events.ts";

const state = (patch: Partial<MpvEventState> = {}): MpvEventState => ({
  snap: { ...emptySnapshot, status: "loading", firstFrameReady: false },
  observedPaused: null,
  observedMediaPath: null,
  expectedMediaPath: "C:\\media\\a.mkv",
  currentIsLive: false,
  currentStartupProfile: "standard",
  mediaLoadId: 3,
  steadyBufferLoadId: 0,
  suppressEndFileUntil: 0,
  ...patch,
});
const kinds = (effects: Array<{ kind: string }>) => effects.map((e) => e.kind);

test("file-loaded clears errors but does not mark the first frame ready", () => {
  const { state: next, effects } = reduceMpvEvent(
    state({ snap: { ...emptySnapshot, errorCode: "source", errorMessage: "x" } }),
    { event: "file-loaded" },
    0,
  );
  assert.equal(next.snap.firstFrameReady, false);
  assert.equal(next.snap.status, "playing");
  assert.equal(next.snap.errorCode, null);
  assert.deepEqual(kinds(effects), ["trace-mark", "emit"]);
});

test("playback-restart marks the first frame ready, ends buffering and finishes the trace", () => {
  const { state: next, effects } = reduceMpvEvent(
    state({ snap: { ...emptySnapshot, buffering: true }, observedMediaPath: "C:/media/a.mkv" }),
    { event: "playback-restart" },
    0,
  );
  assert.equal(next.snap.firstFrameReady, true);
  assert.equal(next.snap.buffering, false);
  assert.deepEqual(kinds(effects), ["steady-buffer", "trace-mark", "trace-ready", "emit"]);
});

test("a paused seek restart keeps the player paused", () => {
  const paused = reduceMpvEvent(
    state(),
    { event: "property-change", name: "pause", data: true },
    0,
  );
  assert.equal(paused.state.observedPaused, true);
  assert.equal(paused.state.snap.status, "paused");
  const restarted = reduceMpvEvent(paused.state, { event: "playback-restart" }, 0);
  assert.equal(restarted.state.snap.status, "paused");
});

test("a playback-restart from the previous file is ignored, whatever the path separators", () => {
  const stale = state({ observedMediaPath: "C:/media/old.mkv" });
  const ignored = reduceMpvEvent(stale, { event: "playback-restart" }, 0);
  assert.equal(ignored.state, stale);
  assert.deepEqual(ignored.effects, []);
  const same = reduceMpvEvent(
    state({ observedMediaPath: "C:/media/a.mkv" }),
    { event: "playback-restart" },
    0,
  );
  assert.equal(same.state.snap.firstFrameReady, true);
});

test("the steady buffer phase starts once per VOD load and never for live", () => {
  const first = reduceMpvEvent(state(), { event: "playback-restart" }, 0);
  assert.deepEqual(first.effects[0], { kind: "steady-buffer", profile: "standard" });
  assert.equal(first.state.steadyBufferLoadId, 3);
  const again = reduceMpvEvent(first.state, { event: "playback-restart" }, 0);
  assert.ok(!kinds(again.effects).includes("steady-buffer"));
  const live = reduceMpvEvent(state({ currentIsLive: true }), { event: "playback-restart" }, 0);
  assert.ok(!kinds(live.effects).includes("steady-buffer"));
});

test("end-file reports errors, ignores stop/quit/redirect and the suppress window", () => {
  const error = reduceMpvEvent(state(), { event: "end-file", reason: "ERROR" }, 0);
  assert.equal(error.state.snap.status, "error");
  assert.equal(error.state.snap.errorCode, "decode");
  assert.equal(
    reduceMpvEvent(state(), { event: "end-file", reason: "eof" }, 0).state.snap.status,
    "ended",
  );
  for (const reason of ["stop", "quit", "redirect"]) {
    assert.deepEqual(reduceMpvEvent(state(), { event: "end-file", reason }, 0).effects, []);
  }
  assert.deepEqual(
    reduceMpvEvent(state({ suppressEndFileUntil: 100 }), { event: "end-file" }, 50).effects,
    [],
  );
});

test("property changes record the media path and hand bridge-owned properties to effects", () => {
  const path = reduceMpvEvent(
    state(),
    { event: "property-change", name: "path", data: "C:\\x.mkv" },
    0,
  );
  assert.equal(path.state.observedMediaPath, "C:\\x.mkv");
  const devices = reduceMpvEvent(
    state(),
    { event: "property-change", name: "audio-device-list", data: [] },
    0,
  );
  assert.deepEqual(devices.effects[0], { kind: "property", name: "audio-device-list", data: [] });
});

test("a vapoursynth failure log asks the bridge to drop the SVP filter", () => {
  const failed = reduceMpvEvent(
    state(),
    { event: "log", prefix: "vapoursynth", level: "error", text: "" },
    0,
  );
  assert.deepEqual(kinds(failed.effects), ["svp-filter-failed"]);
  assert.deepEqual(
    reduceMpvEvent(state(), { event: "log", prefix: "cplayer", level: "info", text: "" }, 0)
      .effects,
    [],
  );
});

test("player-failure stops the player and leaves the input state untouched", () => {
  const before = state();
  const failed = reduceMpvEvent(before, { event: "player-failure", reason: "crash" }, 0);
  assert.deepEqual(kinds(failed.effects), ["player-failed", "emit"]);
  assert.equal(failed.state.snap.status, "error");
  assert.equal(before.snap.status, "loading");
});

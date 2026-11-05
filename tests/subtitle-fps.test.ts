// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as subtitleFps from "../src/lib/player/subtitle-fps.ts";
import * as hdrOverlay from "../src/lib/hdr-overlay.ts";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { autoSyncHarness } from "./helpers/autosync-harness.ts";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";
import { deferred, flushBridge, mpvBridgeHarness } from "./helpers/mpv-bridge-harness.ts";
import {
  SUBTITLE_FPS_PRESETS,
  buildSubtitleTimingMediaKey,
  createSubtitleFpsAvailabilityController,
  createSubtitleFpsCoordinator,
  formatSubtitleFps,
  isAutoSyncScopeCurrent,
  matchingSubtitleFpsPreset,
  runAfterSubtitleFpsReset,
  subtitleFpsMatchesVideo,
  subtitleFpsAvailability,
  subtitleFpsToMpvValue,
  validateSubtitleFps,
} from "../src/lib/player/subtitle-fps.ts";
import { isTextSubTrack } from "../src/lib/player/sub-format.ts";

test("subtitle FPS presets preserve exact NTSC fractional rates", () => {
  assert.deepEqual(
    SUBTITLE_FPS_PRESETS.map((preset) => preset.label),
    ["23.976", "24", "25", "29.97", "30", "50", "59.94", "60"],
  );
  assert.equal(SUBTITLE_FPS_PRESETS[0].value, 24_000 / 1_001);
  assert.equal(SUBTITLE_FPS_PRESETS[3].value, 30_000 / 1_001);
  assert.equal(SUBTITLE_FPS_PRESETS[6].value, 60_000 / 1_001);
});

test("custom FPS accepts only finite values from 1 through 240", () => {
  assert.deepEqual(validateSubtitleFps("23.976"), { ok: true, value: 23.976 });
  assert.deepEqual(validateSubtitleFps(1), { ok: true, value: 1 });
  assert.deepEqual(validateSubtitleFps(240), { ok: true, value: 240 });

  for (const value of ["", " ", 0, 0.999, 240.001, Number.NaN, Infinity, true]) {
    assert.equal(validateSubtitleFps(value).ok, false, String(value));
  }
});

test("No correction maps to mpv's zero sentinel", () => {
  assert.equal(subtitleFpsToMpvValue("default"), 0);
  assert.equal(subtitleFpsToMpvValue(25), 25);
  assert.throws(() => subtitleFpsToMpvValue(0), RangeError);
});

test("preset matching and formatting keep user-facing rates stable", () => {
  assert.equal(matchingSubtitleFpsPreset(24_000 / 1_001), "23.976");
  assert.equal(matchingSubtitleFpsPreset(24.981469), null);
  assert.equal(formatSubtitleFps(24_000 / 1_001, 6), "23.976");
  assert.equal(formatSubtitleFps(24.981469, 6), "24.981469");
  assert.equal(formatSubtitleFps(null), "-");
});

test("Auto recognizes when subtitle FPS matches the current video", () => {
  assert.equal(subtitleFpsMatchesVideo(24_000 / 1_001, 23.976), true);
  assert.equal(subtitleFpsMatchesVideo(25, 25), true);
  assert.equal(subtitleFpsMatchesVideo(25, 24), false);
  assert.equal(subtitleFpsMatchesVideo(null, 24), false);
});

test("manual control is available only for a selected text track in the primary mpv player", () => {
  const valid = {
    engine: "mpv" as const,
    hasTrack: true,
    textBased: true,
    hasSecondary: false,
    videoFps: 24_000 / 1_001,
    nativeSupported: true,
    autoSyncActive: false,
  };
  assert.deepEqual(subtitleFpsAvailability(valid), { enabled: true, reason: null });

  const cases = [
    [{ hasTrack: false }, "no-track"],
    [{ engine: "html5" as const }, "html5"],
    [{ textBased: false }, "not-text-based"],
    [{ hasSecondary: true }, "secondary-active"],
    [{ videoFps: null }, "video-fps-unavailable"],
    [{ nativeSupported: false }, "native-unavailable"],
    [{ autoSyncActive: true }, "auto-sync-active"],
  ] as const;
  for (const [override, reason] of cases) {
    assert.deepEqual(subtitleFpsAvailability({ ...valid, ...override }), {
      enabled: false,
      reason,
    });
  }
});

test("recognized text formats are eligible and image formats are not", () => {
  const track = (codec: string, title?: string) => ({
    id: "1",
    label: codec,
    kind: "subtitle" as const,
    selected: true,
    codec,
    title,
  });
  for (const codec of ["SUBRIP", "SRT", "WEBVTT", "ASS", "SSA", "MOV_TEXT"]) {
    assert.equal(isTextSubTrack(track(codec)), true, codec);
  }
  for (const codec of ["HDMV_PGS_SUBTITLE", "DVD_SUBTITLE", "VOBSUB", "DVB_SUBTITLE"]) {
    assert.equal(isTextSubTrack(track(codec)), false, codec);
  }
  assert.equal(isTextSubTrack(track("unknown", "external.srt")), true);
  assert.equal(isTextSubTrack(track("unknown")), false);
});

test("FPS writes are serialized and transitions reset only an active correction", async () => {
  const calls: number[] = [];
  const coordinator = createSubtitleFpsCoordinator({
    writeFps: async (value) => {
      calls.push(value);
    },
  });

  await Promise.all([coordinator.apply(25), coordinator.resetForTransition()]);
  assert.deepEqual(calls, [25, 0]);
  assert.equal(coordinator.isActive(), false);

  await coordinator.resetForTransition();
  assert.deepEqual(calls, [25, 0]);
});

test("a stale queued write cannot leak into a newer video or subtitle track", async () => {
  const calls: number[] = [];
  let current = true;
  const coordinator = createSubtitleFpsCoordinator({
    writeFps: async (value) => {
      calls.push(value);
      if (value === 25) current = false;
    },
  });

  await assert.rejects(
    coordinator.apply(25, () => current),
    /context changed/,
  );
  assert.deepEqual(calls, [25, 0]);
  assert.equal(coordinator.isActive(), false);
});

test("the latest rapid choice wins on the same subtitle track", async () => {
  const calls: number[] = [];
  let releaseFirstWrite: (() => void) | null = null;
  let markFirstWriteStarted: (() => void) | null = null;
  const firstWriteStarted = new Promise<void>((resolve) => {
    markFirstWriteStarted = resolve;
  });
  let currentRequest = 1;
  const coordinator = createSubtitleFpsCoordinator({
    writeFps: async (value) => {
      calls.push(value);
      if (value === 25) {
        markFirstWriteStarted?.();
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
      }
    },
  });

  const first = coordinator.apply(25, () => currentRequest === 1);
  await firstWriteStarted;
  currentRequest = 2;
  const second = coordinator.apply(24, () => currentRequest === 2);
  releaseFirstWrite?.();

  await assert.rejects(first, /context changed/);
  await second;
  assert.deepEqual(calls, [25, 0, 24]);
  assert.equal(coordinator.isActive(), true);
});

test("a failed active reset blocks its transition and remains retryable", async () => {
  let failReset = true;
  const calls: number[] = [];
  const coordinator = createSubtitleFpsCoordinator({
    writeFps: async (value) => {
      calls.push(value);
      if (value === 0 && failReset) throw new Error("reset failed");
    },
  });

  await coordinator.apply(25);
  await assert.rejects(coordinator.resetForTransition(), /reset failed/);
  assert.equal(coordinator.isActive(), true);
  assert.deepEqual(calls, [25, 0]);

  failReset = false;
  await coordinator.resetForTransition();
  assert.deepEqual(calls, [25, 0, 0]);
  assert.equal(coordinator.isActive(), false);
});

test("native reads can wait for an in-flight subtitle FPS transition", async () => {
  let releaseReset: (() => void) | null = null;
  let markResetStarted: (() => void) | null = null;
  const resetStarted = new Promise<void>((resolve) => {
    markResetStarted = resolve;
  });
  const coordinator = createSubtitleFpsCoordinator({
    writeFps: async (value) => {
      if (value !== 0) return;
      markResetStarted?.();
      await new Promise<void>((resolve) => {
        releaseReset = resolve;
      });
    },
  });

  await coordinator.apply(25);
  const reset = coordinator.resetForTransition();
  await resetStarted;

  let settled = false;
  const wait = coordinator.whenSettled().then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  releaseReset?.();
  await reset;
  await wait;
  assert.equal(settled, true);
});

test("a completed write from a destroyed mpv session cannot become active", async () => {
  let releaseWrite: (() => void) | null = null;
  let markWriteStarted: (() => void) | null = null;
  const writeStarted = new Promise<void>((resolve) => {
    markWriteStarted = resolve;
  });
  const coordinator = createSubtitleFpsCoordinator({
    writeFps: async () => {
      markWriteStarted?.();
      await new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
    },
  });

  const pending = coordinator.apply(25);
  await writeStarted;
  coordinator.markSessionRecreated();
  releaseWrite?.();

  await assert.rejects(pending, /context changed/);
  assert.equal(coordinator.isActive(), false);
});

test("Auto Sync waits for the FPS reset and surfaces reset failures", async () => {
  const order: string[] = [];
  let releaseReset: (() => void) | null = null;
  const pending = runAfterSubtitleFpsReset(
    async () => {
      order.push("reset");
      await new Promise<void>((resolve) => {
        releaseReset = resolve;
      });
    },
    () => {
      order.push("action");
    },
    () => {
      order.push("error");
    },
  );

  await Promise.resolve();
  assert.deepEqual(order, ["reset"]);
  releaseReset?.();
  assert.equal(await pending, true);
  assert.deepEqual(order, ["reset", "action"]);

  const failure = new Error("reset failed");
  let actionRan = false;
  let reported: unknown = null;
  assert.equal(
    await runAfterSubtitleFpsReset(
      async () => {
        throw failure;
      },
      () => {
        actionRan = true;
      },
      (error) => {
        reported = error;
      },
    ),
    false,
  );
  assert.equal(actionRan, false);
  assert.equal(reported, failure);
});

test("Auto Sync drops an action when its media changes during the FPS reset", async () => {
  let current = true;
  let actionRan = false;
  const result = await runAfterSubtitleFpsReset(
    async () => {
      current = false;
    },
    () => {
      actionRan = true;
    },
    () => assert.fail("reset should succeed"),
    () => current,
  );

  assert.equal(result, false);
  assert.equal(actionRan, false);
});

test("Auto Sync reports a stale result when its media changes during the action", async () => {
  let current = true;
  const result = await runAfterSubtitleFpsReset(
    async () => {},
    () => {
      current = false;
    },
    () => assert.fail("reset should succeed"),
    () => current,
  );

  assert.equal(result, false);
});

test("stale asynchronous FPS reads cannot commit after a playback boundary", async () => {
  const reads: Array<(supported: boolean) => void> = [];
  const commits: boolean[] = [];
  const controller = createSubtitleFpsAvailabilityController({
    read: () =>
      new Promise<boolean>((resolve) => {
        reads.push(resolve);
      }),
    commit: (supported) => commits.push(supported),
  });

  const stale = controller.refresh();
  controller.invalidate();
  const latest = controller.refresh();
  reads[1](true);
  assert.equal(await latest, true);
  reads[0](false);
  assert.equal(await stale, false);
  assert.deepEqual(commits, [true]);
});

test("subtitle timing media identity distinguishes episodes that reuse a stream URL", () => {
  const episode1 = buildSubtitleTimingMediaKey({
    sourceUrl: "https://stream/shared",
    mediaId: "series:1",
    season: 1,
    episode: 1,
  });
  const episode2 = buildSubtitleTimingMediaKey({
    sourceUrl: "https://stream/shared",
    mediaId: "series:1",
    season: 1,
    episode: 2,
  });

  assert.notEqual(episode1, episode2);
  assert.equal(
    episode1,
    buildSubtitleTimingMediaKey({
      sourceUrl: "https://stream/shared",
      mediaId: "series:1",
      season: 1,
      episode: 1,
    }),
  );
});

test("Auto Sync status applies only to its current media and subtitle track", () => {
  const scope = { mediaKey: "episode-1", trackId: "2" };
  assert.equal(
    isAutoSyncScopeCurrent(scope, {
      mediaKey: "episode-1",
      trackId: "2",
      syncedTrack: false,
    }),
    true,
  );
  assert.equal(
    isAutoSyncScopeCurrent(scope, {
      mediaKey: "episode-2",
      trackId: "2",
      syncedTrack: false,
    }),
    false,
  );
  assert.equal(
    isAutoSyncScopeCurrent(scope, {
      mediaKey: "episode-1",
      trackId: "3",
      syncedTrack: false,
    }),
    false,
  );
  assert.equal(
    isAutoSyncScopeCurrent(scope, {
      mediaKey: "episode-1",
      trackId: "9",
      syncedTrack: true,
    }),
    true,
  );
});

function mpvProperties(props: Record<string, unknown>) {
  const reads: string[] = [];
  const writes: Array<[string, unknown]> = [];
  const api = loadModule(
    "src/lib/player/mpv-properties.ts",
    {
      "@tauri-apps/api/core": {
        invoke: async (command: string, args: { name: string; value?: unknown }) => {
          if (command === "mpv_get_property") {
            reads.push(args.name);
            return props[args.name];
          }
          writes.push([args.name, args.value]);
        },
      },
      "./subtitle-fps": subtitleFps,
    },
    { window: { __TAURI_INTERNALS__: {} } },
  );
  return { api, reads, writes };
}

test("video FPS prefers the estimated rate and only sub-fps is ever written", async () => {
  const both = mpvProperties({ "estimated-vf-fps": 23.976, "container-fps": 25 });
  assert.equal(await both.api.readMpvVideoFps(), 23.976);
  assert.equal(
    await mpvProperties({ "estimated-vf-fps": 0, "container-fps": 25 }).api.readMpvVideoFps(),
    25,
  );
  assert.equal(await mpvProperties({}).api.readMpvVideoFps(), null);

  const live = mpvProperties({ "idle-active": "no", "sub-fps": 25 });
  assert.deepEqual(await live.api.readMpvSubtitleFps(), { supported: true, value: 25 });
  assert.deepEqual(
    await mpvProperties({ "idle-active": "no", "sub-fps": 0 }).api.readMpvSubtitleFps(),
    { supported: true, value: null },
  );
  assert.deepEqual(
    await mpvProperties({ "idle-active": "yes", "sub-fps": 25 }).api.readMpvSubtitleFps(),
    { supported: false, value: null },
    "an idle player reports no support",
  );
  await live.api.writeMpvSubtitleFps(25, live.api.getMpvSubtitleFpsGeneration());
  await live.api.resetMpvSubtitleFpsForTransition();
  assert.deepEqual(live.writes, [
    ["sub-fps", 25],
    ["sub-fps", 0],
  ]);
});

test("a stale FPS write from before a transition is undone", async () => {
  const p = mpvProperties({});
  const generation = p.api.getMpvSubtitleFpsGeneration();
  p.api.invalidateMpvSubtitleFpsContext();
  await assert.rejects(p.api.writeMpvSubtitleFps(25, generation), /context changed/);
  assert.deepEqual(p.writes, []);
  const beforeReset = p.api.getMpvSubtitleFpsGeneration();
  await p.api.resetMpvSubtitleFpsForTransition();
  await assert.rejects(p.api.writeMpvSubtitleFps(25, beforeReset), /context changed/);
  assert.deepEqual(p.writes, [], "a transition also outdates pending choices");
});

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

function fpsControl(options: { label?: string; engine?: "html5" | "mpv"; supported?: boolean }) {
  const listeners = new Map<string, (e: { payload: { event: string } }) => void>();
  let focused = 0;
  let supported = options.supported ?? true;
  const stop = () => {};
  const h = hookHarness(
    "src/components/player/subtitle-menu/subtitle-fps-control.tsx",
    "SubtitleFpsControl",
    {
      "@tauri-apps/api/event": {
        listen: async (name: string, fn: (e: { payload: { event: string } }) => void) => {
          listeners.set(name, fn);
          return () => {};
        },
      },
      "@tauri-apps/api/window": { getCurrentWindow: () => ({ label: options.label ?? "main" }) },
      "@/components/hover-tooltip": { HoverTooltip: "HoverTooltip" },
      "@/components/player/autosync/autosync-store": {
        useAutoSyncHandle: () => ({ status: "synced", stop }),
      },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/player/mpv-properties": {
        readMpvSubtitleFps: async () => ({ supported, value: null }),
      },
      "@/lib/player/subtitle-fps": subtitleFps,
      "./subtitle-fps-icon": { SubtitleFpsIcon: "SubtitleFpsIcon" },
      "./subtitle-fps-panel": { SubtitleFpsPanel: "SubtitleFpsPanel" },
      "react/jsx-runtime": jsx,
    },
    { window: { __TAURI_INTERNALS__: {}, addEventListener() {}, removeEventListener() {} } },
  );
  const props = { engine: options.engine ?? "mpv", track: { id: "1" }, hasSecondary: false };
  const render = () => all(h.render(props));
  const trigger = () => render().find((n) => n.props["aria-label"] === "Subtitle FPS");
  return {
    render,
    trigger,
    stop,
    emit: (event: string) => listeners.get("mpv://event")?.({ payload: { event } }),
    support: (value: boolean) => {
      supported = value;
    },
    focusTrigger(node: N) {
      node.props.ref.current = { focus: () => focused++ };
    },
    get focused() {
      return focused;
    },
  };
}

test("the FPS control appears only in the main mpv window once native support is confirmed", async () => {
  for (const options of [
    { engine: "html5" as const },
    { label: "harbor-hdr-overlay" },
    { supported: false },
  ]) {
    const c = fpsControl(options);
    c.render();
    await flushPromises();
    assert.equal(c.trigger(), undefined, JSON.stringify(options));
  }
  const c = fpsControl({});
  assert.equal(c.trigger(), undefined, "hidden until the support read answers");
  await flushPromises();
  const trigger = c.trigger()!;
  assert.ok(all(trigger).some((n) => n.type === "SubtitleFpsIcon"));
  c.focusTrigger(trigger);
  trigger.props.onClick();
  const panel = c.render().find((n) => n.type === "SubtitleFpsPanel")!;
  assert.equal(panel.props.autoSyncActive, true);
  assert.equal(panel.props.onBeforeApply, c.stop, "applying an FPS stops Auto Sync first");
  panel.props.onBack();
  assert.equal(
    c.render().find((n) => n.type === "SubtitleFpsPanel"),
    undefined,
  );
  assert.equal(c.focused, 1, "closing returns focus to the trigger");
});

test("the FPS control follows mpv's file lifecycle", async () => {
  const c = fpsControl({});
  c.render();
  await flushPromises();
  c.trigger()!.props.onClick();
  c.support(false);
  c.emit("end-file");
  assert.equal(c.trigger(), undefined, "hidden at once when the file ends");
  await flushPromises();
  c.support(true);
  c.emit("file-loaded");
  await flushPromises();
  assert.ok(c.trigger(), "back after the next file loads");
  assert.equal(
    c.render().find((n) => n.type === "SubtitleFpsPanel"),
    undefined,
    "the panel stays closed",
  );
});

function fpsPanel(state: { subtitle: number | null; video: number | null; supported?: boolean }) {
  const writes: unknown[] = [];
  const order: string[] = [];
  const h = hookHarness(
    "src/components/player/subtitle-menu/subtitle-fps-panel.tsx",
    "SubtitleFpsPanel",
    {
      "lucide-react": { ArrowLeft: "ArrowLeft", Check: "Check", Loader2: "Loader2" },
      "@/components/dropdown": { Dropdown: "Dropdown" },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/player/mpv-properties": {
        getMpvSubtitleFpsGeneration: () => 7,
        readMpvSubtitleFps: async () => ({
          supported: state.supported ?? true,
          value: state.subtitle,
        }),
        readMpvVideoFps: async () => state.video,
        writeMpvSubtitleFps: async (choice: unknown, generation: number) => {
          order.push("write");
          writes.push([choice, generation]);
        },
      },
      "@/lib/player/sub-format": { isTextSubTrack },
      "@/lib/player/subtitle-fps": subtitleFps,
      "react/jsx-runtime": jsx,
    },
    { console: { warn() {} } },
  );
  const text = { id: "1", label: "en", kind: "subtitle", selected: true, codec: "SUBRIP" };
  const render = (over: Record<string, unknown> = {}) =>
    all(
      h.render({
        engine: "mpv",
        track: text,
        hasSecondary: false,
        autoSyncActive: false,
        onBeforeApply: () => order.push("stop-auto-sync"),
        onBack() {},
        ...over,
      }),
    );
  const dropdown = (over?: Record<string, unknown>) =>
    render(over).find((n) => n.type === "Dropdown")!;
  return { render, dropdown, writes, order };
}

test("the panel shows the active correction and writes a choice after stopping Auto Sync", async () => {
  const p = fpsPanel({ subtitle: 25, video: 23.976 });
  p.render();
  await flushPromises();
  assert.equal(p.dropdown().props.value, "25");
  p.dropdown().props.onChange("auto");
  assert.ok(
    p.render().some((n) => n.props.role === "status" && n.props["aria-label"] === "Saving"),
  );
  assert.match(
    p.render().find((n) => n.type === "Loader2")!.props.className,
    /motion-reduce:animate-none/,
  );
  await flushPromises();
  assert.equal(p.dropdown().props.value, "auto");
  assert.deepEqual(p.writes, [[23.976, 7]]);
  assert.deepEqual(p.order, ["stop-auto-sync", "write"]);
  p.dropdown().props.onChange("default");
  await flushPromises();
  assert.deepEqual(p.writes.at(-1), ["default", 7]);
});

test("the panel treats a correction the player reset as none", async () => {
  for (const over of [{ autoSyncActive: true }, { hasSecondary: true }]) {
    const p = fpsPanel({ subtitle: 25, video: 23.976 });
    p.render(over);
    await flushPromises();
    assert.equal(p.dropdown(over).props.value, "default", JSON.stringify(over));
  }
  const odd = fpsPanel({ subtitle: 24.5, video: 23.976 });
  odd.render();
  await flushPromises();
  assert.equal(odd.dropdown().props.value, "custom");
  assert.equal(
    odd.render().find((n) => n.props["aria-label"] === "Custom subtitle FPS")!.props.value,
    "24.5",
  );
  const preset = fpsPanel({ subtitle: 25, video: 23.976 });
  preset.render();
  await flushPromises();
  assert.equal(
    preset.render().find((n) => n.props["aria-label"] === "Custom subtitle FPS"),
    undefined,
    "only an off-preset rate opens the custom field",
  );
});

test("Auto Sync resets subtitle FPS before it applies, and reports a failed reset", async () => {
  const order: string[] = [];
  const apply = {
    decision: { decision: "apply", reason: "fixture", pCorrect: 1 },
    tiersRun: [],
    candidate: { kind: "affine", offsetSec: 2 },
  };
  const ok = autoSyncHarness({
    outcome: apply,
    resetFps: async () => {
      order.push("reset");
    },
  });
  const track = { id: "1", lang: "en" };
  ok.render("https://media.test/a.mkv", track);
  await flushPromises();
  assert.deepEqual(order, ["reset", "reset"], "both the run and the apply reset first");
  assert.deepEqual(ok.calls, ["track 1", "delay 2"]);
  assert.equal(ok.render("https://media.test/a.mkv", track).status, "synced");

  const failing = autoSyncHarness({
    outcome: apply,
    resetFps: async () => {
      throw new Error("fixture reset failure");
    },
  });
  failing.render("https://media.test/a.mkv", track);
  await flushPromises();
  assert.deepEqual(failing.calls, []);
  assert.equal(failing.render("https://media.test/a.mkv", track).status, "error");
});

test("reverting Auto Sync restores the offset only for the media it changed", async () => {
  const apply = {
    decision: { decision: "apply", reason: "fixture", pCorrect: 1 },
    tiersRun: [],
    candidate: { kind: "affine", offsetSec: 2 },
  };
  const track = { id: "1", lang: "en" };
  const same = autoSyncHarness({ outcome: apply });
  same.render("https://media.test/a.mkv", track, 0.5);
  await flushPromises();
  same.render("https://media.test/a.mkv", track, 2).revert();
  assert.deepEqual(same.calls.slice(-2), ["track 1", "delay 0.5"]);

  const manual = autoSyncHarness({ outcome: apply });
  manual.render("https://media.test/a.mkv", track, 0.5);
  await flushPromises();
  manual.render("https://media.test/a.mkv", track, 2).suspendForManualTiming();
  manual.render("https://media.test/a.mkv", track, 2).revert();
  assert.deepEqual(manual.calls, ["track 1", "delay 2"], "manual timing keeps the offset");

  const refused = autoSyncHarness();
  refused.render("https://media.test/a.mkv", track, 0.5);
  await flushPromises();
  refused.render("https://media.test/a.mkv", track, 0.5).revert();
  assert.deepEqual(refused.calls, [], "nothing to revert when nothing changed");
});

test("a failed FPS reset before a load recreates the mpv session", async () => {
  const h = mpvBridgeHarness();
  await h.bridge.load({ url: "first.mkv" });
  assert.equal(h.commands.filter((c) => c.command === "mpv_start").length, 1);
  h.resetWith(async () => {
    throw new Error("fixture FPS failure");
  });
  await h.bridge.load({ url: "second.mkv" });
  assert.equal(h.commands.filter((c) => c.command === "mpv_start").length, 2);
});

test("a secondary subtitle switch waits for the FPS reset and drops a stale request", async () => {
  const h = mpvBridgeHarness();
  await h.bridge.load({ url: "fixture.mkv" });
  const secondary = () =>
    h.commands.filter((c) => c.command === "mpv_set_property" && c.args.name === "secondary-sid");
  const before = secondary().length;
  const blocked = deferred();
  h.resetWith(() => blocked.promise);
  h.bridge.setSecondarySubtitleTrack("2");
  await flushBridge();
  assert.equal(secondary().length, before, "nothing is written while the reset runs");
  blocked.resolve();
  await flushBridge();
  assert.deepEqual(secondary().at(-1)!.args.value, 2);

  const stale = deferred();
  h.resetWith(() => stale.promise);
  h.bridge.setSecondarySubtitleTrack("3");
  const nextLoad = h.bridge.load({ url: "next.mkv" });
  stale.resolve();
  await nextLoad;
  await flushBridge();
  assert.ok(
    !secondary().some((c) => c.args.value === 3),
    "a switch from the old media never lands",
  );

  h.resetWith(async () => {
    throw new Error("fixture FPS failure");
  });
  h.bridge.setSecondarySubtitleTrack("4");
  await flushBridge();
  assert.ok(h.errors.includes("selection-failed"));
});

test("an added subtitle that selects itself waits for the FPS reset", async () => {
  const h = mpvBridgeHarness();
  await h.bridge.load({ url: "fixture.mkv" });
  const blocked = deferred();
  h.resetWith(() => blocked.promise);
  const added = h.bridge.addSubtitle("https://subs.test/a.srt", "en", "English", true);
  await flushBridge();
  assert.ok(!h.commands.some((c) => c.command === "mpv_sub_add"));
  blocked.resolve();
  assert.equal(await added, true);
  assert.equal(h.commands.find((c) => c.command === "mpv_sub_add")!.args.select, true);
});

function forwardingBridge() {
  const sent: Array<[string, string, unknown]> = [];
  const api = loadModule("src/lib/player/mpv-forward.ts", {
    "@tauri-apps/api/core": { invoke: async () => {} },
    "@tauri-apps/api/event": {
      emitTo: async (target: string, name: string, payload: unknown) => {
        sent.push([target, name, payload]);
      },
      listen: async () => () => {},
    },
    "./bridge": { emptySnapshot },
    "@/lib/platform": { isWindowsDesktop: () => false },
    "@/lib/hdr-overlay": hdrOverlay,
  });
  return { bridge: api.createForwardingMpvBridge(), sent };
}

test("the HDR overlay forwards subtitle switches to the main window with their media key", async () => {
  const f = forwardingBridge();
  f.bridge.pushSnapshot(emptySnapshot, "media-1");
  f.bridge.setSubtitleTrack("2");
  f.bridge.setSecondarySubtitleTrack(null);
  await flushPromises();
  assert.deepEqual(f.sent, [
    ["main", hdrOverlay.HDR_STAGE_SET_SUBTITLE_TRACK, { id: "2", mediaKey: "media-1" }],
    ["main", hdrOverlay.HDR_STAGE_SET_SECONDARY_SUBTITLE_TRACK, { id: null, mediaKey: "media-1" }],
  ]);
});

test("the main window applies forwarded subtitle switches only for the current media", async () => {
  const calls: unknown[] = [];
  const listeners = new Map<string, (event: { payload: unknown }) => void>();
  const results: unknown[] = [];
  const h = hookHarness(
    "src/views/player/hdr-stage-bridge.tsx",
    "HdrStageBridge",
    {
      "@/lib/hdr-overlay": { ...hdrOverlay, hdrOverlayEmitProps: async () => {} },
      "@/lib/view": { usePlayerNavigation: () => ({}) },
      "@/lib/player/subtitle-fps": subtitleFps,
      "@tauri-apps/api/event": {
        listen: async (event: string, fn: (e: { payload: unknown }) => void) => {
          listeners.set(event, fn);
          return () => listeners.delete(event);
        },
        emitTo: async (_target: string, _name: string, payload: unknown) => results.push(payload),
      },
    },
    { window: { __TAURI_INTERNALS__: {}, setInterval: () => 0, clearInterval() {} } },
  );
  const src = {
    url: "https://media.test/a.mkv",
    meta: { id: "tt1" },
    episode: { season: 1, episode: 2 },
  };
  h.render({
    active: true,
    payload: { snap: {}, src },
    handlers: {
      setSubtitleTrack: (id: unknown) => calls.push(["main", id]),
      setSecondarySubtitleTrack: (id: unknown) => calls.push(["secondary", id]),
      addSubtitle: async (url: string) => (calls.push(["add", url]), true),
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
  const current = subtitleFps.buildSubtitleTimingMediaKey({
    sourceUrl: src.url,
    mediaId: "tt1",
    season: 1,
    episode: 2,
  });
  const fire = (name: string, payload: unknown) => listeners.get(name)!({ payload });
  fire(hdrOverlay.HDR_STAGE_SET_SUBTITLE_TRACK, { id: "2", mediaKey: "old" });
  fire(hdrOverlay.HDR_STAGE_SET_SECONDARY_SUBTITLE_TRACK, { id: "3", mediaKey: "old" });
  fire(hdrOverlay.HDR_STAGE_ADD_SUBTITLE, { requestId: "r1", url: "u", mediaKey: "old" });
  await flushPromises();
  assert.deepEqual(calls, []);
  assert.deepEqual(results, [{ requestId: "r1", ok: false }]);
  fire(hdrOverlay.HDR_STAGE_SET_SUBTITLE_TRACK, { id: "2", mediaKey: current });
  fire(hdrOverlay.HDR_STAGE_SET_SECONDARY_SUBTITLE_TRACK, { id: "3", mediaKey: current });
  fire(hdrOverlay.HDR_STAGE_ADD_SUBTITLE, { requestId: "r2", url: "u", mediaKey: current });
  await flushPromises();
  assert.deepEqual(calls, [
    ["main", "2"],
    ["secondary", "3"],
    ["add", "u"],
  ]);
  assert.deepEqual(results.at(-1), { requestId: "r2", ok: true });
});

test("the subtitle menu header carries the FPS control next to sync", () => {
  const header = hookHarness("src/components/player/subtitle-menu/menu-header.tsx", "MenuHeader", {
    "lucide-react": { X: "X" },
    "@/components/ui-icon": { UiIcon: "UiIcon" },
    "@/lib/i18n": { useT: () => (s: string) => s },
    "@/components/player/autosync/autosync-store": { useAutoSyncHandle: () => null },
    "@/components/hover-tooltip": { HoverTooltip: "HoverTooltip" },
    "./subtitle-fps-control": { SubtitleFpsControl: "SubtitleFpsControl" },
    "./sync-control": { SyncControl: "SyncControl" },
    "react/jsx-runtime": jsx,
  }).render({
    engine: "html5",
    count: 1,
    selectedTrack: { id: "1" },
    hasSecondary: true,
    onClose() {},
  });
  const nodes = all(header);
  const control = nodes.find((n) => n.type === "SubtitleFpsControl")!;
  assert.deepEqual(
    [control.props.engine, control.props.track, control.props.hasSecondary],
    ["html5", { id: "1" }, true],
  );
  assert.ok(nodes.indexOf(nodes.find((n) => n.type === "SyncControl")!) < nodes.indexOf(control));
});

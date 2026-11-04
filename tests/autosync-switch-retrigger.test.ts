// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import * as subtitleFps from "../src/lib/player/subtitle-fps.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

const noop = () => {};
const cues = Array.from({ length: 6 }, (_, i) => ({ start: i * 5, end: i * 5 + 2, text: `${i}` }));

function setup() {
  const runs: boolean[] = [];
  const outcome = {
    decision: { decision: "refuse", reason: "fixture", pCorrect: 0 },
    tiersRun: [],
    candidate: null,
  };
  const h = hookHarness(
    "src/views/player/hooks/use-auto-sync.ts",
    "useAutoSync",
    {
      "@tauri-apps/api/core": { convertFileSrc: (u: string) => u, invoke: async () => {} },
      "@/lib/debug": { dwarn: noop },
      "@/lib/subtitles/parser": { fetchAndParse: async () => cues },
      "@/lib/subtitles/serialize": { toSrt: () => "", toVtt: () => "" },
      "@/lib/subtitles/autosync/pipeline": {
        runAutoSync: async (_ctx: unknown, _ports: unknown, opts: { tryHarder: boolean }) => {
          runs.push(opts.tryHarder);
          return outcome;
        },
      },
      "@/lib/subtitles/autosync/context": {
        buildTierPorts: () => ({}),
        defaultOsConfig: () => null,
      },
      "@/lib/subtitles/autosync/pivot-runtime": {
        preferAutoSyncOutcome: (base: unknown) => base,
        runExperimentalPivotAutoSync: async () => null,
      },
      "@/lib/subtitles/autosync/crowd-db": {
        crowdConfigFromSettings: () => null,
        reportCrowdFeedback: noop,
        reportVerifiedSync: noop,
      },
      "@/lib/subtitles/autosync/torrent-sync": {
        classifyTorrentSource: () => "direct",
        scheduleProgressiveTorrentSync: () => ({ stop: noop }),
        sourceKindFor: () => "http",
      },
      "@/lib/subtitles/autosync/opensubtitles": { resolveSwapCues: async () => null },
      "@/lib/subtitles/autosync/fp-gate": { isDelayOnlyTransform: () => true },
      "@/lib/subtitles/autosync/html5-sync": { transformCues: (c: unknown) => c },
      "@/lib/subtitles/autosync/drift-monitor": {
        DriftMonitor: class {},
        makeTauriDriftPorts: () => ({}),
      },
      "@/lib/player/mpv-properties": { resetMpvSubtitleFpsForTransition: async () => {} },
      "@/lib/player/subtitle-fps": subtitleFps,
      "@/lib/player/sub-format": { isAssTrack: () => false },
      "@/lib/subtitles/autosync/preflight-gate": { automaticAutoSyncMayStart: () => true },
      "./use-auto-sync.helpers": {
        buildContext: () => ({}),
        isLoopback: () => false,
        outcomeScore: () => 0,
        toDriftState: () => ({}),
      },
    },
    { window: {} },
  );
  const bridge = {
    getSelectedTrackCues: () => cues,
    getSelectedTrackUrl: () => "https://subs.test/track.srt",
  };
  const bridgeRef = { current: bridge };
  const settings = {
    subtitleAutoSync: true,
    preferredSubLangs: [],
    autoSyncApplyStructural: false,
  };
  const render = (url: string, track: { id: string; lang: string }) =>
    h.render({
      bridgeRef,
      src: { url, meta: { id: "tt100" } },
      snap: {
        ...emptySnapshot,
        durationSec: 1200,
        subtitleTracks: [{ ...track, external: true, selected: true }],
      },
      engine: "mpv",
      settings,
      authKey: null,
      subtitlePreflightSettled: true,
    });
  return { runs, render };
}

test("auto-fire happens once per media item and language, not on every track switch", async () => {
  const { runs, render } = setup();
  render("https://media.test/a.mkv", { id: "1", lang: "en" });
  await flushPromises();
  assert.deepEqual(runs, [false], "the automatic pass is the low-effort one");
  render("https://media.test/a.mkv", { id: "2", lang: "fr" });
  await flushPromises();
  assert.equal(runs.length, 2, "a new language fires once");
  render("https://media.test/a.mkv", { id: "3", lang: "en" });
  await flushPromises();
  assert.equal(runs.length, 2, "another track in an already fired language does not refire");
  render("https://media.test/b.mkv", { id: "3", lang: "en" });
  await flushPromises();
  assert.equal(runs.length, 3, "a new media item starts over");
});

test("a manual (forced) run starts fresh and tries hard immediately", async () => {
  const { runs, render } = setup();
  const track = { id: "1", lang: "en" };
  render("https://media.test/a.mkv", track);
  await flushPromises();
  assert.equal(render("https://media.test/a.mkv", track).status, "declined");
  render("https://media.test/a.mkv", track).run();
  assert.equal(
    render("https://media.test/a.mkv", track).status,
    "analyzing",
    "a forced run shows analyzing instead of retrying silently",
  );
  await flushPromises();
  assert.deepEqual(runs, [false, true]);
});

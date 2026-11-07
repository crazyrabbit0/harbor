import { emptySnapshot } from "../../src/lib/player/bridge.ts";
import * as subtitleFps from "../../src/lib/player/subtitle-fps.ts";
import { hookHarness } from "./hook-harness.ts";

const noop = () => {};
const cues = Array.from({ length: 6 }, (_, i) => ({ start: i * 5, end: i * 5 + 2, text: `${i}` }));
const refuse = { decision: { decision: "refuse", reason: "fixture", pCorrect: 0 }, tiersRun: [] };

/** Runs use-auto-sync with a scripted pipeline outcome and FPS reset; `calls` records bridge writes. */
export function autoSyncHarness(
  options: {
    outcome?: unknown;
    resetFps?: () => Promise<void>;
    /** Selected track URL the bridge reports (default an .srt). */
    trackUrl?: string;
    /** false routes every candidate through the structural rewrite path. */
    delayOnly?: boolean;
  } = {},
) {
  const runs: boolean[] = [];
  const calls: string[] = [];
  const h = hookHarness(
    "src/views/player/hooks/use-auto-sync.ts",
    "useAutoSync",
    {
      "@tauri-apps/api/core": {
        convertFileSrc: (u: string) => u,
        invoke: async (command: string) => void calls.push(command),
      },
      "@tauri-apps/api/path": {
        join: async (...parts: string[]) => parts.join("/"),
        tempDir: async () => "/tmp",
      },
      "@/lib/debug": { dwarn: noop },
      "@/lib/subtitles/parser": { fetchAndParse: async () => cues },
      "@/lib/subtitles/serialize": {
        toSrt: () => (calls.push("serialize srt"), ""),
        toVtt: () => (calls.push("serialize vtt"), ""),
      },
      "@/lib/subtitles/autosync/pipeline": {
        runAutoSync: async (_ctx: unknown, _ports: unknown, opts: { tryHarder: boolean }) => {
          runs.push(opts.tryHarder);
          return options.outcome ?? { ...refuse, candidate: null };
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
      "@/lib/subtitles/autosync/fp-gate": { isDelayOnlyTransform: () => options.delayOnly ?? true },
      "@/lib/subtitles/autosync/html5-sync": { transformCues: (c: unknown) => c },
      "@/lib/subtitles/autosync/drift-monitor": {
        DriftMonitor: class {},
        makeTauriDriftPorts: () => ({}),
      },
      "@/lib/player/mpv-properties": {
        resetMpvSubtitleFpsForTransition: options.resetFps ?? (async () => {}),
      },
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
    getSelectedTrackUrl: () => options.trackUrl ?? "https://subs.test/track.srt",
    setSubDelay: (sec: number) => calls.push(`delay ${sec}`),
    setSubtitleTrack: (id: string) => calls.push(`track ${id}`),
    addSubtitle: async () => (calls.push("add"), true),
  };
  const bridgeRef = { current: bridge };
  const settings = {
    subtitleAutoSync: true,
    preferredSubLangs: [],
    autoSyncApplyStructural: false,
  };
  const render = (
    url: string,
    track: { id: string; lang: string; externalFilename?: string },
    subDelaySec = 0,
  ) =>
    h.render({
      bridgeRef,
      src: { url, meta: { id: "tt100" } },
      snap: {
        ...emptySnapshot,
        durationSec: 1200,
        subDelaySec,
        subtitleTracks: [{ ...track, external: true, selected: true }],
      },
      engine: "mpv",
      settings,
      authKey: null,
      subtitlePreflightSettled: true,
    });
  return { runs, calls, render };
}

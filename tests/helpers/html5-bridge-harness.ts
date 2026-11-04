import { readFileSync } from "node:fs";
import ts from "typescript";
import * as bridgeTypes from "../../src/lib/player/bridge.ts";
import * as parser from "../../src/lib/subtitles/parser.ts";
import * as sdh from "../../src/lib/subtitles/sdh-filter.ts";
import * as selection from "../../src/lib/player/subtitle-selection.ts";
import * as seedBatch from "../../src/lib/subtitles/seed-batch.ts";
import * as audioTracks from "../../src/lib/player/html5/audio-tracks.ts";
import * as errorMap from "../../src/lib/player/html5/error-map.ts";
import type { SubCue } from "../../src/lib/subtitles/parser.ts";

export class FakeVideo {
  currentTime = 0;
  duration = 600;
  paused = true;
  ended = false;
  muted = false;
  volume = 1;
  playbackRate = 1;
  readyState = 4;
  videoWidth = 1920;
  videoHeight = 1080;
  error: { code: number; message: string } | null = null;
  buffered = { length: 0, start: () => 0, end: () => 0 };
  style: Record<string, string> = {};
  firstChild = null;
  listeners = new Map<string, Set<() => void>>();
  addEventListener(name: string, fn: () => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
  }
  removeEventListener(name: string, fn: () => void) {
    this.listeners.get(name)?.delete(fn);
  }
  dispatch(name: string) {
    for (const fn of this.listeners.get(name) ?? []) fn();
  }
  pause() {
    this.paused = true;
  }
  async play() {
    this.paused = false;
  }
  removeAttribute() {}
  load() {}
}

type HarnessOptions = {
  locked?: () => boolean;
  safeProviderUrl?: (url: string) => boolean;
  /** Holds each subtitle load until the test resolves it; keyed by URL. */
  gate?: Map<string, Promise<void>>;
};

/** Compiles the real html5 bridge; `prepared` maps a subtitle URL to its cues or an Error. */
export function html5BridgeHarness(
  prepared: Record<string, SubCue[] | Error> = {},
  options: HarnessOptions = {},
) {
  const warnings: unknown[][] = [];
  const sessionHandlers = new Map<string, (details?: unknown) => void>();
  const load = async (url: string) => {
    await options.gate?.get(url);
    const result = prepared[url] ?? [];
    if (result instanceof Error) throw result;
    return result;
  };
  const source = readFileSync(
    new URL("../../src/lib/player/html5/bridge.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const noop = () => {};
  const modules: Record<string, unknown> = {
    "@/lib/player/stream-libs": { loadHls: noop, loadMpegts: noop },
    "../bridge": bridgeTypes,
    "@/lib/subtitles/parser": {
      ...parser,
      fetchAndParse: load,
    },
    "@/lib/subtitles/prepare": {
      SubtitlePreparationError: class extends Error {},
      prepareSubtitle: async ({ url }: { url: string }) => ({
        cues: await load(url),
        playableUrl: `prepared:${url}`,
        format: "srt",
        encoding: "utf-8",
        cleanup: noop,
      }),
    },
    "@/lib/subtitles/sdh-filter": sdh,
    "@/lib/subtitles/provider-auth": { subtitleTrackDownloadHeaders: () => undefined },
    "@/lib/subtitles/prepared-registry": { takePreparedSubtitle: () => null },
    "@/lib/subtitles/pending-subs": { clearPendingSub: noop, markPendingSub: noop },
    "@/lib/subtitles/translation-jobs": { registerTranslationJob: noop },
    "./audio-tracks": audioTracks,
    "./error-map": errorMap,
    "@/lib/subtitles/subtitle-memory": { noteSubtitleOrigin: noop },
    "./pip": { mountCustomPip: noop },
    "@/lib/perf/playback-trace": { finishPlaybackTrace: noop, markPlaybackTrace: noop },
    "@/lib/player/interaction-lock": {
      isPlayerInteractionLocked: options.locked ?? (() => false),
    },
    "@/lib/player/subtitle-selection": selection,
    "@/lib/subtitles/seed-batch": seedBatch,
    "@/lib/subtitles/provider-url": {
      isSafeProviderSubtitleUrl: options.safeProviderUrl ?? (() => true),
    },
  };
  const video = new FakeVideo();
  const globals = {
    document: { createElement: () => video },
    window: {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: noop,
    },
    navigator: {
      mediaSession: {
        setActionHandler: (name: string, fn: (details?: unknown) => void) =>
          sessionHandlers.set(name, fn),
      },
    },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2, HAVE_FUTURE_DATA: 3 },
    console: { ...console, warn: (...args: unknown[]) => warnings.push(args) },
    MediaMetadata: class {},
  };
  const exports: { createHtml5Bridge?: () => bridgeTypes.PlayerBridge } = {};
  new Function("require", "exports", ...Object.keys(globals), compiled)(
    (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
    },
    exports,
    ...Object.values(globals),
  );
  const bridge = exports.createHtml5Bridge!();
  bridge.attach({ appendChild: noop, contains: () => true, removeChild: noop } as never);
  let snap = bridgeTypes.initialPlayerSnapshot();
  bridge.subscribe((s) => {
    snap = s;
  });
  return {
    bridge,
    video,
    warnings,
    sessionHandlers,
    snapshot: () => snap,
    /** Moves playback to `sec` and makes the bridge read the cue there (setSubDelay ticks cues). */
    at(sec: number) {
      video.currentTime = sec;
      video.dispatch("timeupdate");
      bridge.setSubDelay(snap.subDelaySec);
    },
  };
}

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import * as language from "../src/lib/subtitles/language.ts";
import * as autoload from "../src/lib/subtitles/autoload.ts";
import * as autoloadRun from "../src/lib/subtitles/autoload-run.ts";
import * as trackSelection from "../src/lib/subtitles/track-selection.ts";
import { deferred } from "./helpers/mpv-bridge-harness.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

type FetchCall = { videoHash?: string; shouldAutoSelect?: () => boolean };

function setup(
  options: { settings?: Record<string, unknown>; url?: string; picks?: { url: string } } = {},
) {
  const fetches: FetchCall[] = [];
  const hash = deferred<{ hash: string; size: number }>();
  const unified = deferred<void>();
  const invokes: string[] = [];
  const warnings: unknown[][] = [];
  const noop = () => {};
  const mocks: Record<string, unknown> = {
    "@tauri-apps/api/core": {
      invoke: (cmd: string) => {
        invokes.push(cmd);
        return hash.promise;
      },
    },
    "@/lib/subtitles/language": language,
    "@/lib/subtitles/fetch-into-player": {
      fetchSubtitlesIntoPlayer: async (p: FetchCall) => {
        fetches.push(p);
        if (!p.videoHash) await unified.promise;
        return { found: 0, added: 0, generated: [], selected: p.videoHash ? null : options.picks };
      },
      streamHintsOf: () => ({}),
    },
    "@/lib/subtitles/provider-label": { subtitleStreamDescriptor: () => null },
    "@/components/player/subtitle-menu/subtitle-search-store": { publishSubtitleSearch: noop },
    "@/components/player/subtitle-menu/subtitle-context-store": { publishSubtitleContext: noop },
    "@/lib/player-prefs": { readPlayerPrefs: () => null },
    "@/lib/player/original-audio": {
      audioLanguageOrder: (langs: string[]) => langs,
      resolveOriginalLanguage: async () => null,
    },
    "@/lib/providers/tmdb": { tmdbImdbId: async () => null },
    "@/lib/subtitles/addon-source": { gatherSubtitleAddons: async () => [] },
    "@/lib/streams/stream-ids": { buildStreamIds: (id: string) => [id] },
    "@/lib/subtitles/autoload": autoload,
    "@/lib/subtitles/autoload-run": autoloadRun,
    "@/lib/subtitles/anime-numbering": { resolveAnimeSearchCoords: async () => null },
    "@/lib/subtitles/track-selection": trackSelection,
    "@/lib/subtitles/added-subs": { markAddedSub: noop },
    "@/lib/player/imported-subs": { markImportedSub: noop },
    "@/lib/subtitles/provider-auth": { bindSubtitleDownloadAuth: async () => undefined },
    "@/lib/subtitles/subtitle-memory": {
      readRememberedSub: () => null,
      rememberedSubAppliesToStream: () => false,
      rememberedSubtitleLoadMetadata: () => ({}),
      rememberedSubtitleIsLocal: () => false,
      subtitleMediaKey: () => "key",
    },
  };
  const h = hookHarness("src/views/player/hooks/use-track-autoload.ts", "useTrackAutoload", mocks, {
    window: { setTimeout: () => 1, clearTimeout: noop },
    console: { info: noop, warn: (...args: unknown[]) => warnings.push(args) },
  });
  const bridge = {
    canAutoSelectSubtitle: () => true,
    setSubtitleTrack: noop,
    setAudioTrack: noop,
    setAudioNormalize: noop,
    setSubDelay: noop,
    setRate: noop,
  };
  let tracks: Array<Record<string, unknown>> = [];
  const settings = {
    preferredSubLangs: ["en"],
    preferredLanguages: ["en"],
    subtitleAutoSync: false,
    subtitleAutoUpgrade: true,
    ...options.settings,
  };
  const render = () =>
    h.render({
      bridgeRef: { current: bridge },
      src: { url: options.url ?? "https://media.test/a.mkv", meta: { id: "tt1" } },
      snap: { ...emptySnapshot, durationSec: 1200, subtitleTracks: tracks },
      engine: "mpv",
      settings,
      authKey: null,
    }) as { subtitlePreflightSettled: boolean; subtitleSearchActive: boolean };
  return {
    fetches,
    hash,
    unified,
    invokes,
    warnings,
    render,
    searching: () => render().subtitleSearchActive,
    setTracks: (next: typeof tracks) => {
      tracks = next;
    },
  };
}

async function settle(h: ReturnType<typeof setup>) {
  for (let i = 0; i < 4; i++) {
    h.render();
    await flushPromises();
  }
}

test("the preflight flag settles only after the first subtitle search finishes", async () => {
  const h = setup();
  await settle(h);
  assert.equal(h.render().subtitlePreflightSettled, false, "still searching");
  h.unified.resolve();
  await settle(h);
  assert.equal(h.render().subtitlePreflightSettled, true);
});

test("moviehash enrichment runs without timing autosync and uses the late-upgrade lease", async () => {
  const h = setup({ settings: { subtitleAutoSync: false } });
  await settle(h);
  h.unified.resolve();
  h.hash.resolve({ hash: "abc", size: 42 });
  await settle(h);
  assert.deepEqual(h.invokes, ["compute_moviehash"]);
  const hashStage = h.fetches.find((f) => f.videoHash === "abc");
  assert.ok(hashStage, "the hash stage runs even with autosync off");
  h.setTracks([{ id: "user", lang: "en", external: true, selected: true }]);
  h.render();
  assert.equal(
    hashStage.shouldAutoSelect?.(),
    false,
    "a late hash match never replaces a track the user picked",
  );
});

test("a late hash match keeps the automatic pick when auto-upgrade is off", async () => {
  const picked = "https://subs.test/auto.srt";
  const h = setup({ settings: { subtitleAutoUpgrade: false }, picks: { url: picked } });
  await settle(h);
  h.unified.resolve();
  await settle(h);
  h.setTracks([{ id: "auto", lang: "en", external: true, url: picked, selected: true }]);
  h.render();
  h.hash.resolve({ hash: "abc", size: 42 });
  await settle(h);
  const [first, hashStage] = h.fetches;
  assert.equal(first.shouldAutoSelect?.(), true, "the normal stage may still upgrade its own pick");
  assert.equal(hashStage.shouldAutoSelect?.(), false);
});

test("a local or loopback stream is never hashed and later reruns cannot add a hash stage", async () => {
  const h = setup({ url: "http://127.0.0.1:11470/abc/0" });
  await settle(h);
  h.unified.resolve();
  await settle(h);
  assert.deepEqual(h.invokes, []);
  assert.equal(h.searching(), false, "no hash stage is left counted as a running search");
});

test("autoloaded external candidates cannot override the embedded preference", async () => {
  const embedded = { id: "emb", lang: "en", external: false, selected: true };
  const preferring = setup({ settings: { preferEmbeddedSubs: true } });
  preferring.setTracks([embedded]);
  await settle(preferring);
  assert.equal(preferring.fetches[0].shouldAutoSelect?.(), false);

  const neutral = setup({ settings: { preferEmbeddedSubs: false } });
  neutral.setTracks([{ ...embedded, selected: false }]);
  await settle(neutral);
  assert.equal(neutral.fetches[0].shouldAutoSelect?.(), true);
});

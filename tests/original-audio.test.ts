// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import * as autoload from "../src/lib/subtitles/autoload.ts";
import * as autoloadRun from "../src/lib/subtitles/autoload-run.ts";
import * as language from "../src/lib/subtitles/language.ts";
import * as trackSelection from "../src/lib/subtitles/track-selection.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import {
  audioLanguageOrder,
  originalLanguageForMeta,
  originalLanguageFromFind,
  resolveOriginalLanguage,
  usableOriginalLanguage,
} from "../src/lib/player/original-audio.ts";
import { pickBestTrack } from "../src/lib/subtitles/language.ts";

test("original language normalizes codes and ignores TMDB's no-language marker", () => {
  assert.equal(usableOriginalLanguage("JA"), "ja");
  assert.equal(usableOriginalLanguage("es"), "es");
  assert.equal(usableOriginalLanguage("xx"), null);
  assert.equal(usableOriginalLanguage(""), null);
  assert.equal(usableOriginalLanguage(undefined), null);
});

test("a TMDB find response yields the hit matching the title type", () => {
  const data = {
    movie_results: [{ original_language: "fr" }],
    tv_results: [{ original_language: "ko" }],
  };
  assert.equal(originalLanguageFromFind(data, "movie"), "fr");
  assert.equal(originalLanguageFromFind(data, "series"), "ko");
  assert.equal(
    originalLanguageFromFind({ tv_results: [{ original_language: "de" }] }, "movie"),
    "de",
  );
  assert.equal(originalLanguageFromFind({}, "movie"), null);
  assert.equal(originalLanguageFromFind(null, "movie"), null);
});

test("meta-carried and anime ids resolve without a network call", async () => {
  assert.equal(originalLanguageForMeta({ id: "tmdb:movie:1", originalLanguage: "es" }), "es");
  assert.equal(originalLanguageForMeta({ id: "kitsu:1", originalLanguage: undefined }), "ja");
  assert.equal(originalLanguageForMeta({ id: "tt0000001", originalLanguage: undefined }), null);
  assert.equal(await resolveOriginalLanguage({ id: "kitsu:1", type: "series" }, null, ""), "ja");
  assert.equal(await resolveOriginalLanguage({ id: "tt0000001", type: "movie" }, null, ""), null);
});

test("remembered pick leads, then the original language, then the user's list", () => {
  assert.deepEqual(audioLanguageOrder(["English", "Japanese"], null, null), [
    "English",
    "Japanese",
  ]);
  assert.deepEqual(audioLanguageOrder(["English"], null, "es"), ["es", "English"]);
  assert.deepEqual(audioLanguageOrder(["English", "es"], "English", "es"), ["English", "es"]);
});

test("a dubbed release lands on the original-language track", () => {
  const tracks = [
    { id: "1", lang: "eng", default: true },
    { id: "2", lang: "spa" },
  ];
  assert.equal(pickBestTrack(tracks, audioLanguageOrder(["English"], null, null))?.id, "1");
  assert.equal(pickBestTrack(tracks, audioLanguageOrder(["English"], null, "es"))?.id, "2");
  assert.equal(pickBestTrack(tracks, audioLanguageOrder(["English"], "eng", "es"))?.id, "1");
  const noOriginal = [{ id: "1", lang: "eng" }];
  assert.equal(pickBestTrack(noOriginal, audioLanguageOrder(["English"], null, "es"))?.id, "1");
});

function trackAutoloadHarness(originalLanguage: Promise<string | null>) {
  const noop = () => {};
  const pending = () => new Promise<never>(noop);
  const audioPicks: string[] = [];
  const h = hookHarness(
    "src/views/player/hooks/use-track-autoload.ts",
    "useTrackAutoload",
    {
      "@tauri-apps/api/core": { invoke: pending },
      "@/lib/subtitles/language": language,
      "@/lib/subtitles/fetch-into-player": {
        fetchSubtitlesIntoPlayer: pending,
        streamHintsOf: () => ({}),
      },
      "@/lib/subtitles/provider-label": { subtitleStreamDescriptor: () => null },
      "@/components/player/subtitle-menu/subtitle-search-store": { publishSubtitleSearch: noop },
      "@/components/player/subtitle-menu/subtitle-context-store": { publishSubtitleContext: noop },
      "@/lib/player-prefs": { readPlayerPrefs: () => null },
      "@/lib/player/original-audio": {
        audioLanguageOrder,
        resolveOriginalLanguage: () => originalLanguage,
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
    },
    { window: { setTimeout: () => 1, clearTimeout: noop }, console: { info: noop, warn: noop } },
  );
  const bridge = {
    canAutoSelectSubtitle: () => true,
    setSubtitleTrack: noop,
    setAudioTrack: (id: string) => audioPicks.push(id),
    setAudioNormalize: noop,
    setSubDelay: noop,
    setRate: noop,
  };
  const audioTracks = [
    { id: "1", lang: "eng", default: true, selected: true },
    { id: "2", lang: "spa" },
  ];
  const settings = { preferredLanguages: ["English"], preferOriginalAudio: true };
  const props = {
    bridgeRef: { current: bridge },
    src: { url: "https://media.test/a.mkv", meta: { id: "tt1", type: "movie" } },
    snap: { ...emptySnapshot, durationSec: 1200, audioTracks, subtitleTracks: [] },
    engine: "mpv",
    settings,
    authKey: null,
  };
  return { audioPicks, render: () => h.render(props) };
}

test("autoload re-runs track selection once the original language resolves", async () => {
  let resolveLanguage!: (lang: string | null) => void;
  const h = trackAutoloadHarness(new Promise((resolve) => (resolveLanguage = resolve)));
  h.render();
  await flushPromises();
  h.render();
  assert.deepEqual(h.audioPicks, [], "the default English track stays while the lookup runs");
  resolveLanguage("es");
  await flushPromises();
  h.render();
  assert.deepEqual(h.audioPicks, ["2"]);
});

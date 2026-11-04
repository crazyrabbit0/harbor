// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { filterTracksByPreferredLanguage, isKnownLanguage } from "../src/lib/subtitles/language.ts";
import { subtitleLanguage } from "../src/lib/local-library/player-src.ts";
import { fetchSubtitlesIntoPlayer } from "../src/lib/subtitles/fetch-into-player.ts";
import type { SubResult } from "../src/lib/subtitles/types.ts";
import { flushPromises } from "./helpers/hook-harness.ts";
import {
  all,
  loadAddonProvider,
  loadAddonSource,
  loadSubtitleSearch,
  renderSubtitleModal,
  searchSectionHarness,
  subtitleMenuHarness,
  subtitles,
  type FakeFetch,
} from "./helpers/subtitle-addon-harness.ts";

const BASE = "https://addon.test";
const addon = (name: string, manifest: Record<string, unknown>) => ({
  transportUrl: `${BASE}/${name}/manifest.json`,
  manifest: { id: name, name, ...manifest },
});
const sub = (id: string, lang = "eng") => ({ id, url: `https://subs.test/${id}.srt`, lang });

function recordingFetch(answer: (url: string) => Promise<any> = () => subtitles([sub("a")])) {
  const urls: string[] = [];
  const fetch: FakeFetch = (url) => (urls.push(url), answer(url));
  return { urls, fetch };
}

const episode = {
  type: "series",
  season: 1,
  episode: 5,
  candidateIds: ["tt1:1:5", "mal:7:5"],
} as const;

test("an addon that declares subtitles is never dropped for manifest metadata", async () => {
  const { urls, fetch } = recordingFetch();
  const { searchAddons } = loadAddonProvider(fetch);
  const movieOnly = addon("movies", { resources: ["subtitles"], types: ["movie"] });
  const results = await searchAddons([movieOnly], episode, 1_000);
  assert.deepEqual(urls, [`${BASE}/movies/subtitles/series/tt1:1:5.json`]);
  assert.deepEqual(
    results.map((result: SubResult) => result.url),
    ["https://subs.test/a.srt"],
  );
});

test("the strict manifest match is still tried first", async () => {
  const { urls, fetch } = recordingFetch();
  const { searchAddons } = loadAddonProvider(fetch);
  const malOnly = addon("mal", {
    resources: [{ name: "subtitles", types: ["series"], idPrefixes: ["mal"] }],
  });
  const custom = addon("custom", {
    resources: [{ name: "subtitles", types: ["series"], idPrefixes: ["custom"] }],
  });
  await searchAddons([malOnly], episode, 1_000);
  await searchAddons([custom], { ...episode, stremioId: "custom:9" }, 1_000);
  assert.deepEqual(urls, [
    `${BASE}/mal/subtitles/series/mal:7:5.json`,
    `${BASE}/custom/subtitles/series/custom:9:1:5.json`,
  ]);
});

test("addons providing no subtitles resource are still excluded", async () => {
  const { urls, fetch } = recordingFetch();
  const { searchAddons } = loadAddonProvider(fetch);
  const streams = addon("streams", { resources: ["stream"], types: ["series"] });
  assert.deepEqual(await searchAddons([streams], episode, 1_000), []);
  assert.deepEqual(urls, []);
});

const playing = {
  candidateIds: ["kitsu:1:5"],
  stremioId: "kitsu:1",
  filename: "Show.S01E05.mkv",
  searchSeason: 1,
  searchEpisode: 5,
};

test("the player subtitle modal passes the playing content ids to addons", async () => {
  const section = searchSectionHarness(playing);
  section.render();
  await flushPromises();
  section.render();
  assert.equal(section.searches.length, 1);
  assert.deepEqual(section.searches[0].candidateIds, ["kitsu:1:5"]);
  assert.equal(section.searches[0].stremioId, "kitsu:1");
});

test("the modal only reuses playing ids when the target is what is playing", async () => {
  const section = searchSectionHarness(playing);
  section.render();
  await flushPromises();
  const tree = section.render();
  const bar = all(tree).find((node) => node.type === "TargetBar")!;
  bar.props.onEpisode(6);
  assert.equal(section.searches.length, 2);
  assert.equal(section.searches[1].episode, 6);
  assert.equal(section.searches[1].candidateIds, undefined);
  assert.equal(section.searches[1].stremioId, undefined);
});

test("one slow addon manifest cannot drop every other local addon", async (t: any) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const subtitleManifest = (name: string) => ({ name, resources: ["subtitles"] });
  const { gatherSubtitleAddons } = loadAddonSource(
    [
      { transportUrl: "hang" },
      { transportUrl: "cached", manifest: subtitleManifest("Cached") },
      { transportUrl: "fast" },
    ],
    (url) => (url === "fast" ? Promise.resolve(subtitleManifest("Fast")) : new Promise(() => {})),
  );
  let addons: { manifest: { name: string } }[] | undefined;
  void gatherSubtitleAddons(null).then((list: typeof addons) => (addons = list));
  await flushPromises();
  assert.equal(addons, undefined, "the hanging manifest is still within its own timeout");
  t.mock.timers.tick(16_000);
  await flushPromises();
  assert.deepEqual(
    addons?.map((item) => item.manifest.name),
    ["Cached", "Fast"],
  );
});

test("a cached manifest resolves without any network wait", async () => {
  const fetched: string[] = [];
  const { gatherSubtitleAddons } = loadAddonSource(
    [{ transportUrl: "cached", manifest: { name: "Cached", resources: ["subtitles"] } }],
    async (url) => (fetched.push(url), null),
  );
  let addons: { manifest: { name: string } }[] | undefined;
  void gatherSubtitleAddons(null).then((list: typeof addons) => (addons = list));
  await flushPromises();
  assert.deepEqual(
    addons?.map((item) => item.manifest.name),
    ["Cached"],
  );
  assert.deepEqual(fetched, []);
});

const movie = { type: "movie", imdbId: "tt1" } as const;
const slowAndFast = () => {
  const fast = addon("fast", { resources: ["subtitles"], types: ["movie"] });
  const slow = addon("slow", { resources: ["subtitles"], types: ["movie"] });
  const fetch: FakeFetch = (url) =>
    url.includes("/slow/") ? new Promise(() => {}) : subtitles([sub("fast")]);
  return { fast, slow, fetch };
};

test("one slow subtitle addon cannot discard faster addon results", async (t: any) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { fast, slow, fetch } = slowAndFast();
  const { searchAddons } = loadAddonProvider(fetch);
  let combined: SubResult[] | undefined;
  void searchAddons([slow, fast], movie, 1_000).then((list: SubResult[]) => (combined = list));
  await flushPromises();
  t.mock.timers.tick(1_000);
  await flushPromises();
  assert.deepEqual(
    combined?.map((result) => result.title),
    ["fast"],
  );

  const { searchSubtitles } = loadSubtitleSearch(fetch);
  const partials: { titles: string[]; pending: number }[] = [];
  const done = searchSubtitles(movie, {
    providers: { opensubtitles: false },
    addons: [slow, fast],
    preferredLangs: ["en"],
    timeoutMs: 8_000,
    onPartial: (results: SubResult[], pending: number) =>
      partials.push({ titles: results.map((result) => result.title!), pending }),
  });
  await flushPromises();
  assert.deepEqual(partials, [{ titles: ["fast"], pending: 1 }]);
  t.mock.timers.tick(8_000);
  assert.deepEqual(
    (await done).map((result: SubResult) => result.title),
    ["fast"],
  );
});

test("an enriched addon timeout still falls back to the standard subtitle endpoint", async (t: any) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const plain = addon("plain", { resources: ["subtitles"], types: ["movie"] });
  const { urls, fetch } = recordingFetch((url) =>
    url.includes("filename=") ? new Promise(() => {}) : subtitles([sub("bare")]),
  );
  const { searchAddons } = loadAddonProvider(fetch);
  let results: SubResult[] | undefined;
  void searchAddons([plain], { ...movie, filename: "Movie.mkv" }, 9_000).then(
    (list: SubResult[]) => (results = list),
  );
  await flushPromises();
  t.mock.timers.tick(3_000);
  await flushPromises();
  assert.deepEqual(urls, [
    `${BASE}/plain/subtitles/movie/tt1/filename=Movie.mkv.json`,
    `${BASE}/plain/subtitles/movie/tt1.json`,
  ]);
  assert.deepEqual(
    results?.map((result) => result.url),
    ["https://subs.test/bare.srt"],
  );
});

test("automatic subtitle loading limits each preferred language independently", async () => {
  const offer = (lang: string, index: number): SubResult => ({
    id: `${lang}${index}`,
    url: `https://subs.test/${lang}/${index}.srt`,
    lang,
    source: "opensubtitles",
    format: "srt",
  });
  const offers = ["en", "fr"].flatMap((lang) =>
    Array.from({ length: 20 }, (_, index) => offer(lang, index)),
  );
  const added: string[] = [];
  await fetchSubtitlesIntoPlayer(
    {
      bridge: { addSubtitle: async (_url: string, lang: string) => (added.push(lang), true) },
      src: { url: "https://media.test/movie.mkv", meta: { id: "tt1", type: "movie", name: "M" } },
      settings: { subProvidersEnabled: {} },
      addons: [],
      langs: ["en", "fr"],
      searchImdbId: "tt1",
      candidateIds: [],
      isActive: () => true,
    } as never,
    {
      search: async () => offers,
      prepare: async (input: { url: string }) =>
        ({
          originalUrl: input.url,
          playableUrl: `memory:${input.url}`,
          format: "srt",
          cues: [{ start: 1, end: 2, text: "one" }],
          text: "",
          encoding: "utf-8",
          encodingHealth: 1,
          encodingDiagnostics: [],
          archive: false,
          cleanup: () => {},
        }) as never,
      preflightProbe: async () => ({ status: "unknown", reason: "insufficient-data" }) as never,
    },
  );
  const count = (lang: string) => added.filter((value) => value === lang).length;
  assert.deepEqual({ en: count("en"), fr: count("fr") }, { en: 15, fr: 15 });
});

test("the subtitle menu only keeps configured languages", () => {
  const tracks = [
    { id: "en", lang: "eng" },
    { id: "ar", lang: "Arabic" },
    { id: "es", lang: "spa" },
    { id: "fr", lang: "French" },
    { id: "untagged" },
  ];
  assert.deepEqual(
    filterTracksByPreferredLanguage(tracks, ["English", "Arabic"]).map((track) => track.id),
    ["en", "ar", "untagged"],
  );
});

test("release suffixes are not mistaken for subtitle language tags", () => {
  assert.equal(isKnownLanguage("eng"), true);
  assert.equal(isKnownLanguage("en"), true);
  assert.equal(isKnownLanguage("in"), true);
  const video = "/movies/The.Imitation.Game.2014-Pahe.in.mkv";
  assert.equal(subtitleLanguage(video, "/movies/The.Imitation.Game.2014-Pahe.in.srt"), undefined);
  assert.equal(subtitleLanguage(video, "/movies/The.Imitation.Game.2014-Pahe.in.en.srt"), "en");
  assert.equal(subtitleLanguage(video, "/movies/The.Imitation.Game.2014-Pahe.in.in.srt"), "id");
});

const subtitleButton = (tree: unknown) =>
  all(tree).find((node) => node.type === "button" && node.props["data-player-subtitles"])!;

test("the configured languages reach the separate subtitle popup", () => {
  const menu = subtitleMenuHarness(["Arabic"], ["English"]);
  subtitleButton(menu.render({ useOverlayPopup: true })).props.onClick();
  const fallback = subtitleMenuHarness([], ["English"]);
  subtitleButton(fallback.render({ useOverlayPopup: true })).props.onClick();
  assert.deepEqual(
    [...menu.opened, ...fallback.opened].map(({ name, state }) => [name, state.preferredLanguages]),
    [
      ["subtitle", ["Arabic"]],
      ["subtitle", ["English"]],
    ],
  );
  const modal = renderSubtitleModal({ ...menu.opened[0].state, tracks: [] });
  const body = all(modal).find((node) => node.type === "SubtitleMenuBody")!;
  assert.deepEqual(body.props.preferredLanguages, ["Arabic"]);
});

test("subtitle popup fills compact players while staying above the controls", () => {
  const menu = subtitleMenuHarness([], []);
  subtitleButton(menu.render({})).props.onClick();
  const inline = all(menu.render({})).find((node) => node.type === "Panel")!;
  assert.match(inline.props.className, /^fixed end-14 bottom-\[150px\] /);
  const modal = all(renderSubtitleModal({ tracks: [] })).find((node) => node.type === "Panel")!;
  assert.equal(modal.props.className, "mb-[84px] me-[56px]");
});

test("every anchored player popup shares one anchor", () => {
  const root = new URL("../src/components/player/", import.meta.url);
  const drifted: string[] = [];
  const walk = (dir: URL) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        walk(new URL(`${e.name}/`, dir));
      } else if (e.name.endsWith(".tsx")) {
        const at = new URL(e.name, dir);
        const src = readFileSync(at, "utf8");
        const hit = src.match(/fixed end-\S+ bottom-\[\d+px\]/);
        if (hit && hit[0] !== "fixed end-14 bottom-[150px]") drifted.push(`${e.name} ${hit[0]}`);
      }
    }
  };
  walk(root);
  assert.deepEqual(drifted, []);
});

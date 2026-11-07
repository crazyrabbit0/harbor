import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";
import {
  playbackParams,
  playbackPersistenceHarness,
} from "./helpers/playback-persistence-harness.ts";
import { cwAdvanceHarness, simklProgress } from "./helpers/cw-advance-harness.ts";
import {
  callbackContaining,
  effectContaining,
  hookArgument,
  jsxAttribute,
  sourceCallback,
} from "./helpers/source-callback.ts";
import type { LibraryItem } from "../src/lib/stremio";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const DAY = 864e5;
const iso = (offset = 0) => new Date(Date.now() + offset).toISOString();

function stremioModule() {
  const puts: any[] = [];
  const safeFetch = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    if (url.endsWith("/datastorePut")) puts.push(body);
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: [] }) };
  };
  const mod = loadModule("src/lib/stremio.ts", {
    "@/lib/safe-fetch": { safeFetch },
    "@/lib/resume": { readResumeEntry: () => null, readResumeSource: () => undefined },
    "./anime-detect": { isDetectedAnime: () => false },
  });
  return { mod, puts };
}

const stremio = stremioModule().mod;

test("cloudWriteId never yields a cloud id for anime-scheme metas", () => {
  for (const id of ["kitsu:1", "mal:2", "anilist:3", "anidb:4"]) {
    assert.equal(stremio.cloudWriteId(id, "tt999", true), null, id);
  }
  for (const id of ["kitsu:1", "mal:2", "anilist:3", "anidb:4"]) {
    assert.ok(stremio.ANIME_CLOUD_ID.test(id), id);
  }
  for (const id of ["tt1", "tmdb:tv:1", "kitsu1", "xkitsu:1"]) {
    assert.equal(stremio.ANIME_CLOUD_ID.test(id), false, id);
  }
});

test("cloudWriteId keeps non-anime behavior intact", () => {
  assert.equal(stremio.cloudWriteId("tt100", "tt999", true), "tt100");
  assert.equal(stremio.cloudWriteId("tmdb:tv:5", null, false), "tmdb:tv:5");
  assert.equal(stremio.cloudWriteId("addon:x", "tt200", true), "tt200");
  assert.equal(stremio.cloudWriteId("addon:x", "tt200", false), null);
});

test("libraryPut refuses anime-scheme writes unless they are removals", async () => {
  const { mod, puts } = stremioModule();
  const item = (id: string, removed: boolean) => ({ _id: id, removed, temp: false });
  await mod.libraryPut("key", item("kitsu:1", false));
  assert.equal(puts.length, 0);
  await mod.libraryPut("key", item("kitsu:1", true));
  await mod.libraryPut("key", item("tt100", false));
  assert.deepEqual(
    puts.map((p) => p.changes[0]._id),
    ["kitsu:1", "tt100"],
  );
});

function syncModule() {
  const writes: any[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  let strictGet: () => Promise<any> = async () => null;
  const source = read("src/views/player/hooks/use-stremio-sync.ts").replaceAll(
    "import.meta.env.DEV",
    "false",
  );
  const output =
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText + "\nexports.writeLibraryItem = writeLibraryItem;";
  const mocks: Record<string, unknown> = {
    react: {},
    "@/lib/stremio": {
      cloudWriteId: () => null,
      libraryGetOne: async () => null,
      libraryGetOneStrict: () => strictGet(),
    },
    "@/lib/stremio-write-queue": {
      cloudLibraryPut: async (_key: string, item: any) => {
        writes.push(item);
        return true;
      },
      flushWriteQueue: async () => {},
      queuedWatched: () => null,
    },
    "@/lib/stremio-item-lock": { withItemLock: (_id: string, fn: () => any) => fn() },
    "@/lib/stremio-watched-sync": { freshestWatched: () => null },
    "@/lib/player/playback-clock": {},
    "@/lib/profiles": {},
    "@/lib/watched-by": {},
    "@/lib/anime-cw-ids": {},
    "@/lib/player/resume-start": {},
    "@/lib/player/load-identity": {},
    "@/lib/read-at-version": {},
  };
  const mod: any = {};
  new Function("require", "exports", "setTimeout", output)(
    (name: string) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
      return mocks[name];
    },
    mod,
    (fn: () => void, ms: number) => timers.push({ fn, ms }),
  );
  return {
    mod,
    writes,
    fireTimersUpTo(ms: number) {
      for (const t of timers.splice(0)) if (t.ms <= ms) t.fn();
    },
    setStrictGet(fn: () => Promise<any>) {
      strictGet = fn;
    },
  };
}

const ttSrc = (episode: any = { season: 1, episode: 2, imdbSeason: 1, imdbEpisode: 2 }) => ({
  meta: { id: "tt100", type: "series", name: "Show" },
  url: "https://media.test/e.mkv",
  episode,
});
const finishedBase = () => ({
  _id: "tt100",
  name: "Show",
  type: "series",
  removed: false,
  temp: false,
  state: { video_id: "tt100:1:2", flaggedWatched: 1, timesWatched: 1, duration: 1800000 },
});
const paused = { status: "paused", durationSec: 1800, positionSec: 0 };

test("player sync clears a stale finished flag on a real resume", async () => {
  const resumed = syncModule();
  await resumed.mod.writeLibraryItem("key", ttSrc(), paused, finishedBase(), "tt100", 600, false);
  assert.equal(resumed.writes[0].state.flaggedWatched, 0);
  const brief = syncModule();
  await brief.mod.writeLibraryItem("key", ttSrc(), paused, finishedBase(), "tt100", 30, false);
  assert.equal(brief.writes[0].state.flaggedWatched, 1);
});

test("videoIdFor still refuses cross-scheme threaded video ids", () => {
  const { videoIdFor } = syncModule().mod;
  const kitsuSrc = {
    meta: { id: "kitsu:1", type: "series" },
    episode: { season: 1, episode: 5, kitsuStreamId: "kitsu:1:5" },
  };
  assert.equal(videoIdFor(kitsuSrc, "kitsu:1"), "kitsu:1:5");
  const ttThreaded = ttSrc({ season: 1, episode: 5, videoId: "tt100:2:5" });
  assert.equal(videoIdFor(ttThreaded, "tt100"), "tt100:2:5");
  const crossScheme = ttSrc({ season: 1, episode: 5, videoId: "tmdb:tv:9:3:7" });
  assert.equal(videoIdFor(crossScheme, "tt100"), "tt100:1:5");
});

test("tt-detected anime without imdb mapping never stamps kitsu numbering on tt items", async () => {
  const h = syncModule();
  const { videoIdFor, writeLibraryItem } = h.mod;
  const mapped = ttSrc({ season: 1, episode: 30, kitsuStreamId: "kitsu:1:30", imdbSeason: 2 });
  mapped.episode.imdbEpisode = 4;
  assert.equal(videoIdFor(mapped, "tt100"), "tt100:2:4");
  const unmapped = ttSrc({ season: 1, episode: 30, kitsuStreamId: "kitsu:1:30" });
  assert.equal(videoIdFor(unmapped, "tt100"), null);
  assert.equal(
    await writeLibraryItem("key", unmapped, paused, finishedBase(), "tt100", 600, false),
    null,
  );
  assert.equal(h.writes.length, 0);
});

test("terminal flush still races a strict GET before merging the bitfield", async () => {
  const terminal = syncModule();
  terminal.setStrictGet(() => new Promise(() => {}));
  void terminal.mod.writeLibraryItem("key", ttSrc(), paused, finishedBase(), "tt100", 600, true);
  await flushPromises();
  terminal.fireTimersUpTo(400);
  await flushPromises();
  assert.equal(terminal.writes.length, 1, "a slow strict GET must not block the terminal write");
  const live = syncModule();
  live.setStrictGet(() => new Promise(() => {}));
  void live.mod.writeLibraryItem("key", ttSrc(), paused, finishedBase(), "tt100", 600, false);
  await flushPromises();
  live.fireTimersUpTo(Infinity);
  await flushPromises();
  assert.equal(live.writes.length, 0, "a non-terminal write waits for the strict GET");
});

function localCwFor(patch: any) {
  const h = playbackPersistenceHarness("local");
  h.dependencies.CLOUD_OK = stremio.CLOUD_OK;
  const base = playbackParams(1, 3);
  const p = { ...base, ...patch, src: { ...base.src, ...patch.src } };
  h.render(p);
  h.render({ ...p, snap: { ...p.snap, status: "playing", positionSec: 60, durationSec: 1800 } });
  h.clock(60);
  h.tick();
  return { entry: h.localCw.at(-1), shared: h.localShared.at(-1) };
}

test("anime playback lands in local CW", () => {
  const anime = localCwFor({
    src: {
      meta: { id: "kitsu:1", type: "anime", name: "Anime" },
      episode: { season: 1, episode: 3 },
    },
  });
  assert.equal(anime.entry?.id, "kitsu:1");
  assert.equal(anime.entry?.type, "series");
  assert.equal(anime.shared, true, "anime-scheme ids live only in the shared local CW");
  const ttUnmapped = localCwFor({
    src: { episode: { season: 1, episode: 3, kitsuStreamId: "kitsu:1:3" } },
  });
  assert.equal(ttUnmapped.shared, true, "tt anime without an imdb pair stays local");
  const plain = localCwFor({});
  assert.equal(plain.entry?.id, "tt100");
  assert.equal(plain.shared, false);
  const movie = localCwFor({
    src: { meta: { id: "tt200", type: "movie", name: "Movie" }, episode: undefined },
    season: undefined,
    episode: undefined,
  });
  assert.equal(movie.entry?.type, "movie");
});

const cwItem = (id: string, patch: Partial<LibraryItem> = {}): LibraryItem => ({
  _id: id,
  type: "series",
  name: id,
  removed: false,
  temp: false,
  _ctime: iso(-DAY),
  _mtime: iso(-DAY),
  state: { timeOffset: 60000, duration: 1800000, season: 1, episode: 1, lastWatched: iso(-DAY) },
  ...patch,
});
const ids = (list: LibraryItem[]) => list.map((i) => i._id);
const railScope = {
  readAtVersion: (_v: unknown, read: () => unknown) => read(),
  cwVersion: 0,
  cwRootVersion: 0,
  animeDetectVer: 0,
  localCwVer: 0,
  localVersion: 0,
  dismissVersion: 0,
  activeProfile: { id: "a" },
  hideSharedCw: false,
  hideAnime: false,
  externalCw: [],
  localCwItems: [],
  localAnimeCw: [],
  simklCw: [],
  trackerCw: [],
  items: [],
  libItems: [],
  settings: { animeOnlyInAnimeRoom: false, hideContent: { anime: false } },
  limit: 14,
  listLocalCw: () => [],
  localToLibraryItem: (e: unknown) => e,
  isCwDismissed: () => false,
  franchiseDedupKey: (s: string) => s.toLowerCase(),
  franchiseRootSync: () => null,
  ANIME_CLOUD_ID: stremio.ANIME_CLOUD_ID,
  cwSortKey: stremio.cwSortKey,
  isCwMember: stremio.isCwMember,
  isAnimeCwItem: stremio.isAnimeCwItem,
};
const rail = (file: string, pick: Parameters<typeof sourceCallback>[1]) => (scope: object) =>
  sourceCallback(file, pick, { ...railScope, ...scope })() as LibraryItem[];
const homeRail = (items: LibraryItem[]) =>
  rail("src/views/home.tsx", hookArgument("continueWatching"))({ items });
const mobileRail = (items: LibraryItem[]) =>
  rail(
    "src/views/mobile/mobile-cw-row.tsx",
    callbackContaining("useMemo", "ANIME_CLOUD_ID"),
  )({ items });
const showsRail = (items: LibraryItem[]) =>
  rail("src/views/shows.tsx", hookArgument("continueWatching"))({ items });
const animeRail = rail("src/views/anime.tsx", hookArgument("continueWatching"));

test("every CW rail excludes cloud anime items", async () => {
  const lib = stremioModule().mod;
  const libItems = ["kitsu:1", "tt100"].map((id) => ({
    _id: id,
    type: "series",
    name: id,
    removed: false,
    temp: false,
    _mtime: iso(),
    state: { timeOffset: 60000, duration: 1800000, season: 1, episode: 1, lastWatched: iso() },
  }));
  const settings = {
    cwPerProfile: false,
    cwSources: { library: true, local: true, trakt: false, simkl: false },
  };
  const noop = () => {};
  const h = hookHarness(
    "src/lib/continue-watching.ts",
    "useContinueWatching",
    {
      "@/lib/auth": { useAuth: () => ({ authKey: "key" }) },
      "@/lib/profiles": {
        useProfiles: () => ({ activeProfile: { id: "a" }, profiles: [] }),
        anyProfileSharesStremioWith: () => false,
      },
      "@/lib/settings": { useSettingsSelector: (select: any) => select(settings) },
      "@/lib/local-cw": { listLocalCw: () => [], subscribeLocalCw: () => noop },
      "@/lib/feed/external-cw": { setExternalCwSources: noop, useExternalCw: () => [] },
      "@/lib/stremio": { ...lib, library: async () => libItems },
    },
    {
      window: { setTimeout, clearTimeout: noop, addEventListener: noop, removeEventListener: noop },
      document: { visibilityState: "visible", addEventListener: noop, removeEventListener: noop },
    },
  );
  h.render();
  await flushPromises();
  assert.deepEqual(
    h.render().map((c: any) => c.id),
    ["tt100"],
  );
  h.unmount();
  const anime = cwItem("tt100", { isAnime: true });
  const cloud = [cwItem("kitsu:1"), anime];
  assert.deepEqual(ids(homeRail(cloud)), ["tt100"]);
  assert.deepEqual(ids(mobileRail(cloud)), ["tt100"]);
  assert.deepEqual(ids(showsRail(cloud)), ["tt100"]);
  assert.deepEqual(ids(animeRail({ libItems: cloud })), ["tt100"]);
});

test("anime room sources local CW entries", () => {
  const now = Date.now();
  const entry = (id: string, isAnime: boolean | undefined, ageMs: number) => ({
    id,
    type: "series",
    name: id,
    isAnime,
    positionMs: 60000,
    durationMs: 1800000,
    season: 1,
    episode: 2,
    t: now - ageMs,
  });
  const localAnimeCw = sourceCallback("src/views/anime.tsx", hookArgument("localAnimeCw"), {
    ...railScope,
    activeProfile: { id: "a" },
    listLocalCw: () => [
      entry("kitsu:5", undefined, 0),
      entry("tt7", true, 1000),
      entry("tt8", false, 0),
    ],
  })();
  assert.deepEqual(ids(localAnimeCw), ["kitsu:5", "tt7"]);
  assert.deepEqual(ids(animeRail({ localAnimeCw })), ["kitsu:5", "tt7"]);
});

function absorbHarness(local: Record<string, { t: number }> = {}, dismissed = new Set<string>()) {
  const saved: any[] = [];
  const { absorbCloudAnimeCw } = loadModule("src/lib/anime-cw-absorb.ts", {
    "@/lib/cw-dismiss": { isCwDismissed: (i: any) => dismissed.has(i._id) },
    "@/lib/local-cw": {
      localCwEntry: (id: string) => local[id] ?? null,
      saveLocalCw: (e: any) => saved.push(e),
    },
    "@/lib/stremio": stremio,
  });
  return { absorb: absorbCloudAnimeCw, saved };
}

const cloudAnime = (id: string, patch: any = {}) => ({
  _id: id,
  type: "series",
  name: id,
  removed: false,
  temp: false,
  _mtime: iso(-DAY),
  state: { timeOffset: 60000, duration: 1440000, video_id: `${id}:7` },
  ...patch,
});

test("home and anime room absorb legacy cloud anime items into local CW", () => {
  const h = absorbHarness({ "kitsu:3": { t: Date.now() } });
  h.absorb([
    cloudAnime("kitsu:12"),
    cloudAnime("tt100"),
    cloudAnime("kitsu:2", { removed: true }),
    cloudAnime("kitsu:3"),
    cloudAnime("kitsu:4", { removed: true, temp: true }),
  ]);
  assert.deepEqual(
    h.saved.map((e) => e.id),
    ["kitsu:12", "kitsu:4"],
  );
  assert.equal(h.saved[0].season, 1);
  assert.equal(h.saved[0].episode, 7, "kitsu video ids carry the episode as their third part");
  assert.equal(h.saved[0].positionMs, 60000);
  // Home's load effect is too large to run; its one absorb line stays as text.
  assert.match(read("src/views/home.tsx"), /if \(!hideSharedCw\) absorbCloudAnimeCw\(view\);/);
});

test("anime room absorbs its loaded library unless the shared CW is hidden", async () => {
  const absorbed: unknown[] = [];
  const runEffect = async (hideSharedCw: boolean) => {
    const lib = [cwItem("kitsu:1")];
    const noop = () => {};
    const cleanup = sourceCallback("src/views/anime.tsx", effectContaining("absorbCloudAnimeCw"), {
      authKey: "key",
      hideSharedCw,
      library: async () => lib,
      loadAddonRows: async () => [],
      isAnimeRow: () => true,
      setLibItems: noop,
      setAddonRows: noop,
      absorbCloudAnimeCw: (items: unknown) => absorbed.push(items),
      window: { addEventListener: noop, removeEventListener: noop },
      document: { visibilityState: "visible" },
    })();
    await flushPromises();
    cleanup();
    return lib;
  };
  await runEffect(true);
  assert.deepEqual(absorbed, []);
  const lib = await runEffect(false);
  assert.deepEqual(absorbed, [lib]);
});

test("absorb cannot resurrect dismissed or ancient entries", () => {
  const h = absorbHarness({}, new Set(["kitsu:1"]));
  h.absorb([
    cloudAnime("kitsu:1"),
    cloudAnime("kitsu:2", { _mtime: iso(-46 * DAY) }),
    cloudAnime("kitsu:3", { _mtime: iso(-44 * DAY) }),
  ]);
  assert.deepEqual(
    h.saved.map((e) => e.id),
    ["kitsu:3"],
  );
});

test("dismissing a local anime entry persists past re-absorb", () => {
  for (const [file, pick] of [
    ["src/views/home.tsx", hookArgument("onDismissCw")],
    ["src/views/anime.tsx", jsxAttribute("ContinueCard", "onDismiss")],
  ] as const) {
    const calls: string[] = [];
    const dismiss = sourceCallback(file, pick, {
      authKey: "key",
      clearLocalCw: (id: string) => calls.push(`clear:${id}`),
      dismissCw: (item: LibraryItem, key: string) => calls.push(`dismiss:${item._id}:${key}`),
      dismissManualWatched: (id: string) => calls.push(`manual:${id}`),
    });
    dismiss(cwItem("kitsu:1", { local: true }));
    dismiss(cwItem("tt100"));
    dismiss(cwItem("tt200", { manualWatched: true }));
    assert.deepEqual(
      calls,
      ["clear:kitsu:1", "dismiss:kitsu:1:key", "dismiss:tt100:key", "manual:tt200"],
      file,
    );
  }
});

test("library repair cannot rewrite live anime-scheme items", async () => {
  const raw = [
    { _id: "kitsu:1", name: "Live anime", removed: false },
    { _id: "kitsu:2", name: "Removed anime", removed: true },
    { _id: "tt100", name: "Show", removed: false },
  ];
  const puts: any[] = [];
  const safeFetch = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const path = url.split("/").at(-1);
    if (path === "datastorePut") puts.push(...body.changes);
    const result =
      path === "datastoreMeta" ? raw.map((r) => [r._id, "1"]) : path === "datastoreGet" ? raw : {};
    return { ok: true, status: 200, json: async () => ({ result }) };
  };
  const { repairStremioLibrary } = loadModule("src/lib/stremio-library-repair.ts", {
    "@/lib/stremio": { ANIME_CLOUD_ID: stremio.ANIME_CLOUD_ID },
    "@/lib/safe-fetch": { safeFetch },
  });
  await repairStremioLibrary("key");
  assert.deepEqual(
    puts.map((p) => p._id),
    ["kitsu:2", "tt100"],
  );
});

test("anime episode lists carry absolute numbering for the phantom remap", async () => {
  const { fetchEpisodeList } = loadModule("src/lib/series-episodes.ts", {
    "@/lib/cache": {
      lruSet: (map: Map<unknown, unknown>, key: unknown, value: unknown) => map.set(key, value),
    },
    "@/lib/memory-profiler": { registerCache() {} },
    "./cinemeta": {},
    "./meta-resource": {},
    "./providers/tmdb": {},
    "./providers/tmdb/tmdb-client": {},
    "./providers/tmdb/tmdb-image-rungs": {},
    "./localized-text": {},
    "./providers/anime-kitsu-addon": {
      animeKitsuMeta: async () => ({
        videos: [1, 2].map((episode) => ({ id: `kitsu:9:${episode}`, season: 1, episode })),
      }),
    },
    "./providers/anime-mapping": { kitsuToAnilist: async () => null },
    "./providers/kitsu": { parseKitsuId: (id: string) => Number(id.split(":")[1]) || null },
    "./providers/anizip": {
      aniZipByKitsu: async () => ({
        mappings: { thetvdb_id: 1 },
        episodes: {
          "1": { seasonNumber: 2, episodeNumber: 1, absoluteEpisodeNumber: 26 },
          "2": { seasonNumber: 2, episodeNumber: 2 },
        },
      }),
      pickEpisodeTitle: () => null,
    },
    "./providers/tvdb-proxy": { fetchTvdbProxyImages: async () => ({}) },
    "./providers/anime-franchise-root": { franchiseRoot: async (id: string) => id },
    "./streams/anime-identity": {},
  });
  const list = await fetchEpisodeList({ id: "kitsu:9", type: "series" }, { tmdbKey: "" });
  assert.deepEqual(
    list.map((e: any) => e.absoluteNumber),
    [26, undefined],
  );
});

const finishedAt = (episode: number) => ({
  _id: "tt100",
  type: "series",
  name: "Show",
  removed: false,
  temp: false,
  _ctime: iso(),
  _mtime: iso(),
  state: {
    season: 1,
    episode,
    video_id: `tt100:1:${episode}`,
    timeOffset: 0,
    duration: 0,
    flaggedWatched: 1,
    lastWatched: iso(),
  },
});

test("phantom guard remaps absolute numbering instead of removing", async () => {
  const absoluteList = [1, 2, 3, 4, 5].map((episode) => ({
    season: 1,
    episode,
    absoluteNumber: 25 + episode,
    airDate: "2020-01-01",
  }));
  const remapped = cwAdvanceHarness();
  remapped.setRemote(simklProgress([]));
  remapped.setEpisodes(absoluteList);
  remapped.render([finishedAt(29)], "", true, []);
  const [next] = await remapped.flush();
  assert.equal(next?.state.episode, 5, "absolute 29 is S1E4, so Continue Watching offers E5");
  assert.equal(next?.upNext, true);
  const phantom = cwAdvanceHarness();
  phantom.setRemote(simklProgress([]));
  phantom.setEpisodes(absoluteList);
  phantom.render([finishedAt(40)], "", true, []);
  assert.deepEqual(await phantom.flush(), []);
});

test("resurface walks past watched adjacent episodes", async () => {
  const source = read("src/lib/series-episodes.ts");
  const parsed = ts.createSourceFile("series.ts", source, ts.ScriptTarget.Latest, true);
  const nextFn = parsed.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "nextUnwatchedAfter",
  )!;
  const nextUnwatchedAfter = new Function(
    `${ts.transpileModule(nextFn.getText(parsed).replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText}\nreturn nextUnwatchedAfter;`,
  )();
  const episodes = [1, 2, 3, 4].map((episode) => ({ season: 1, episode, airDate: "2020-01-01" }));
  const { resurfaceCandidates } = loadModule("src/lib/cw-resurface.ts", {
    "@/lib/series-episodes": {
      fetchAdjacentEpisodes: async () => ({ next: episodes[1] }),
      fetchEpisodeList: async () => episodes,
      nextUnwatchedAfter,
    },
    "@/lib/providers/anime-mapping": { relatedLibraryIds: async () => [] },
    "@/lib/stremio": stremio,
    "@/lib/cw-dismiss": { isCwDismissed: () => false },
    "@/lib/cw-profile": { privateCwProfileId: () => null },
  });
  const out = await resurfaceCandidates(
    [finishedAt(1)],
    new Set(),
    { tmdbKey: "", animeMode: "all" },
    () => (_s: number, e: number) => e <= 3,
  );
  assert.deepEqual(out.get("tt100"), { season: 1, episode: 4 });
});

function trackerModules(entry: { total: number; progress: number; status: string }) {
  const writes: string[] = [];
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  };
  const session = {};
  const shared = { "@/lib/active-profile-id": { activeProfileId: () => "p" } };
  const auth = { isAuthenticated: () => true, getSession: () => session };
  const anilist = loadModule(
    "src/lib/anilist/sync.ts",
    {
      ...shared,
      "@/lib/providers/anime-mapping": { kitsuToAnilist: async () => 7 },
      "./session": auth,
      "./client": {
        AnilistApiError: class extends Error {},
        anilistRequest: async (query: string, vars: any) => {
          if (query.startsWith("mutation")) {
            writes.push(`anilist:${vars.progress ?? vars.status}`);
            return { SaveMediaListEntry: { id: 1, progress: vars.progress, status: vars.status } };
          }
          return {
            Media: {
              id: 7,
              episodes: entry.total,
              mediaListEntry: { id: 1, progress: entry.progress, status: entry.status },
            },
          };
        },
      },
    },
    { localStorage },
  );
  const mal = loadModule(
    "src/lib/mal/sync.ts",
    {
      ...shared,
      "./mutations": { resolveMalMediaId: async () => 5 },
      "./session": auth,
      "./client": {
        MalApiError: class extends Error {},
        malRequest: async (_path: string, init?: { method: string; body: URLSearchParams }) => {
          if (init?.method === "PATCH") {
            const body = init.body;
            writes.push(`mal:${body.get("num_watched_episodes") ?? body.get("status")}`);
            return { num_episodes_watched: Number(body.get("num_watched_episodes")) };
          }
          return {
            num_episodes: entry.total,
            my_list_status: {
              num_episodes_watched: entry.progress,
              status: entry.status === "PLANNING" ? "plan_to_watch" : "watching",
              is_rewatching: false,
            },
          };
        },
      },
    },
    { localStorage },
  );
  return { anilist, mal, writes };
}

test("tracker sync cannot corrupt the wrong cour", async () => {
  const progress = trackerModules({ total: 12, progress: 5, status: "CURRENT" });
  await progress.anilist.syncAnimeProgress("kitsu:1", 13, "Show");
  await progress.mal.syncMalProgress("kitsu:1", 13, "Show");
  assert.deepEqual(progress.writes, [], "an episode past the entry's total is another cour");
  await progress.anilist.syncAnimeProgress("kitsu:1", 6, "Show");
  await progress.mal.syncMalProgress("kitsu:1", 6, "Show");
  assert.deepEqual(progress.writes, ["anilist:6", "mal:6"]);
  const done = trackerModules({ total: 12, progress: 12, status: "PLANNING" });
  await done.anilist.markAnimeWatching("kitsu:1", "Show");
  await done.mal.markMalWatching("kitsu:1", "Show");
  assert.deepEqual(done.writes, [], "a fully watched entry is not marked watching");
  const planned = trackerModules({ total: 12, progress: 3, status: "PLANNING" });
  await planned.anilist.markAnimeWatching("kitsu:1", "Show");
  await planned.mal.markMalWatching("kitsu:1", "Show");
  assert.deepEqual(planned.writes, ["anilist:CURRENT", "mal:watching"]);
});

test("home dedup prefers the twin that actually played most recently", () => {
  const twin = (id: string, mtime: number, lastWatched?: number) =>
    cwItem(id, {
      name: "Same Show",
      _mtime: iso(mtime),
      state: {
        timeOffset: 60000,
        duration: 1800000,
        lastWatched: lastWatched == null ? undefined : iso(lastWatched),
      },
    });
  // The synced twin sorts first by mtime, but the other one was played more recently.
  const synced = twin("tt1", 0, -3 * DAY);
  const played = twin("tt2", -2 * DAY, -DAY);
  assert.deepEqual(ids(homeRail([synced, played])), ["tt2"]);
  // Without lastWatched the mtime decides.
  assert.deepEqual(ids(homeRail([twin("tt3", -DAY), twin("tt4", -2 * DAY)])), ["tt3"]);
});

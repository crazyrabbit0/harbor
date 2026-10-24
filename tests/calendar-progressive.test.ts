import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path: string, mocks: Record<string, any>) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  new Function("require", "exports", output)((id: string) => {
    assert.ok(id in mocks, `unexpected import ${id}`);
    return mocks[id];
  }, exports);
  return exports;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 300));

test("Trakt calendar shows its episodes before Cinemeta artwork arrives, then fills it in", async () => {
  const metaReply = deferred<any>();
  let metaCalls = 0;
  const library = {
    mapLimit: async (items: any[], _limit: number, fn: (i: any) => Promise<unknown>) =>
      Promise.all(items.map(fn)),
    progressReporter: (collect: () => any[], onProgress?: (items: any[]) => void) => ({
      report: () => onProgress?.(collect()),
      cancel: () => {},
    }),
    resolveSavedCalendar: async () => [],
  };
  const sources = load("../src/lib/calendar-sources.ts", {
    "./cinemeta": {
      meta: () => {
        metaCalls++;
        return metaReply.promise;
      },
    },
    "./trakt/calendar": {
      fetchUpcomingEpisodes: async () => [
        {
          ids: { imdb: "tt1" },
          title: "Show",
          season: 1,
          number: 2,
          episodeTitle: "Pilot",
          airDate: `${new Date().toISOString().slice(0, 10)}T20:00:00Z`,
        },
      ],
      fetchUpcomingMovies: async () => [],
      fetchAnticipatedShows: async () => [],
      fetchAnticipatedMovies: async () => [],
    },
    "./calendar-time": {
      localDateTimeFromIso: (iso: string) => ({ date: iso.slice(0, 10), time: "8:00 PM", atMs: 1 }),
    },
    "./calendar-library": library,
    "./simkl/watchlist": {},
    "./simkl/calendar": {},
    "./simkl/session": { isAuthenticated: () => false },
    "./anilist/airing": {},
    "./providers/anime-dub-sub": {},
  });
  const now = new Date();
  const progress: any[][] = [];
  const done = sources.fetchTraktCalendar(now.getFullYear(), now.getMonth(), {
    onProgress: (items: any[]) => progress.push(items),
  });
  await flush();
  assert.equal(metaCalls, 1);
  assert.equal(progress.length, 1, "items are reported before the Cinemeta lookup settles");
  assert.equal(progress[0][0].name, "Show S01E02: Pilot");
  assert.equal(progress[0][0].poster, null);
  metaReply.resolve({ poster: "https://img/poster.jpg", genres: [] });
  const items = await done;
  assert.equal(items[0].poster, "https://img/poster.jpg");
});

test("progressReporter throttles bursts and drops a pending report on cancel", async () => {
  const lib = load("../src/lib/calendar-library.ts", {
    "./cinemeta": {},
    "./stremio": {},
    "./watchlist": {},
    "./trakt/watchlist": {},
    "./providers/tvmaze": {},
    "./providers/tmdb/tmdb-calendar": {},
    "./providers/anizip": {},
    "./calendar-time": {},
    "./storage-recovery": {},
  });
  const calls: number[] = [];
  let n = 0;
  const r = lib.progressReporter(
    () => [++n],
    (items: number[]) => calls.push(items[0]),
  );
  r.report();
  r.report();
  r.report();
  assert.deepEqual(calls, [1], "the first report fires at once, the rest wait for the window");
  await flush();
  assert.deepEqual(calls, [1, 2]);
  r.report();
  r.cancel();
  await flush();
  assert.deepEqual(calls, [1, 2]);
});

test("mapLimit keeps at most `limit` jobs running and preserves order", async () => {
  const lib = load("../src/lib/calendar-library.ts", {
    "./cinemeta": {},
    "./stremio": {},
    "./watchlist": {},
    "./trakt/watchlist": {},
    "./providers/tvmaze": {},
    "./providers/tmdb/tmdb-calendar": {},
    "./providers/anizip": {},
    "./calendar-time": {},
    "./storage-recovery": {},
  });
  let running = 0;
  let peak = 0;
  const out = await lib.mapLimit([5, 1, 4, 2, 3], 2, async (ms: number) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, ms));
    running--;
    return ms * 10;
  });
  assert.equal(peak, 2);
  assert.deepEqual(out, [50, 10, 40, 20, 30]);
});

function libraryWith(
  counts: { cinemeta: number; tmdb: number },
  releaseInfo: string,
  store: Map<string, string>,
) {
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  };
  return load("../src/lib/calendar-library.ts", {
    "./cinemeta": {
      meta: async () => {
        counts.cinemeta++;
        return {
          name: "Old",
          releaseInfo,
          videos: [{ season: 1, episode: 1, released: "2013-09-30T05:00:00Z" }],
        };
      },
    },
    "./stremio": {},
    "./watchlist": {},
    "./trakt/watchlist": {},
    "./providers/tvmaze": {},
    "./providers/tmdb/tmdb-calendar": {
      tmdbFindByImdb: async () => {
        counts.tmdb++;
        return { tvId: 1, movieId: null };
      },
      tmdbTvUpcoming: async () => {
        counts.tmdb++;
        return null;
      },
    },
    "./providers/anizip": {},
    "./calendar-time": {
      localDateTimeFromIso: (iso?: string) => ({ date: (iso ?? "").slice(0, 10) }),
    },
    "./storage-recovery": { setItemWithRecovery: (k: string, v: string) => store.set(k, v) },
  });
}

const oldShow = [{ id: "tt0903747", type: "series", name: "Old", mtime: 0, temp: false }];

test("an ended Cinemeta show skips TMDB, and the result is reused by a fresh session", async () => {
  const store = new Map<string, string>();
  const first = { cinemeta: 0, tmdb: 0 };
  await libraryWith(first, "2008–2013", store).resolveSavedCalendar(oldShow, 2026, 9, {
    tmdbKey: "k",
  });
  assert.deepEqual(first, { cinemeta: 1, tmdb: 0 });
  await new Promise((r) => setTimeout(r, 2100));
  assert.ok(store.has("harbor.calendar.resolved.v1"), "resolved shows are written to disk");
  const second = { cinemeta: 0, tmdb: 0 };
  await libraryWith(second, "2008–2013", store).resolveSavedCalendar(oldShow, 2026, 9, {
    tmdbKey: "k",
  });
  assert.deepEqual(second, { cinemeta: 0, tmdb: 0 });
});

test("a continuing show with nothing on Cinemeta still asks TMDB", async () => {
  const counts = { cinemeta: 0, tmdb: 0 };
  await libraryWith(counts, "2008–", new Map()).resolveSavedCalendar(oldShow, 2026, 9, {
    tmdbKey: "k",
  });
  assert.deepEqual(counts, { cinemeta: 1, tmdb: 2 });
});

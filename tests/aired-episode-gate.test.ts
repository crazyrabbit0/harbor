// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { airedOnly } from "../src/lib/aired.ts";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";
import { markWatchedHarness } from "./helpers/mark-watched-harness.ts";

const DAY = 86_400_000;
const past = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const future = (n: number) => new Date(Date.now() + n * DAY).toISOString();

type Ep = { episode: number; rel: string | null };

function season(): Ep[] {
  const eps: Ep[] = [];
  for (let i = 1; i <= 17; i++) eps.push({ episode: i, rel: past(200 - i) });
  for (let i = 18; i <= 20; i++) eps.push({ episode: i, rel: future(i - 17) });
  for (let i = 21; i <= 24; i++) eps.push({ episode: i, rel: null });
  return eps;
}

test("an undated episode past the last aired one is never treated as released", () => {
  const kept = airedOnly(season(), (e) => e.rel).map((e) => e.episode);
  assert.deepEqual(kept, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
});

test("a fully undated series still marks completely", () => {
  const eps: Ep[] = [1, 2, 3].map((episode) => ({ episode, rel: null }));
  assert.deepEqual(
    airedOnly(eps, (e) => e.rel).map((e) => e.episode),
    [1, 2, 3],
  );
});

test("an undated episode between two aired ones is kept", () => {
  const eps: Ep[] = [
    { episode: 1, rel: past(30) },
    { episode: 2, rel: null },
    { episode: 3, rel: past(10) },
    { episode: 4, rel: null },
  ];
  assert.deepEqual(
    airedOnly(eps, (e) => e.rel).map((e) => e.episode),
    [1, 2, 3],
  );
});

test("mark all watched runs the same aired rule as mark season", async () => {
  const { mod, marked, traktEpisodes } = markWatchedHarness();
  // Listed out of order on purpose: the rule needs them sorted by season and episode first.
  const video = (season: number, episode: number, released: string | null) => ({
    season,
    episode,
    released,
  });
  const videos = [
    video(2, 3, null),
    video(1, 3, past(40)),
    video(2, 2, future(3)),
    video(1, 2, null),
    video(0, 1, past(5)),
    video(2, 1, past(10)),
    video(1, 1, past(50)),
  ];

  await mod.markMetaWatched({ id: "tt1", type: "series", name: "Show", videos });

  const aired = [
    { season: 1, episode: 1 },
    { season: 1, episode: 2 },
    { season: 1, episode: 3 },
    { season: 2, episode: 1 },
  ];
  assert.deepEqual(marked, [["tt1", aired, true]]);
  assert.deepEqual(traktEpisodes, aired);
});

type Row = { number: number; seasonNumber?: number; airdate: string | null };

const tail: Row[] = [
  { number: 3, airdate: null },
  { number: 1, airdate: past(20) },
  { number: 2, airdate: future(5) },
];

test("tracker progress is projected onto aired episodes, not a left-shifted list", async () => {
  const mod = loadModule("src/lib/tracker-watched-keys.ts", {
    "@/lib/providers/anizip": { aniZipByKitsu: async () => null },
    "@/lib/aired": { airedOnly },
    "@/lib/anime-entry-target": { entryTvdbPairs: () => new Map() },
  });

  const keys: Set<string> = await mod.trackerWatchedKeys("tt1", tail, 3, false, null);

  assert.deepEqual([...keys], ["1:1"]);
});

const trackerHooks = [
  {
    name: "MAL",
    file: "src/lib/mal/use-mal-watched.ts",
    hook: "useMalWatched",
    mocks: (total: number) => ({
      "@/lib/mal/provider": { useMal: () => ({ isConnected: true }) },
      "@/lib/mal/mutations": {
        fetchListEntry: async () => ({
          entry: { status: "watching", numEpisodesWatched: 1 },
          numEpisodes: total,
        }),
        resolveMalMediaId: async () => 7,
      },
    }),
  },
  {
    name: "AniList",
    file: "src/lib/anilist/use-anilist-watched.ts",
    hook: "useAnilistWatched",
    mocks: (total: number) => ({
      "@/lib/anilist/provider": { useAnilist: () => ({ isConnected: true }) },
      "@/lib/anilist/mutations": {
        fetchListEntry: async () => ({
          entry: { status: "CURRENT", progress: 1 },
          episodes: total,
        }),
      },
      "@/lib/anilist/sync": { resolveAnilistMediaId: async () => 7 },
    }),
  },
];

for (const t of trackerHooks) {
  test(`${t.name} watched keys come from the aired-aware tracker projection`, async () => {
    const calls: unknown[][] = [];
    const harness = hookHarness(t.file, "run", {
      ...t.mocks(12),
      "@/lib/aired": { airedOnly },
      "@/lib/tracker-watched-keys": {
        trackerWatchedKeys: async (...args: unknown[]) => {
          calls.push(args);
          return new Set(["1:1"]);
        },
      },
    });
    // One aired episode, then two that have not aired: the entry is finished once that one is watched.
    const episodes: Row[] = [
      { number: 1, airdate: past(20) },
      { number: 2, airdate: future(5) },
      { number: 3, airdate: future(12) },
    ];
    harness.exports.run = () => harness.exports[t.hook]("tt1", episodes);

    harness.render();
    await flushPromises();
    const result = harness.render();

    assert.deepEqual(calls, [["tt1", episodes, 1, false, 12]]);
    assert.deepEqual([...result.watchedKeys], ["1:1"]);
    assert.equal(result.completed, true);
  });
}

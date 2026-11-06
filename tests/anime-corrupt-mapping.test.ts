// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { mergeAniZipEpisodes } from "../src/lib/providers/anime-episode-build.ts";
import { buildAnimeOrder } from "../src/views/detail/anime-episodes/anime-order-utils.ts";
import { resolveAnimeSlotMatch } from "../src/views/detail/anime-episodes/anime-slot-match.ts";
import { animePanelOf, tvdbOrderOf } from "./helpers/anime-panel-harness.ts";

// Witch Hat Atelier (kitsu:46043): real AniZip payload is duplicate + shifted.
// key 1: tvdb 9095554 S1E1 abs 1 | key 2: tvdb 9095554 S1E1 abs 1 (dup)
// key 3: tvdb 11697830 S1E2 abs 2 ... key 13: tvdb 11697840 S1E12 abs 12
function witchHatAniZip() {
  const episodes: Record<string, any> = {
    "1": { tvdbId: 9095554, seasonNumber: 1, episodeNumber: 1, absoluteEpisodeNumber: 1 },
  };
  episodes["2"] = { tvdbId: 9095554, seasonNumber: 1, episodeNumber: 1, absoluteEpisodeNumber: 1 };
  const tvdbIds = [
    11697830, 11697831, 11697832, 11697833, 11697834, 11697835, 11697836, 11697837, 11697838,
    11697839, 11697840,
  ];
  for (let n = 3; n <= 13; n++) {
    const i = n - 3;
    episodes[String(n)] = {
      tvdbId: tvdbIds[i],
      seasonNumber: 1,
      episodeNumber: n - 1,
      absoluteEpisodeNumber: n - 1,
    };
  }
  return { episodes, mappings: { imdb_id: "tt32550889" } };
}

// 13 Kitsu eps with correct streaming pairs (as anime-kitsu addon provides).
function witchHatPool(): any[] {
  const out: any[] = [];
  for (let n = 1; n <= 13; n++) {
    out.push({
      id: 329874 + n,
      number: n,
      seasonNumber: 1,
      title: `E${n}`,
      synopsis: "",
      thumbnail: null,
      airdate: null,
      length: 24,
      imdbSeason: 1,
      imdbEpisode: n,
    });
  }
  return out;
}

// TVDB slots for Season 1 (13 correct slots).
function witchHatSlots() {
  const ids = [
    9095554, 11697830, 11697831, 11697832, 11697833, 11697834, 11697835, 11697836, 11697837,
    11697838, 11697839, 11697840, 11707369,
  ];
  return ids.map((id, i) => ({ id, seasonNumber: 1, episodeNumber: i + 1, abs: i + 1 }));
}

// A pool where E2 and E3 carry TVDB ids that belong to the neighbouring slots.
function shiftedPool() {
  const ep = (id: number, number: number, tvdbEpisodeId: number, absoluteNumber: number) => ({
    id,
    number,
    title: `E${number}`,
    synopsis: "",
    imdbSeason: 1,
    imdbEpisode: number,
    tvdbEpisodeId,
    absoluteNumber,
  });
  return [ep(1, 1, 100, 1), ep(2, 2, 100, 1), ep(3, 3, 200, 2)];
}

const shiftedSlots = () => [
  { id: 100, seasonNumber: 1, episodeNumber: 1, abs: 1 },
  { id: 200, seasonNumber: 1, episodeNumber: 2, abs: 2 },
  { id: 300, seasonNumber: 1, episodeNumber: 3, abs: 3 },
  { id: 400, seasonNumber: 2, episodeNumber: 1, abs: 4 },
];

test("merge sanitization: shifted/duplicate AniZip IDs are not applied", () => {
  const pool = witchHatPool();
  mergeAniZipEpisodes(pool, witchHatAniZip() as any);
  // E1 keeps its authoritative IDs.
  assert.equal(pool[0].tvdbEpisodeId, 9095554);
  assert.equal(pool[0].absoluteNumber, 1);
  // E2 duplicate must not be applied (stays unset so abs falls back to number).
  assert.equal(pool[1].tvdbEpisodeId, undefined);
  assert.equal(pool[1].absoluteNumber, undefined);
  // E3..E13 shifted IDs must not be applied.
  for (let n = 3; n <= 13; n++) {
    assert.equal(pool[n - 1].tvdbEpisodeId, undefined, `E${n} tvdbId`);
    assert.equal(pool[n - 1].absoluteNumber, undefined, `E${n} abs`);
  }
  // No duplicate tvdbIds in the pool.
  const ids = pool.map((e) => e.tvdbEpisodeId).filter((v) => v != null);
  assert.equal(new Set(ids).size, ids.length);
  // Streaming pairs stay intact.
  for (let n = 1; n <= 13; n++) {
    assert.equal(pool[n - 1].imdbSeason, 1);
    assert.equal(pool[n - 1].imdbEpisode, n);
  }
});

test("merge keeps healthy mappings untouched", () => {
  const pool = witchHatPool();
  const healthy: Record<string, any> = {};
  for (let n = 1; n <= 13; n++) {
    healthy[String(n)] = {
      tvdbId: 1000 + n,
      seasonNumber: 1,
      episodeNumber: n,
      absoluteEpisodeNumber: n,
    };
  }
  mergeAniZipEpisodes(pool, { episodes: healthy } as any);
  for (let n = 1; n <= 13; n++) {
    assert.equal(pool[n - 1].tvdbEpisodeId, 1000 + n);
    assert.equal(pool[n - 1].absoluteNumber, n);
  }
});

test("merge does not fill shifted imdb pairs when the addon gave none", () => {
  const pool = witchHatPool().map((e) => ({ ...e, imdbSeason: undefined, imdbEpisode: undefined }));
  mergeAniZipEpisodes(pool, witchHatAniZip() as any);
  // E1 is not shifted, so it still backfills.
  assert.equal(pool[0].imdbSeason, 1);
  assert.equal(pool[0].imdbEpisode, 1);
  // Shifted records must not plant wrong pairs.
  for (let n = 2; n <= 13; n++) {
    assert.equal(pool[n - 1].imdbSeason, undefined, `E${n} imdbSeason`);
    assert.equal(pool[n - 1].imdbEpisode, undefined, `E${n} imdbEpisode`);
  }
});

test("slot matcher prefers the pair-correct episode over a stale tvdbId", () => {
  // Simulates the pre-sanitization pool where E3 carries TVDB E2's id.
  const e2: any = {
    id: 2,
    number: 2,
    imdbSeason: 1,
    imdbEpisode: 2,
    absoluteNumber: 1,
    tvdbEpisodeId: 9095554,
  };
  const e3: any = {
    id: 3,
    number: 3,
    imdbSeason: 1,
    imdbEpisode: 3,
    absoluteNumber: 2,
    tvdbEpisodeId: 11697830,
  };
  const byTvdbId = new Map([[11697830, e3]]);
  const byPair = new Map([
    ["1:2", e2],
    ["1:3", e3],
  ]);
  const byAbs = new Map([[2, e3]]);
  const match = resolveAnimeSlotMatch(1, 2, 11697830, 2, byTvdbId, byPair, byAbs, new Set());
  assert.equal(match?.id, 2, "slot S01E02 must resolve to E2, not the stale-id E3");
});

test("grouping: E2 stays in Season 1, no Extras, no duplicate E13", async () => {
  const pool = witchHatPool();
  mergeAniZipEpisodes(pool, witchHatAniZip() as any);
  const panel = await animePanelOf(pool, witchHatSlots());
  assert.ok(panel, "the panel is built");
  assert.deepEqual(
    panel.items.map((i) => i.key),
    ["1"],
    "E2 must not land in Extras",
  );
  const rows = panel.visibleEpisodes;
  assert.deepEqual(
    rows.map((r) => r.number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  );
  assert.equal(new Set(rows.map((r) => r.id)).size, 13);
  assert.ok(
    rows.every((r) => r.id > 0),
    "no synthetic duplicate E13",
  );
  for (const ep of rows) {
    assert.ok(
      ep.absoluteNumber == null || ep.absoluteNumber === ep.number,
      `E${ep.number} has shifted abs ${ep.absoluteNumber}`,
    );
  }
});

test("the panel builder resolves shifted tvdb ids through the shared slot matcher", async () => {
  const panel = await animePanelOf(shiftedPool(), shiftedSlots());
  assert.ok(panel, "the panel is built");
  const season1 = panel.visibleEpisodes;
  assert.deepEqual(
    season1.map((r) => r.id),
    [1, 2, 3],
    "slot S01E02 must resolve to E2, not the stale-id E3",
  );
});

test("the order builder resolves shifted tvdb ids through the shared slot matcher", () => {
  const out = buildAnimeOrder(tvdbOrderOf(shiftedSlots()), shiftedPool() as any, "Extras");
  assert.ok(out, "two seasons build an order");
  assert.deepEqual(
    out.subsetByKey.get("1")!.map((r) => r.id),
    [1, 2, 3],
    "slot S01E02 must resolve to E2, not the stale-id E3",
  );
});

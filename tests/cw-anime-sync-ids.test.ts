// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import { continueCardHarness } from "./helpers/continue-card-harness.ts";
import { flushPromises, loadModule } from "./helpers/hook-harness.ts";
import {
  aniZipLookupKey,
  applyAniZipEpisode,
  needsAniZipSyncIds,
} from "../src/lib/cw-anime-episode.ts";
import { stripFranchiseSuffix, franchiseDedupKey } from "../src/lib/providers/jikan.ts";
import { buildBody } from "../src/lib/simkl/scrobble-body.ts";
import {
  animeCoordPairs,
  findAnimeEntryNumber,
  selectSiblingWindows,
} from "../src/lib/streams/anime-identity-core.ts";
import { stremioIdToTraktTarget } from "../src/lib/trakt/ids.ts";
import {
  playbackParams,
  playbackPersistenceHarness,
} from "./helpers/playback-persistence-harness.ts";

const MUSHOKU = {
  mappings: { kitsu_id: 49002, thetvdb_id: 371310, imdb_id: "tt13293588" },
  episodes: {
    "6": { tvdbId: 11872046, seasonNumber: 3, episodeNumber: 6, absoluteEpisodeNumber: 55 },
  },
};

test("a Continue Watching episode arrives without the ids the trackers need", () => {
  assert.equal(needsAniZipSyncIds("kitsu:49002", { season: 1, episode: 6 }), true);
  assert.equal(needsAniZipSyncIds("tt10329862", { season: 2, episode: 5 }), false);
  assert.equal(
    needsAniZipSyncIds("kitsu:49002", {
      season: 1,
      episode: 6,
      tvdbEpisodeId: 1,
      imdbSeason: 3,
      imdbEpisode: 6,
    }),
    false,
  );
  assert.equal(needsAniZipSyncIds("kitsu:49002", undefined), false);
});

test("enrichment fills every id the trackers key on", () => {
  const out = applyAniZipEpisode({ season: 1, episode: 6 }, MUSHOKU);
  assert.equal(out.tvdbEpisodeId, 11872046);
  assert.equal(out.imdbSeason, 3);
  assert.equal(out.imdbEpisode, 6);
  assert.equal(out.absoluteNumber, 55);
  assert.equal(out.imdbId, "tt13293588");
  assert.equal(out.kitsuStreamId, "kitsu:49002:6");
});

test("enrichment never overwrites ids the caller already resolved", () => {
  const out = applyAniZipEpisode(
    { season: 1, episode: 6, tvdbEpisodeId: 999, imdbSeason: 9, imdbId: "tt0000001" },
    MUSHOKU,
  );
  assert.equal(out.tvdbEpisodeId, 999);
  assert.equal(out.imdbSeason, 9);
  assert.equal(out.imdbId, "tt0000001");
});

test("a missing mapping leaves the episode untouched instead of throwing", () => {
  const ep = { season: 1, episode: 6 };
  assert.deepEqual(applyAniZipEpisode(ep, null), ep);
  assert.deepEqual(applyAniZipEpisode(ep, { mappings: {}, episodes: {} }), ep);
});

test("Trakt silently dropped the anime scrobble before enrichment and accepts it after", () => {
  const bare = { season: 1, episode: 6 };
  const before = stremioIdToTraktTarget("kitsu:49002", bare);
  assert.equal(before.ok, false);

  const after = stremioIdToTraktTarget("kitsu:49002", applyAniZipEpisode(bare, MUSHOKU));
  assert.equal(after.ok, true);
  if (!after.ok) return;
  assert.equal(after.target.season, 3, "must scrobble season 3, not the Kitsu season 1");
  assert.equal(after.target.number, 6);
  assert.deepEqual(after.target.episodeIds, { tvdb: 11872046 });
});

test("Simkl gets the imdb id as a second way to match a brand new season", () => {
  const enriched = applyAniZipEpisode({ season: 1, episode: 6 }, MUSHOKU);
  const body = buildBody("kitsu:49002", enriched, 100) as {
    anime: { ids: Record<string, unknown> };
  };
  assert.equal(body.anime.ids.kitsu, 49002);
  assert.equal(body.anime.ids.imdb, "tt13293588");
});

test("non-anime scrobbles are byte for byte what they were", () => {
  assert.deepEqual(buildBody("tt10329862", { season: 2, episode: 5 }, 100), {
    progress: 100,
    show: { ids: { imdb: "tt10329862" } },
    episode: { season: 2, number: 5 },
  });
});

test("anime lookups are only attempted for anime id schemes", () => {
  assert.deepEqual(aniZipLookupKey("kitsu:49002"), { scheme: "kitsu", id: 49002 });
  assert.deepEqual(aniZipLookupKey("mal:59193"), { scheme: "mal", id: 59193 });
  assert.equal(aniZipLookupKey("tt13293588"), null);
  assert.equal(aniZipLookupKey("tmdb:tv:94664"), null);
});

test("the season is not printed twice in the Continue Watching title", () => {
  assert.equal(
    stripFranchiseSuffix("Mushoku Tensei: Jobless Reincarnation Season 3"),
    "Mushoku Tensei: Jobless Reincarnation",
  );
  assert.equal(
    stripFranchiseSuffix("Skeleton Knight in Another World II"),
    "Skeleton Knight in Another World",
  );
  assert.equal(stripFranchiseSuffix("Silo"), "Silo");
});

test("parenthesised and year suffixed titles are stripped too", () => {
  assert.equal(
    stripFranchiseSuffix("Mushoku Tensei: Jobless Reincarnation (Season 3)"),
    "Mushoku Tensei: Jobless Reincarnation",
  );
  assert.equal(
    stripFranchiseSuffix("Skeleton Knight in Another World (II)"),
    "Skeleton Knight in Another World",
  );
  assert.equal(stripFranchiseSuffix("Re:Zero 2026"), "Re:Zero");
  assert.equal(stripFranchiseSuffix("Re:Zero (2026)"), "Re:Zero");
  assert.equal(
    stripFranchiseSuffix("Demon Slayer: Kimetsu no Yaiba S3"),
    "Demon Slayer: Kimetsu no Yaiba",
  );
  assert.equal(stripFranchiseSuffix("Sword Art Online 2nd Season"), "Sword Art Online");
  assert.equal(stripFranchiseSuffix("86"), "86", "numeric titles must not be stripped");
});

test("the Continue Watching dedup key collapses suffix variants of one show", () => {
  assert.equal(
    franchiseDedupKey("Mushoku Tensei: Jobless Reincarnation Season 3"),
    franchiseDedupKey("Mushoku Tensei: Jobless Reincarnation"),
  );
  assert.equal(
    franchiseDedupKey("Skeleton Knight in Another World II"),
    franchiseDedupKey("Skeleton Knight in Another World"),
  );
  assert.equal(franchiseDedupKey("Re:Zero 2026"), franchiseDedupKey("Re:Zero"));
  assert.equal(
    franchiseDedupKey("Silo Season 9"),
    franchiseDedupKey("Silo"),
    "a later season is the same franchise and must share a key",
  );
  assert.notEqual(
    franchiseDedupKey("Mushoku Tensei: Jobless Reincarnation"),
    franchiseDedupKey("Re:Zero - Starting Life in Another World"),
    "distinct shows must keep separate keys",
  );
});

// Loads the real franchise-root module over scripted mappings and a fixed Kitsu relation graph.
function franchiseRootModule(cwIds: Record<string, string>, imdb: Record<string, number>) {
  const lookups: string[] = [];
  const parseKitsuId = (id: string) => (/^kitsu:\d+$/.test(id) ? Number(id.slice(6)) : null);
  const prequels: Record<number, number> = { 49002: 39431 };
  const api = loadModule(
    "src/lib/providers/anime-franchise-root.ts",
    {
      "@/lib/anime-cw-ids": { getAnimeCwId: (id: string) => cwIds[id] ?? null },
      "@/lib/memory-profiler": { registerCache: () => {} },
      "./anime-mapping": {
        externalToKitsu: async () => null,
        imdbToKitsu: async (id: string) => {
          lookups.push(id);
          if (!(id in imdb)) throw new Error("unmapped");
          return imdb[id];
        },
      },
      "./kitsu": {
        parseKitsuId,
        kitsuRelated: async (id: number) =>
          id in prequels
            ? [{ role: "prequel", meta: { id: `kitsu:${prequels[id]}`, type: "series" } }]
            : [],
      },
      "@/lib/streams/anime-identity-core": { isScopedSplitFranchiseRoot: () => false },
    },
    {
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      window: { setTimeout: () => 0, clearTimeout: () => {} },
    },
  );
  return { franchiseRoot: api.franchiseRoot as (id: string) => Promise<string>, lookups };
}

test("an imdb id resolves to the same franchise root as its Kitsu id", async () => {
  const mapped = franchiseRootModule({ tt13293588: "kitsu:49002" }, {});
  assert.equal(await mapped.franchiseRoot("kitsu:49002"), "kitsu:39431");
  assert.equal(await mapped.franchiseRoot("tt13293588"), "kitsu:39431");
  assert.deepEqual(mapped.lookups, [], "a known Continue Watching mapping needs no lookup");

  const looked = franchiseRootModule({}, { tt13293588: 49002 });
  assert.equal(await looked.franchiseRoot("tt13293588"), "kitsu:39431");
  assert.deepEqual(looked.lookups, ["tt13293588"]);

  const unmapped = franchiseRootModule({}, {});
  assert.equal(await unmapped.franchiseRoot("tt0000001"), "tt0000001");
});

test("the Continue Watching card enriches before it hands the episode to the player", async () => {
  const kitsu = {
    _id: "kitsu:49002",
    type: "series",
    name: "Mushoku Tensei",
    state: { season: 1, episode: 6, video_id: "kitsu:49002:6", timeOffset: 10, duration: 100 },
  };
  const h = continueCardHarness({ aniZip: MUSHOKU });
  h.buttons(h.render({ item: kitsu }))[1].props.onClick({ stopPropagation() {} });
  await flushPromises();
  assert.deepEqual(h.calls.aniZip, [["kitsu", 49002]]);
  const episode = h.calls.openPicker.at(-1)?.[1] as Record<string, unknown>;
  assert.equal(episode.tvdbEpisodeId, 11872046);
  assert.equal(episode.imdbSeason, 3);
  assert.equal(episode.kitsuStreamId, "kitsu:49002:6");

  const imdb = continueCardHarness({
    animeCwId: (id) => (id === "tt13293588" ? "kitsu:49002" : null),
  });
  const show = {
    ...kitsu,
    _id: "tt13293588",
    state: { ...kitsu.state, video_id: "tt13293588:3:6" },
  };
  imdb.buttons(imdb.render({ item: show }))[1].props.onClick({ stopPropagation() {} });
  await flushPromises();
  assert.deepEqual(imdb.calls.aniZip, [], "imdb ids are not looked up on AniZip");
  const played = imdb.calls.openPicker.at(-1)?.[1] as Record<string, unknown>;
  assert.equal(played.sourceMetaId, "kitsu:49002");
});

const SEQUEL_BASE_ENTRY = {
  mappings: { kitsu_id: 43806, thetvdb_id: 400001, imdb_id: "tt13875348" },
  episodes: {
    "1": { seasonNumber: 1, episodeNumber: 1 },
    "12": { seasonNumber: 1, episodeNumber: 12 },
  },
};

const SEQUEL_SECOND_SEASON_ENTRY = {
  mappings: { kitsu_id: 49711, thetvdb_id: 400001, imdb_id: "tt13875348" },
  episodes: {
    "1": { seasonNumber: 2, episodeNumber: 1 },
    "4": { seasonNumber: 2, episodeNumber: 4 },
  },
};

test("an imdb keyed season 2 play never lands its progress on the season 1 list entry", () => {
  const pairs = animeCoordPairs({ season: 2, episode: 4 });
  assert.deepEqual(pairs, [[2, 4]]);
  assert.equal(findAnimeEntryNumber(SEQUEL_BASE_ENTRY, pairs), null);
});

test("the sibling entry that actually aired the season supplies the tracker episode number", () => {
  const windows = [
    { anidbId: 14205, season: 1, offset: 0 },
    { anidbId: 17654, season: 2, offset: 0 },
  ];
  assert.deepEqual(selectSiblingWindows(windows, 2, 14205), [17654]);
  assert.equal(
    findAnimeEntryNumber(SEQUEL_SECOND_SEASON_ENTRY, animeCoordPairs({ season: 2, episode: 4 })),
    4,
  );
});

async function autosaveAnime(
  metaId: string,
  episode: Record<string, unknown>,
  identity: { kitsuId: number; number: number } | null,
  patch: { isAnime?: boolean; absolute?: number | null } = {},
) {
  const h = playbackPersistenceHarness();
  h.enableAnimeSync();
  h.setIdentityResolver(async () => identity);
  h.dependencies.absoluteEntryNumber = async () => patch.absolute ?? null;
  const base = playbackParams(episode.season as number, episode.episode as number);
  const p = { ...base, src: { ...base.src, meta: { ...base.src.meta, id: metaId }, episode } };
  if (patch.isAnime) Object.assign(p.src, { isAnime: true });
  h.render(p);
  h.render({ ...p, snap: { ...p.snap, status: "playing", positionSec: 1000, durationSec: 1200 } });
  h.clock(1000);
  h.tick();
  await new Promise((r) => setTimeout(r, 0));
  return { requests: h.identityRequests, progress: h.trackerProgress };
}

test("an imdb keyed Continue Watching play no longer drops the AniList and MAL sync", async () => {
  const { requests, progress } = await autosaveAnime(
    "tt0000777",
    { season: 9, episode: 9 },
    { kitsuId: 99, number: 9 },
    { isAnime: true, absolute: 186 },
  );
  assert.deepEqual(requests[0].slice(0, 3), [
    "tt0000777",
    "tt100",
    { season: 9, episode: 9, imdbSeason: 9, imdbEpisode: 9 },
  ]);
  assert.deepEqual(
    progress.map((call) => call.slice(0, 3)),
    [
      ["anilist", "kitsu:99", 186],
      ["mal", "kitsu:99", 186],
    ],
    "the entry number, not the TVDB number, reaches the trackers",
  );
});

test("multi-season sync prefers the season-scoped identity over the base track id", async () => {
  const episode = { season: 2, episode: 4, imdbSeason: 2, imdbEpisode: 4 };
  const scoped = await autosaveAnime("kitsu:43806", episode, { kitsuId: 49711, number: 4 });
  assert.equal(scoped.requests.length, 1, "a base track id alone must not block resolution");
  assert.deepEqual(
    scoped.progress.map((call) => call.slice(0, 3)),
    [
      ["anilist", "kitsu:49711", 4],
      ["mal", "kitsu:49711", 4],
    ],
  );
  const unresolved = await autosaveAnime("kitsu:43806", episode, null);
  assert.deepEqual(
    unresolved.progress.map((call) => call.slice(0, 2)),
    [
      ["anilist", "kitsu:43806"],
      ["mal", "kitsu:43806"],
    ],
    "the base entry is still synced when no season identity exists",
  );
});

test("the AniList resolver still refuses to guess a media id from an imdb id", async () => {
  const requests: unknown[] = [];
  const mapped: number[] = [];
  const sync = loadModule("src/lib/anilist/sync.ts", {
    "@/lib/active-profile-id": { activeProfileId: () => "a" },
    "@/lib/providers/anime-mapping": {
      kitsuToAnilist: async (id: number) => {
        mapped.push(id);
        return 108465;
      },
    },
    "./client": {
      AnilistApiError: class extends Error {},
      anilistRequest: async (...args: unknown[]) => {
        requests.push(args);
        return { Media: { id: 7 } };
      },
    },
    "./session": { isAuthenticated: () => true, getSession: () => ({}) },
  });
  assert.equal(await sync.resolveAnilistMediaId("tt13293588"), null);
  assert.equal(await sync.resolveAnilistMediaId("tmdb:tv:94664"), null);
  assert.deepEqual([mapped, requests], [[], []], "an imdb id triggers no mapping lookup");
  assert.equal(await sync.resolveAnilistMediaId("kitsu:49002"), 108465);
  assert.equal(await sync.resolveAnilistMediaId("anilist:21"), 21);
  assert.equal(await sync.resolveAnilistMediaId("mal:59193"), 7);
});

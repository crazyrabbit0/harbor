// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";

const identityModule = () =>
  loadModule("src/lib/streams/anime-identity.ts", {
    "@/lib/providers/anizip": { aniZipByKitsu: async () => null },
    "@/lib/providers/anime-mapping": {
      externalToKitsu: async () => null,
      findSiblingAnidbEntries: async () => [],
      imdbToKitsu: async () => null,
      kitsuToAnidb: async () => null,
      loadAnidbMaps: async () => ({}),
      tmdbTvToKitsu: async () => null,
    },
    "@/lib/providers/anime-franchise-root": { franchiseRoot: async () => null },
    "./anime-identity-core": {
      animeAbsoluteFromScopedId: () => null,
      animeCoordPairs: () => [],
      findAnimeEntryNumber: () => null,
      isScopedSplitFranchiseRoot: () => false,
    },
    "./stream-ids": { buildStreamIds: () => [] },
    "@/lib/debug": { dlog: () => {} },
  });

const IDENTITY = { streamId: "kitsu:42:17", kitsuId: 42, number: 17 };
const EPISODE = { season: 2, episode: 5, imdbSeason: 2, imdbEpisode: 5 };

function skipIntro() {
  const calls = { resolve: [] as unknown[][], mal: [] as number[], aniSkip: [] as unknown[][] };
  const empty = async () => [];
  const h = hookHarness("src/lib/skip-intro/index.ts", "run", {
    "../streams/anime-identity": {
      animeIdentityEligible: identityModule().animeIdentityEligible,
      resolveAnimeIdentity: async (...args: unknown[]) => (calls.resolve.push(args), IDENTITY),
    },
    "./adcorpus": { fetchAdSegments: empty },
    "./fingerprint": { fingerprint: () => ({ content: "", source: "" }) },
    "./aniskip": {
      kitsuToMal: async (id: number) => (calls.mal.push(id), 99),
      fetchAniSkipSegments: async (...args: unknown[]) => {
        calls.aniSkip.push(args);
        return [{ kind: "intro", startSec: 10, endSec: 90, source: "aniskip" }];
      },
    },
    "./chapters": { chaptersToSegments: () => [] },
    "./consensus": { dropOutvoted: (l: unknown) => l, dropSelfContradicting: (l: unknown) => l },
    "./introdb-app": { fetchIntroDbAppSegments: empty },
    "./skipdb": { fetchSkipDbSegments: empty },
    "./theintrodb": {
      fetchIntroDbSegments: empty,
      readTheIntroDbKey: () => "",
      setTheIntroDbApiKey: () => {},
    },
    "../simkl/activities": { getLocalCache: () => null },
    "../settings": { useSettings: () => ({ settings: {} }) },
  });
  const chapters: unknown[] = [];
  h.exports.run = (a: { id: string; episode: unknown }) =>
    h.exports.useSkipSegments({ id: a.id }, a.episode, chapters, 1400);
  return { h, calls };
}

test("the eligibility gate accepts tt and tmdb series", () => {
  const { animeIdentityEligible } = identityModule();
  assert.equal(animeIdentityEligible("tt123", EPISODE), true);
  assert.equal(animeIdentityEligible("tmdb:tv:55", EPISODE), true);
  assert.equal(animeIdentityEligible("tmdb:movie:55", EPISODE), false);
  assert.equal(
    animeIdentityEligible("tt123", { ...EPISODE, kitsuStreamId: "kitsu:1:5" }),
    false,
    "an id that already names its entry needs no mapping",
  );
});

test("AniSkip on a tt-opened anime uses the resolved entry and its episode number", async () => {
  const { h, calls } = skipIntro();
  const args = { id: "tt123", episode: EPISODE };
  h.render(args);
  await flushPromises();
  h.render(args);
  await flushPromises();
  const segments = h.render(args);
  assert.deepEqual(calls.resolve[0]?.[0], "tt123");
  assert.deepEqual(calls.mal, [42], "the lookup must use the resolved entry");
  assert.deepEqual(
    calls.aniSkip,
    [[99, 17, 1400]],
    "AniSkip counts episodes within the entry, not the IMDb season",
  );
  assert.deepEqual(
    segments.map((s: { source: string }) => s.source),
    ["aniskip"],
  );
});

test("prefetch warms the same mapping the player will use", async () => {
  const { h, calls } = skipIntro();
  h.exports.prefetchSegments({ id: "tt123" }, EPISODE);
  await flushPromises();
  assert.equal(calls.resolve[0]?.[0], "tt123");
  assert.deepEqual(
    calls.aniSkip,
    [[99, 17, 0]],
    "prefetch must request the entry-relative episode",
  );

  const skipped = skipIntro();
  skipped.h.exports.prefetchSegments({ id: "tt123" }, { ...EPISODE, kitsuStreamId: "kitsu:1:5" });
  await flushPromises();
  assert.deepEqual(skipped.calls.resolve, [], "an ineligible episode is not mapped");
});

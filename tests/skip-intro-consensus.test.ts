// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as consensus from "../src/lib/skip-intro/consensus";
import type { SkipKind, SkipSegment, SkipSource } from "../src/lib/skip-intro/types";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

const { dropOutvoted, dropSelfContradicting } = consensus;

const seg = (source: SkipSource, startSec: number, endSec: number, kind: SkipKind = "intro") =>
  ({ kind, startSec, endSec, source }) satisfies SkipSegment;

const kept = (lists: SkipSegment[][]) =>
  dropOutvoted(lists)
    .flat()
    .map((s) => s.source);

test("a top-priority intro two other sources contradict is dropped", () => {
  // Family Guy S6E6: SkipDB returns the S6E5 intro, TheIntroDB and introdb.app agree on the real one.
  const lists = [
    [seg("skipdb", 20.8, 52.3)],
    [seg("introdb", 0, 30.5)],
    [seg("introdb-app", 0.5, 31.5)],
  ];
  assert.deepEqual(kept(lists), ["introdb", "introdb-app"]);
});

test("an intro backed by a second source survives a lone dissenter", () => {
  const lists = [[seg("skipdb", 0, 31)], [seg("introdb", 0, 30)], [seg("introdb-app", 22, 52)]];
  assert.deepEqual(kept(lists), ["skipdb", "introdb"]);
});

test("a lone source and a single disagreeing source both stay for priority to decide", () => {
  const lists = [[seg("skipdb", 20, 50)], [seg("introdb", 0, 30)]];
  assert.deepEqual(kept(lists), ["skipdb", "introdb"]);
});

test("an intro inside the same source's recap drops both, so the next source's intro wins", () => {
  // Family Guy S9E2: TheIntroDB has intro 0-30 inside recap 0-52; the real intro is 0:25-0:55.
  const introdb = [seg("introdb", 0, 52, "recap"), seg("introdb", 0, 30)];
  const app = [seg("introdb-app", 28, 59)];
  const merged = dropOutvoted([introdb, app].map(dropSelfContradicting)).flat();
  assert.deepEqual(
    merged.map((s) => [s.source, s.kind, s.startSec, s.endSec]),
    [["introdb-app", "intro", 28, 59]],
  );
});

test("the segment pipeline runs every source through dropSelfContradicting", async () => {
  const empty = async () => [];
  const h = hookHarness("src/lib/skip-intro/index.ts", "run", {
    "../streams/anime-identity": {
      animeIdentityEligible: () => false,
      resolveAnimeIdentity: async () => null,
    },
    "./adcorpus": { fetchAdSegments: empty },
    "./fingerprint": { fingerprint: () => ({ content: "", source: "" }) },
    "./aniskip": { kitsuToMal: async () => null, fetchAniSkipSegments: empty },
    "./chapters": { chaptersToSegments: () => [] },
    "./consensus": consensus,
    "./introdb-app": { fetchIntroDbAppSegments: async () => [seg("introdb-app", 28, 59)] },
    "./skipdb": { fetchSkipDbSegments: empty },
    "./theintrodb": {
      fetchIntroDbSegments: async () => [seg("introdb", 0, 52, "recap"), seg("introdb", 0, 30)],
      readTheIntroDbKey: () => "",
      setTheIntroDbApiKey: () => {},
    },
    "../simkl/activities": { getLocalCache: () => null },
    "../settings": { useSettings: () => ({ settings: {} }) },
  });
  const chapters: unknown[] = [];
  const episode = { season: 9, episode: 2, imdbSeason: 9, imdbEpisode: 2 };
  h.exports.run = () => h.exports.useSkipSegments({ id: "tt0182576" }, episode, chapters, 1400);
  h.render();
  await flushPromises();
  const segments: SkipSegment[] = h.render();
  assert.deepEqual(
    segments.map((s) => [s.source, s.kind, s.startSec, s.endSec]),
    [["introdb-app", "intro", 28, 59]],
  );
});

test("a recap that ends where the intro starts is not a contradiction", () => {
  const list = [seg("skipdb", 0, 52.2, "recap"), seg("skipdb", 52.3, 82.3), seg("skipdb", 51, 82)];
  assert.equal(dropSelfContradicting(list.slice(0, 2)).length, 2);
  assert.equal(dropSelfContradicting([list[0], list[2]]).length, 2, "1.2s of overlap is tolerated");
});

test("segments of other kinds and ads are never outvoted", () => {
  const lists = [
    [seg("adcorpus", 10, 40, "ad")],
    [seg("skipdb", 1200, 1260, "outro")],
    [seg("introdb", 0, 30), seg("introdb", 1220, 1270, "intro")],
    [seg("introdb-app", 0.5, 31)],
  ];
  assert.deepEqual(kept(lists), ["adcorpus", "skipdb", "introdb", "introdb", "introdb-app"]);
});

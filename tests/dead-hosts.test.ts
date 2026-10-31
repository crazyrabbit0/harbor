import assert from "node:assert/strict";
import test from "node:test";
import "./_localstorage-stub";

const requested: string[] = [];
const realFetch = globalThis.fetch;

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as { url?: string }).url ?? String(input);
}

globalThis.fetch = (async (input: unknown) => {
  requested.push(urlOf(input));
  return new Response("{}", { status: 404 });
}) as typeof fetch;

const adcorpus = await import("@/lib/skip-intro/adcorpus");
const crowd = await import("@/lib/subtitles/autosync/crowd-db");
const deepLink = await import("@/lib/music/deep-link");
const endpoints = await import("@/lib/config/endpoints");

const DEAD = /harbor\.site/i;
const CUES: Array<[number, number]> = Array.from({ length: 12 }, (_, i) => [i * 4, i * 4 + 2]);

test.after(() => {
  globalThis.fetch = realFetch;
});

test("ad corpus lookups make no network request while no signed feed exists", async () => {
  requested.length = 0;
  const segments = await adcorpus.fetchAdSegments("tt0111161", "ih_abcdef", true);
  assert.deepEqual(segments, []);
  assert.deepEqual(requested, []);
});

test("community sync is off by default and needs no request", async () => {
  requested.length = 0;
  assert.equal(crowd.DEFAULT_COMMUNITY_SYNC_URL, "");
  assert.equal(crowd.crowdConfigFromSettings({}), null);
  assert.equal(crowd.crowdConfigFromSettings({ communitySyncUrl: "   " }), null);
  const off = { baseUrl: crowd.DEFAULT_COMMUNITY_SYNC_URL };
  assert.equal(await crowd.reportCrowdFeedback(CUES, true, off), false);
  assert.deepEqual(requested, []);
});

test("community sync still reaches a server the user configures", async () => {
  requested.length = 0;
  const cfg = crowd.crowdConfigFromSettings({ communitySyncUrl: "https://sync.example.test/" });
  assert.equal(cfg?.baseUrl, "https://sync.example.test/");
  await crowd.reportCrowdFeedback(CUES, true, cfg!);
  assert.equal(requested.length, 1);
  assert.equal(requested[0].startsWith("https://sync.example.test/api/v1/feedback"), true);
});

test("music links are direct harbor:// links with no harbor.site host", () => {
  const path = deepLink.musicTrackPath("AC/DC", "Thunderstruck");
  const url = deepLink.musicBounceUrl(path);
  assert.equal(url.startsWith("harbor://music/track/"), true);
  assert.equal(DEAD.test(url), false);
  assert.deepEqual(deepLink.parseMusicDeepLink(url), {
    kind: "track",
    artist: "AC/DC",
    name: "Thunderstruck",
  });
});

test("endpoints name no sync or relay host on harbor.site", () => {
  const values = Object.values(endpoints).filter((v): v is string => typeof v === "string");
  for (const value of values) assert.equal(/(sync|app)\.harbor\.site/i.test(value), false, value);
});

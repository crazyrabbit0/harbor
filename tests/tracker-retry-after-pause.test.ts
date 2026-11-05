// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";

test("a lookup that failed after a long pause is retried, a resolved one stays cached", async () => {
  let kitsu: number | null = null;
  let lookups = 0;
  const api = loadModule("src/lib/streams/anime-identity.ts", {
    "@/lib/providers/anizip": {
      aniZipByKitsu: async () => ({ episodes: { "5": { seasonNumber: 1, episodeNumber: 5 } } }),
    },
    "@/lib/providers/anime-mapping": {
      externalToKitsu: async () => null,
      findSiblingAnidbEntries: async () => [],
      imdbToKitsu: async () => {
        lookups++;
        return kitsu;
      },
      kitsuToAnidb: async () => null,
      loadAnidbMaps: async () => ({}),
      tmdbTvToKitsu: async () => null,
    },
    "@/lib/providers/anime-franchise-root": { franchiseRoot: async () => null },
    "./anime-identity-core": {
      animeAbsoluteFromScopedId: () => null,
      animeCoordPairs: () => [[1, 5]],
      findAnimeEntryNumber: (_az: unknown, pairs: number[][]) => pairs[0][1],
      isScopedSplitFranchiseRoot: () => false,
    },
    "./stream-ids": { buildStreamIds: () => [] },
    "@/lib/debug": { dlog: () => {} },
  });
  const coords = { season: 1, episode: 5 };
  assert.equal(await api.resolveAnimeIdentity("tt1", null, coords), null);
  await flushPromises();
  kitsu = 42;
  assert.deepEqual(await api.resolveAnimeIdentity("tt1", null, coords), {
    streamId: "kitsu:42:5",
    kitsuId: 42,
    number: 5,
  });
  await flushPromises();
  await api.resolveAnimeIdentity("tt1", null, coords);
  assert.equal(lookups, 2);
});

test("a truncated end that reloads in place does not lock Simkl out of the real end", async () => {
  let position = 0;
  const starts: number[] = [];
  const stops: number[] = [];
  const watched: unknown[] = [];
  const h = hookHarness(
    "src/lib/simkl/scrobble-hook.ts",
    "useSimklScrobble",
    {
      "./provider": { useSimkl: () => ({ isConnected: true }) },
      "./scrobble": {
        simklScrobble: async (action: string, _id: string, _ep: unknown, pct: number) => {
          if (action === "start") starts.push(pct);
        },
        buildBody: (_id: string, _ep: unknown, pct: number) => ({ pct }),
      },
      "./pending-sync": { clearPendingWatch: () => {}, recordPendingWatch: () => {} },
      "./record-watched": {
        recordWatchedFallback: async (...args: unknown[]) => (watched.push(args), true),
      },
      "@/lib/player/playback-clock": {
        getPlaybackPosition: () => position,
        subscribePlaybackClock: () => () => {},
      },
      "@/lib/settings": {
        useSettingsSelector: (pick: (s: object) => unknown) => pick({ simklScrobbleEnabled: true }),
      },
      "./config": {
        SIMKL_API_BASE: "https://api.simkl.test",
        SIMKL_APP_NAME: "harbor",
        SIMKL_APP_VERSION: "1",
        SIMKL_CLIENT_ID: "cid",
        SIMKL_USER_AGENT: "ua",
        SIMKL_WATCHED_RATIO: 0.9,
      },
      "./session": { getSession: () => ({ accessToken: "token" }) },
    },
    {
      window: { addEventListener: () => {}, removeEventListener: () => {} },
      fetch: (url: string, init: { body: string }) => {
        if (url.includes("/scrobble/stop")) stops.push(JSON.parse(init.body).pct);
        return Promise.resolve();
      },
    },
  );
  const src = {
    meta: { id: "tt9", name: "Show" },
    imdbId: "tt9",
    episode: { season: 1, episode: 2 },
  };
  const at = (status: string, sec: number) => {
    position = sec;
    h.render({ src, snap: { status, positionSec: sec, durationSec: 1500 } });
  };
  at("playing", 300);
  at("ended", 600);
  at("loading", 600);
  at("playing", 600);
  at("ended", 1490);
  await flushPromises();
  assert.deepEqual(starts, [20, 40], "the reload starts a new scrobble");
  assert.equal(stops.length, 2, "the real end is still sent");
  assert.equal(stops[0], 40);
  assert.ok(stops[1] > 99);
  assert.equal(watched.length, 1, "only the real end is written to history");
});

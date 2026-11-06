// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import { simklScrobbleHarness } from "./helpers/tracker-scrobble-harness.ts";
import { trackerProviderHarness } from "./helpers/tracker-provider-harness.ts";
import {
  armOnlineFlush,
  clearPendingWatch,
  flushPendingWatches,
  listPendingWatches,
  recordPendingWatch,
} from "../src/lib/simkl/pending-sync.ts";

function clearPending() {
  localStorage.removeItem("harbor.simkl.pendingwatched.v1.default");
}

test("watches without a usable identity are not queued", () => {
  clearPending();
  recordPendingWatch("", { season: 1, episode: 2 });
  recordPendingWatch("tt1234567", { season: 1, episode: 0 });
  recordPendingWatch("tt1234567", { season: -1, episode: 2 });
  assert.deepEqual(listPendingWatches(), []);
});

test("movie watches without season or episode queue as movies", () => {
  clearPending();
  recordPendingWatch("tt1234567", undefined);
  const list = listPendingWatches();
  assert.equal(list.length, 1);
  assert.equal(list[0].metaId, "tt1234567");
  assert.equal(list[0].episode, undefined);
  clearPending();
});

test("failed terminal watches are recorded and survive a reload", () => {
  clearPending();
  recordPendingWatch("tt1234567", { season: 2, episode: 5 }, "tt1234567");
  const list = listPendingWatches();
  assert.equal(list.length, 1);
  assert.equal(list[0].metaId, "tt1234567");
  assert.equal(list[0].episode?.season, 2);
  assert.equal(list[0].episode?.episode, 5);
  assert.equal(list[0].imdb, "tt1234567");
});

test("full episode identity survives the round trip", () => {
  clearPending();
  recordPendingWatch(
    "kitsu:1",
    { season: 1, episode: 2, imdbSeason: 1, imdbEpisode: 2, tvdbEpisodeId: 999 },
    "tt1234567",
  );
  const list = listPendingWatches();
  assert.equal(list.length, 1);
  assert.equal(list[0].episode?.imdbSeason, 1);
  assert.equal(list[0].episode?.imdbEpisode, 2);
  assert.equal(list[0].episode?.tvdbEpisodeId, 999);
  clearPending();
});

test("re-recording the same episode replaces instead of duplicating", () => {
  clearPending();
  recordPendingWatch("kitsu:1", { season: 1, episode: 2 });
  recordPendingWatch("kitsu:1", { season: 1, episode: 2 });
  assert.equal(listPendingWatches().length, 1);
});

test("different episodes queue independently", () => {
  clearPending();
  recordPendingWatch("kitsu:1", { season: 1, episode: 2 });
  recordPendingWatch("kitsu:1", { season: 1, episode: 3 });
  assert.equal(listPendingWatches().length, 2);
});

test("flush with no session is a no-op that preserves entries", async () => {
  clearPending();
  recordPendingWatch("kitsu:1", { season: 1, episode: 2 });
  const r = await flushPendingWatches({
    hasSession: () => false,
    stopScrobble: async () => true,
    recordWatched: async () => true,
  });
  assert.equal(r.flushed, 0);
  assert.equal(r.remaining, 1);
  assert.equal(listPendingWatches().length, 1);
  clearPending();
});

test("flush replays the terminal stop before the history write", async () => {
  clearPending();
  const stops: Array<{ metaId: string; episode?: { season: number; episode: number } }> = [];
  const watched: Array<{
    metaId: string;
    episode?: { season: number; episode: number };
    imdb?: string;
  }> = [];
  const deps = {
    hasSession: () => true,
    stopScrobble: async (
      metaId: string,
      episode: { season: number; episode: number } | undefined,
    ) => {
      stops.push({ metaId, episode });
      return metaId !== "tt0000000";
    },
    recordWatched: async (
      metaId: string,
      episode: { season: number; episode: number } | undefined,
      imdb?: string,
    ) => {
      watched.push({ metaId, episode, imdb });
      return metaId !== "tt0000000";
    },
  };
  recordPendingWatch("kitsu:1", { season: 1, episode: 2, tvdbEpisodeId: 999 }, "tt1234567");
  recordPendingWatch("tt0000000", { season: 1, episode: 1 });
  const r = await flushPendingWatches(deps);
  assert.equal(r.flushed, 1);
  assert.equal(r.remaining, 1);
  assert.deepEqual(stops, [
    { metaId: "tt0000000", episode: { season: 1, episode: 1 } },
    { metaId: "kitsu:1", episode: { season: 1, episode: 2, tvdbEpisodeId: 999 } },
  ]);
  assert.deepEqual(watched, [
    { metaId: "tt0000000", episode: { season: 1, episode: 1 }, imdb: undefined },
    {
      metaId: "kitsu:1",
      episode: { season: 1, episode: 2, tvdbEpisodeId: 999 },
      imdb: "tt1234567",
    },
  ]);
  assert.equal(listPendingWatches().length, 1);
  assert.equal(listPendingWatches()[0].metaId, "tt0000000");
  clearPending();
});

test("overlapping flushes replay each queued watch once", async () => {
  clearPending();
  recordPendingWatch("tt1224144", { season: 7, episode: 22 });
  recordPendingWatch("tt1224144", { season: 7, episode: 21 });
  const writes: number[] = [];
  const deps = {
    hasSession: () => true,
    stopScrobble: async () => true,
    recordWatched: async (_m: string, ep: { episode: number } | undefined) => {
      writes.push(ep?.episode ?? 0);
      await new Promise((r) => setTimeout(r, 5));
      return true;
    },
  };
  await Promise.all([
    flushPendingWatches(deps),
    flushPendingWatches(deps),
    flushPendingWatches(deps),
  ]);
  assert.deepEqual(writes.sort(), [21, 22]);
  assert.equal(listPendingWatches().length, 0);
});

test("a confirmed direct write clears only its own queued watch", () => {
  clearPending();
  recordPendingWatch("tt1224144", { season: 7, episode: 22 }, "tt1224144");
  recordPendingWatch("tt1224144", { season: 7, episode: 21 }, "tt1224144");
  clearPendingWatch("tt1224144", { season: 7, episode: 22 });
  assert.deepEqual(
    listPendingWatches().map((p) => p.episode?.episode),
    [21],
  );
  clearPending();
});

test("entry stays queued when the stop fails even if history succeeds", async () => {
  clearPending();
  recordPendingWatch("kitsu:1", { season: 1, episode: 2 });
  const r = await flushPendingWatches({
    hasSession: () => true,
    stopScrobble: async () => false,
    recordWatched: async () => true,
  });
  assert.equal(r.flushed, 0);
  assert.equal(r.remaining, 1);
  assert.equal(listPendingWatches().length, 1);
  clearPending();
});

test("online arming is safe without a window", () => {
  const off = armOnlineFlush({
    hasSession: () => false,
    stopScrobble: async () => false,
    recordWatched: async () => false,
  });
  assert.equal(typeof off, "function");
  off();
});

test("leaving an episode past the watched mark queues it only when the history write fails", async () => {
  for (const historyOk of [false, true]) {
    const h = simklScrobbleHarness();
    h.state.historyOk = historyOk;
    h.at({ status: "playing", sec: 300 });
    h.at({ status: "paused", sec: 1450 });
    h.at({ status: "paused", sec: 1450, episode: 3 });
    await h.settle();
    assert.equal(h.watched.length, 1);
    assert.deepEqual(
      h.queue().map((p) => [p.metaId, p.episode?.episode, p.imdb]),
      historyOk ? [] : [["tt9", 2, "tt9"]],
    );
  }
});

test("exiting the player past the watched mark queues the watch until the history write confirms it", async () => {
  for (const historyOk of [false, true]) {
    const h = simklScrobbleHarness();
    h.state.historyOk = historyOk;
    h.at({ status: "playing", sec: 300 });
    h.at({ status: "paused", sec: 1450 });
    h.unmount();
    assert.equal(h.queue().length, 1, "queued before the history write settles");
    await h.settle();
    assert.deepEqual(
      h.queue().map((p) => [p.metaId, p.episode?.episode, p.imdb]),
      historyOk ? [] : [["tt9", 2, "tt9"]],
    );
  }
});

test("closing the window past the watched mark queues the watch for the next launch", () => {
  const h = simklScrobbleHarness();
  h.at({ status: "playing", sec: 300 });
  h.at({ status: "paused", sec: 1450 });
  h.pagehide();
  assert.deepEqual(
    h.queue().map((p) => [p.metaId, p.episode?.episode]),
    [["tt9", 2]],
  );
  assert.equal(h.beacons.at(-1)?.action, "stop");
});

function simklProvider() {
  let session: object | null = { accessToken: "t", username: "u" };
  const seen = {
    armed: null as any,
    flushes: 0,
    stops: [] as unknown[][],
    watched: [] as unknown[][],
    notify: () => {},
  };
  const h = trackerProviderHarness("src/lib/simkl/provider.tsx", "SimklProvider", {
    "./device-auth": {},
    "./session": {
      getSession: () => session,
      setSession: () => {},
      subscribeSession: (fn: () => void) => {
        seen.notify = fn;
        return () => {};
      },
    },
    "@/lib/secret-store": { subscribeSecretsReady: () => () => {} },
    "./ids": {},
    "./history": {},
    "./pending-sync": {
      armOnlineFlush: (deps: unknown) => ((seen.armed = deps), () => {}),
      flushPendingWatches: async () => (seen.flushes++, { flushed: 0, remaining: 0 }),
    },
    "./record-watched": {
      recordWatchedFallback: async (...args: unknown[]) => (seen.watched.push(args), true),
    },
    "./scrobble": {
      simklScrobble: async (...args: unknown[]) => (seen.stops.push(args), true),
    },
  });
  return { h, seen, signOut: () => ((session = null), seen.notify()) };
}

test("the provider arms the online flush with a 100% stop and a history write, and flushes once a session exists", async () => {
  const { h, seen, signOut } = simklProvider();
  h.render();
  const episode = { season: 1, episode: 2 };
  assert.equal(seen.armed.hasSession(), true);
  assert.equal(await seen.armed.stopScrobble("tt1", episode), true);
  assert.deepEqual(seen.stops, [["stop", "tt1", episode, 100]]);
  await seen.armed.recordWatched("tt1", episode, "tt9");
  await seen.armed.recordWatched("tt1", episode);
  assert.deepEqual(seen.watched, [
    ["tt1", episode, { imdb: "tt9" }],
    ["tt1", episode, undefined],
  ]);
  assert.equal(seen.flushes, 1);
  signOut();
  h.render();
  assert.equal(seen.armed.hasSession(), false);
  assert.equal(seen.flushes, 1, "no flush without a session");
});

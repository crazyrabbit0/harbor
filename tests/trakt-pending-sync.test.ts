// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import {
  armOnlineFlush,
  flushPendingStops,
  listPendingStops,
  recordPendingStop,
} from "../src/lib/trakt/pending-sync.ts";
import { trackerProviderHarness } from "./helpers/tracker-provider-harness.ts";

function clearPending() {
  localStorage.removeItem("harbor.trakt.pendingstops.v1.default");
}

test("failed terminal stops below the watched threshold are not queued", () => {
  clearPending();
  recordPendingStop("tt1234567", { season: 1, episode: 2 }, 40);
  assert.deepEqual(listPendingStops(), []);
});

test("failed terminal stops are recorded and survive a reload", () => {
  clearPending();
  recordPendingStop("tt1234567", { season: 1, episode: 2 }, 100);
  const list = listPendingStops();
  assert.equal(list.length, 1);
  assert.equal(list[0].metaId, "tt1234567");
  assert.deepEqual(list[0].episode, { season: 1, episode: 2 });
  assert.equal(list[0].progress, 100);
});

test("re-recording the same episode replaces instead of duplicating", () => {
  clearPending();
  recordPendingStop("tt1234567", { season: 1, episode: 2 }, 85);
  recordPendingStop("tt1234567", { season: 1, episode: 2 }, 100);
  const list = listPendingStops();
  assert.equal(list.length, 1);
  assert.equal(list[0].progress, 100);
});

test("different episodes queue independently", () => {
  clearPending();
  recordPendingStop("tt1234567", { season: 1, episode: 2 }, 100);
  recordPendingStop("tt1234567", { season: 1, episode: 3 }, 100);
  assert.equal(listPendingStops().length, 2);
});

test("flush with no session is a no-op that preserves entries", async () => {
  clearPending();
  recordPendingStop("tt1234567", { season: 1, episode: 2 }, 100);
  const r = await flushPendingStops();
  assert.equal(r.flushed, 0);
  assert.equal(r.remaining, 1);
  assert.equal(listPendingStops().length, 1);
  clearPending();
});

test("online arming is safe without a window", () => {
  const off = armOnlineFlush();
  assert.equal(typeof off, "function");
  off();
});

function traktProvider(outcome: string) {
  let session: object | null = { accessToken: "t", username: "u" };
  const seen = {
    armed: null as any,
    flushes: 0,
    queued: [] as unknown[][],
    commits: [] as unknown[][],
    notify: () => {},
  };
  const h = trackerProviderHarness("src/lib/trakt/provider.tsx", "TraktProvider", {
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
    "./ids": {
      stremioIdToTraktTarget: (id: string) => ({
        ok: true,
        target: { kind: "movie", ids: { id } },
      }),
    },
    "./resolve": {
      commitPlaybackState: async () => {},
      commitWatchedEpisode: async (...args: unknown[]) => (seen.commits.push(args), outcome),
    },
    "./pending-sync": {
      armOnlineFlush: (deps: unknown) => ((seen.armed = deps), () => {}),
      flushPendingStops: async () => (seen.flushes++, { flushed: 0, remaining: 0 }),
      recordPendingStop: (...args: unknown[]) => seen.queued.push(args),
    },
    "@/lib/active-profile-id": { activeProfileId: () => "p" },
  });
  return { h, seen, signOut: () => ((session = null), seen.notify()) };
}

test("the provider queues a stop Trakt did not confirm and leaves confirmed ones alone", async () => {
  const stop = { metaId: "tt1", episode: { season: 1, episode: 2 }, progress: 100 };
  for (const outcome of ["recorded", "already-recorded", "not-found"]) {
    const { h, seen } = traktProvider(outcome);
    await h.render().scrobble("stop", stop);
    assert.equal(seen.commits.length, 1, outcome);
    assert.deepEqual(seen.queued, [], outcome);
  }
  const { h, seen } = traktProvider("failed");
  await h.render().scrobble("stop", stop);
  assert.deepEqual(seen.queued, [["tt1", { season: 1, episode: 2 }, 100]]);
});

test("the provider arms the online flush with the confirmed commit and flushes once a session exists", async () => {
  const { h, seen, signOut } = traktProvider("recorded");
  h.render();
  assert.equal(seen.armed.hasSession(), true);
  assert.deepEqual(await seen.armed.commit({ kind: "movie" }, "tt1", 100), "recorded");
  assert.deepEqual(seen.commits, [[{ kind: "movie" }, "tt1", 100]]);
  assert.deepEqual(seen.armed.resolveTarget("tt1"), { kind: "movie", ids: { id: "tt1" } });
  assert.equal(seen.flushes, 1);
  signOut();
  h.render();
  assert.equal(seen.armed.hasSession(), false);
  assert.equal(seen.flushes, 1, "no flush without a session");
});

test("flush uses injected deps and honors session gate", async () => {
  clearPending();
  let commits = 0;
  const deps = {
    hasSession: () => true,
    resolveTarget: () => ({ kind: "movie", ids: { imdb: "tt1234567" } }) as const,
    commit: async () => {
      commits += 1;
      return "recorded" as const;
    },
  };
  recordPendingStop("tt1234567", undefined, 100);
  assert.equal(listPendingStops().length, 1);
  const r = await flushPendingStops(deps);
  assert.equal(commits, 1);
  assert.equal(r.flushed, 1);
  assert.equal(r.remaining, 0);
  assert.equal(listPendingStops().length, 0);
  clearPending();
});

import assert from "node:assert/strict";
import test from "node:test";
import "./_localstorage-stub.ts";
import * as trakt from "../src/lib/trakt/pending-sync.ts";
import * as simkl from "../src/lib/simkl/pending-sync.ts";
import { loadModule } from "./helpers/hook-harness.ts";

const profile = (id) =>
  localStorage.setItem("harbor.profiles.v1", JSON.stringify({ activeId: id }));
for (const [service, queue, record, list, clear, flush] of [
  [
    "trakt",
    trakt,
    (id) => trakt.recordPendingStop(id, undefined, 100),
    trakt.listPendingStops,
    trakt.clearPendingStops,
    trakt.flushPendingStops,
  ],
  [
    "simkl",
    simkl,
    (id) => simkl.recordPendingWatch(id, undefined),
    simkl.listPendingWatches,
    simkl.clearPendingWatches,
    simkl.flushPendingWatches,
  ],
]) {
  const deps = (service, stop) => ({
    hasSession: () => true,
    resolveTarget: (id) => ({ kind: "movie", ids: { imdb: id } }),
    ...(service === "trakt"
      ? { commit: async (_target, metaId) => stop(metaId) }
      : {
          stopScrobble: async (metaId) => stop(metaId),
          recordWatched: async () => true,
        }),
  });
  test(`${service}: pending watches stay with their profile and keep newest 50`, () => {
    localStorage.clear();
    profile("first");
    for (let i = 0; i < 51; i++) record(`tt${i}`);
    assert.equal(list().length, 50);
    assert.equal(list()[0].metaId, "tt50");
    assert.equal(
      list().some((item) => item.metaId === "tt0"),
      false,
    );
    profile("second");
    assert.deepEqual(list(), []);
    record("tt900");
    clear();
    profile("first");
    assert.equal(list().length, 50);
    localStorage.clear();
  });
  test(`${service}: a profile switch during replay stops the remaining requests`, async () => {
    localStorage.clear();
    profile("first");
    record("tt1");
    record("tt2");
    let stops = 0;
    let history = 0;
    await flush({
      ...deps(service, async () => {
        stops++;
        profile("second");
        return service === "trakt" ? "recorded" : true;
      }),
      recordWatched: async () => {
        history++;
        return true;
      },
    });
    assert.equal(stops, 1);
    assert.equal(history, 0);
    profile("first");
    assert.equal(list().length, 2);
    localStorage.clear();
  });
  test(`${service}: account invalidation interrupts replay within the same profile`, async () => {
    localStorage.clear();
    record("tt1");
    record("tt2");
    let stops = 0;
    await flush(
      deps(service, async () => {
        stops++;
        clear();
        record("tt3");
        return service === "trakt" ? "recorded" : true;
      }),
    );
    assert.equal(stops, 1);
    assert.deepEqual(
      list().map((item) => item.metaId),
      ["tt3"],
    );
    localStorage.clear();
  });
  test(`${service}: connecting, switching or dropping an account clears the queue before the new session is visible`, () => {
    localStorage.clear();
    const clearName = service === "trakt" ? "clearPendingStops" : "clearPendingWatches";
    const clearedWhileSessionWas = [];
    let api;
    const mocks = {
      "@/lib/active-profile-id": {
        activeProfileId: () => "default",
        activeProfileIsPrimary: () => true,
      },
      "@/lib/secret-store": {
        getSecret: () => null,
        setSecret: () => {},
        subscribeSecretsReady: () => () => {},
      },
      "./pending-sync": {
        ...queue,
        [clearName]: () => {
          clearedWhileSessionWas.push(api.getSession()?.username ?? null);
          clear();
        },
      },
      "./config": { REFRESH_THRESHOLD_SEC: 0 },
    };
    api = loadModule(`src/lib/${service}/session.ts`, mocks);
    const session = (username) => ({ accessToken: "t", username });
    record("tt1");
    api.setSession(session("a"));
    assert.equal(list().length, 0, "a first connection starts from an empty queue");
    record("tt2");
    api.setSession(session("a"));
    assert.equal(list().length, 1, "a token refresh for the same account keeps the queue");
    api.setSession(session("b"));
    assert.equal(list().length, 0, "another account does not inherit the queue");
    record("tt3");
    api.setSession(null);
    assert.equal(list().length, 0, "signing out drops the queue");
    assert.deepEqual(clearedWhileSessionWas, [null, "a", "b"]);
    localStorage.clear();
  });
}

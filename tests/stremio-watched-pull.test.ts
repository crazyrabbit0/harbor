// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";
import "./_localstorage-stub.ts";

const source = ts.transpileModule(
  readFileSync(new URL("../src/lib/stremio-watched-pull.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Each load is a fresh module instance, as after an app restart; localStorage persists between loads.
function load(remoteKeys: Set<string> = new Set()) {
  const exports: any = {};
  const applied: any[] = [];
  const cinemetaCalls: any[] = [];
  const videos = [{ id: "tt1224144:9:10", season: 9, episode: 10 }];
  const mocks: Record<string, unknown> = {
    "@/lib/cinemeta": {
      // Mirrors cinemeta.ts: a disabled source answers null unless the caller forces it.
      meta: async (type: string, id: string, force?: boolean) => {
        cinemetaCalls.push({ type, id, force });
        return force ? { id, videos } : null;
      },
    },
    "@/lib/stremio-watched": {
      decodeWatchedEpisodes: async () => new Set(["9:10"]),
    },
    "@/lib/manual-watched": {
      applyRemoteWatched: (id: string, add: unknown[], unset: unknown[]) =>
        applied.push({ id, add, unset }),
      manualWatchedState: () => undefined,
      remoteWatchedKeys: () => remoteKeys,
      unwatchedAt: () => undefined,
      watchedStoreTag: () => "harbor.manualwatched.fromremote.v1.p1",
    },
    "@/lib/movie-watched": { isMovieWatchedLocal: () => false, setMovieWatchedLocal: () => {} },
  };
  new Function("require", "exports", source)((id: string) => {
    assert.ok(id in mocks, `unexpected import ${id}`);
    return mocks[id];
  }, exports);
  return { exports, applied, cinemetaCalls };
}

const item = (mtime: string) => ({
  _id: "tt1224144",
  type: "series",
  _mtime: mtime,
  state: { watched: "tt1224144:9:10:200:x" },
});

test("remote Stremio ticks decode even when Cinemeta metadata is turned off", async () => {
  localStorage.clear();
  const { exports, applied, cinemetaCalls } = load();
  exports.reconcileRemoteWatched([item("2026-10-08T17:47:43.000Z")]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cinemetaCalls[0]?.force, true);
  assert.deepEqual(applied, [{ id: "tt1224144", add: [{ season: 9, episode: 10 }], unset: [] }]);
});

test("an unchanged library item is not refetched from Cinemeta after a restart", async () => {
  localStorage.clear();
  const first = load();
  first.exports.reconcileRemoteWatched([item("2026-10-08T17:47:43.000Z")]);
  await new Promise((r) => setTimeout(r, 2100));
  assert.equal(first.cinemetaCalls.length, 1);

  const applied = new Set(["tt1224144:9:10"]);
  const restarted = load(applied);
  restarted.exports.reconcileRemoteWatched([item("2026-10-08T17:47:43.000Z")]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(restarted.cinemetaCalls.length, 0, "same _mtime is skipped");

  const edited = load(applied);
  edited.exports.reconcileRemoteWatched([item("2026-10-09T09:00:00.000Z")]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(edited.cinemetaCalls.length, 1, "a newer _mtime is pulled again");

  const wiped = load(new Set());
  wiped.exports.reconcileRemoteWatched([item("2026-10-08T17:47:43.000Z")]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(wiped.cinemetaCalls.length, 1, "lost local ticks are pulled again");
});

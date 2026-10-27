// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";

const stamp = "2026-10-26T10:00:00.000Z";
const activities = (watched = stamp) => ({
  all: watched,
  movies: { watched_at: watched, watchlisted_at: stamp, paused_at: stamp },
  episodes: { watched_at: watched, watchlisted_at: stamp, paused_at: stamp },
  shows: { watchlisted_at: stamp },
  watchlist: { updated_at: stamp },
});

function load(disk: Map<string, { at: number; data: unknown }>) {
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/trakt/activities.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const state = {
    activities: activities() as unknown,
    activityCalls: 0,
    writes: [] as (() => void)[],
  };
  const mocks: Record<string, unknown> = {
    "@/lib/active-profile-id": { activeProfileId: () => "p" },
    "@/lib/idb-cache": {
      idbCacheGetFresh: async (k: string) => disk.get(k) ?? null,
      idbCacheSet: async (k: string, e: { at: number; data: unknown }) => {
        disk.set(k, e);
      },
    },
    "./client": {
      onTraktWrite: (fn: () => void) => state.writes.push(fn),
      traktRequest: async () => {
        state.activityCalls += 1;
        if (state.activities instanceof Error) throw state.activities;
        return state.activities;
      },
    },
    "./session": { getSession: () => ({ username: "alice" }), subscribeSession: () => {} },
  };
  const api: any = {};
  new Function("require", "exports", code)((id: string) => {
    assert.ok(id in mocks, `unexpected import ${id}`);
    return mocks[id];
  }, api);
  return { api, state };
}

test("an unchanged watermark serves the stored history on the next launch", async () => {
  const disk = new Map();
  let loads = 0;
  const load1 = () => Promise.resolve(++loads);
  const first = load(disk);
  assert.equal(
    await first.api.withTraktActivityCache("history", first.api.HISTORY_MARK, 1e9, load1),
    1,
  );
  const next = load(disk);
  assert.equal(
    await next.api.withTraktActivityCache("history", next.api.HISTORY_MARK, 1e9, load1),
    1,
  );
  assert.equal(loads, 1);
});

test("a new watched timestamp, or no readable activities, loads fresh", async () => {
  const disk = new Map();
  let loads = 0;
  const loader = () => Promise.resolve(++loads);
  const first = load(disk);
  await first.api.withTraktActivityCache("history", first.api.HISTORY_MARK, 1e9, loader);
  const moved = load(disk);
  moved.state.activities = activities("2026-10-26T11:00:00.000Z");
  assert.equal(
    await moved.api.withTraktActivityCache("history", moved.api.HISTORY_MARK, 1e9, loader),
    2,
  );
  const offline = load(disk);
  offline.state.activities = new Error("offline");
  assert.equal(
    await offline.api.withTraktActivityCache("history", offline.api.HISTORY_MARK, 1e9, loader),
    3,
  );
});

test("a write makes the next read check last_activities again", async () => {
  const { api, state } = load(new Map());
  await api.currentTraktActivities();
  await api.currentTraktActivities();
  assert.equal(state.activityCalls, 1);
  for (const fn of state.writes) fn();
  await api.currentTraktActivities();
  assert.equal(state.activityCalls, 2);
});

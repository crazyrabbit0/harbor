// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import type { LibraryItem } from "../src/lib/stremio";
import { loadModule } from "./helpers/hook-harness.ts";
import { hookArgument, sourceCallback } from "./helpers/source-callback.ts";

// Runs the Anime room's real Continue Watching memo over the real cwSortKey.
function animeRail(resumeTimes: Map<string, number>) {
  const stremio = loadModule("src/lib/stremio.ts", {
    "@/lib/safe-fetch": { safeFetch: async () => null },
    "@/lib/resume": {
      readResumeEntry: (id: string) =>
        resumeTimes.has(id) ? { ms: 100, t: resumeTimes.get(id) } : null,
      readResumeSource: () => undefined,
    },
    "./anime-detect": { isDetectedAnime: () => false },
  });
  return (libItems: LibraryItem[]): string[] =>
    sourceCallback("src/views/anime.tsx", hookArgument("continueWatching"), {
      readAtVersion: (_v: unknown, read: () => unknown) => read(),
      cwVersion: 0,
      animeDetectVer: 0,
      cwRootVersion: 0,
      localCwVer: 0,
      ANIME_CLOUD_ID: stremio.ANIME_CLOUD_ID,
      cwSortKey: stremio.cwSortKey,
      isCwMember: stremio.isCwMember,
      isAnimeCwItem: stremio.isAnimeCwItem,
      isCwDismissed: () => false,
      franchiseRootSync: () => null,
      localAnimeCw: [],
      libItems,
      simklCw: [],
      trackerCw: [],
      hideSharedCw: false,
    })().map((i: LibraryItem) => i._id);
}

function item(id: string, date: string): LibraryItem {
  return {
    _id: id,
    type: "series",
    name: id,
    isAnime: true,
    removed: false,
    temp: false,
    _ctime: date,
    _mtime: date,
    state: { lastWatched: date, timeOffset: 100, duration: 1000 },
  };
}

test("Anime CW puts freshly resumed items ahead of newer cloud timestamps", () => {
  const resumed = item("resume", "2026-09-01T00:00:00Z");
  const cloud = item("cloud", "2026-09-10T00:00:00Z");
  const rail = animeRail(new Map([[resumed._id, Date.parse("2026-09-12T00:00:00Z")]]));
  assert.deepEqual(rail([cloud, resumed]), ["resume", "cloud"]);
});

test("Anime CW retains timestamp ordering without local resume and handles missing dates", () => {
  const rail = animeRail(new Map());
  const older = item("older", "2026-09-01T00:00:00Z");
  const newer = item("newer", "2026-09-10T00:00:00Z");
  const missing = item("missing", "invalid");
  assert.deepEqual(rail([missing, older, newer]), ["newer", "older", "missing"]);
  const twin = item("twin", "2026-09-01T00:00:00Z");
  assert.deepEqual(rail([older, twin]), ["older", "twin"]);
  assert.deepEqual(rail([twin, older]), ["twin", "older"]);
});

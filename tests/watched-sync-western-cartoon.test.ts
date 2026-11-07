// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { loadModule } from "./helpers/hook-harness.ts";

type Meta = { genres?: string[]; country?: string } | null;

function animeDetect(initial: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initial));
  const metadata = new Map<string, Meta>();
  const mappingCalls: string[] = [];
  const api = loadModule(
    "src/lib/anime-detect.ts",
    {
      react: { useSyncExternalStore: () => 0 },
      "@/lib/cinemeta": { meta: async (_type: string, id: string) => metadata.get(id) ?? null },
      "@/lib/providers/anime-mapping": {
        imdbToKitsu: async (id: string) => {
          mappingCalls.push(id);
          return null;
        },
      },
      "@/lib/storage-recovery": {
        setItemWithRecovery: (key: string, value: string) => storage.set(key, value),
      },
    },
    {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
      },
      setTimeout: () => 0,
    },
  );
  return { api, storage, metadata, mappingCalls };
}

test("anime detection keys on the PRIMARY country, not any country in the list", () => {
  const { api } = animeDetect();
  assert.equal(
    api.metaLooksAnime({ genres: ["Animation"], country: "United States, Japan" }),
    false,
  );
  assert.equal(
    api.metaLooksAnime({ genres: ["Animation"], country: "Japan, United States" }),
    true,
  );
});

test("the Kitsu fallback only runs for animation or a show of unknown origin", async () => {
  const h = animeDetect();
  h.metadata.set("tt1", { genres: ["Drama"], country: "United States" });
  h.metadata.set("tt2", { genres: ["Animation"], country: "United States" });
  h.metadata.set("tt3", { genres: [], country: "" });
  h.metadata.set("tt5", { genres: ["Drama"] });
  await h.api.detectAnimeForCw(
    ["tt1", "tt2", "tt3", "tt4", "tt5"].map((_id) => ({ _id, type: "series" })),
  );
  assert.deepEqual(h.mappingCalls.sort(), ["tt2", "tt3", "tt4"]);
});

test("the poisoned detected-anime set is purged via a storage version bump", () => {
  const h = animeDetect({
    "harbor.anime.detected.v1": JSON.stringify(["tt1"]),
    "harbor.anime.detected.v2": JSON.stringify(["tt2"]),
  });
  assert.equal(h.api.isDetectedAnime("tt1"), false);
  assert.equal(h.api.isDetectedAnime("tt2"), true);
  assert.equal(h.storage.has("harbor.anime.detected.v1"), false);
});

function episodeWatched() {
  const pushes: unknown[][] = [];
  const api = loadModule("src/lib/stremio-episode-watched.ts", {
    "@/lib/cinemeta": { meta: async () => null, narrowMediaType: (type: string) => type },
    "@/lib/auth": { readActiveStremioAuthKey: () => "auth" },
    "@/lib/stremio": { cloudWriteId: (id: string, imdb: string | null) => imdb ?? id },
    "@/lib/stremio-watched-sync": {
      setEpisodesWatchedStremio: async (...args: unknown[]) => {
        pushes.push(args);
        return true;
      },
    },
    "@/lib/manual-watched": {
      manualEpisodeKeys: () => ({ watched: new Set(["1:1"]), unwatched: new Set() }),
    },
    // Every title reads as detected anime, so any fuzzy gate would block the cartoon below.
    "@/lib/anime-detect": { isDetectedAnime: () => true },
  });
  return { api, pushes };
}

test("watched-to-Stremio sync gates on the id SCHEME, never fuzzy anime detection", async () => {
  const series = (id: string, type = "series") => ({ id, type, videos: [{ id: `${id}:1:1` }] });
  const cartoon = episodeWatched();
  assert.equal(await cartoon.api.syncSeriesWatchedToStremio(series("tt100")), true);
  assert.equal(cartoon.pushes.length, 1);

  const kitsu = episodeWatched();
  assert.equal(await kitsu.api.syncSeriesWatchedToStremio(series("kitsu:1")), true);
  assert.equal(kitsu.pushes.length, 0);

  const anime = episodeWatched();
  assert.equal(await anime.api.syncSeriesWatchedToStremio(series("tt200", "anime")), true);
  assert.equal(anime.pushes.length, 0);
  const keys = { watched: new Set(["1:1"]), unwatched: new Set<string>() };
  await anime.api.syncSeriesWatchedToStremio(series("tt200", "anime"), "tt200", keys);
  assert.equal(anime.pushes.length, 1);
  assert.equal(anime.pushes[0].at(-1), true);
});

test("detail-page watched reconciliation is unblocked for tt cartoons", () => {
  // detail.tsx is ~2,600 lines; only its one gating line is pinned.
  const detail = readFileSync(new URL("../src/views/detail.tsx", import.meta.url), "utf8");
  const gate = detail
    .split("\n")
    .find((line: string) => line.includes("if (!authKey || !isSeries"))
    ?.trim();
  assert.equal(gate, 'if (!authKey || !isSeries || idAnime || meta.type === "anime") return;');
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as cache from "../src/lib/cache";
import { createRequestScheduler } from "../src/lib/request-scheduler";
import { flushPromises, loadModule } from "./helpers/hook-harness.ts";
import { posterHarness } from "./helpers/poster-harness.ts";

const noCache = {
  createCatalogCache: () => ({ get: () => undefined, set() {} }),
  createPersistentCatalog: () => ({ read: async () => null, write() {} }),
  isCatalogPath: () => false,
  isTitlePath: () => false,
};

function client() {
  const urls: URL[] = [];
  const mod = loadModule("src/lib/providers/tmdb/tmdb-client.ts", {
    "@/lib/safe-fetch": {
      safeFetch: async (url: string) => {
        urls.push(new URL(url));
        return Response.json({ ok: true });
      },
    },
    "@/lib/request-scheduler": { createRequestScheduler },
    "./tmdb-catalog-cache": noCache,
  });
  return { mod, urls };
}

// Artwork language is a separate module; a stub marks which arguments reach it.
const imageLang = {
  imageLangParam: (original?: string | null) => `artwork:${original ?? "-"}`,
  imageLangRank: () => 0,
  imageLangPriority: () => ["en"],
};

test("TMDB metadata requests never fall back to the artwork language", async () => {
  const { mod, urls } = client();
  await mod.get("key", "search/movie", { query: "a" });
  assert.equal(urls[0].searchParams.has("language"), false, "no metadata language set");
  mod.setTmdbLanguage("de-DE");
  await mod.get("key", "search/movie", { query: "b" });
  assert.equal(urls[1].searchParams.get("language"), "de-DE");
  await mod.get("key", "search/movie", { query: "c", language: "en-US" });
  assert.equal(urls[2].searchParams.get("language"), "en-US", "an explicit language wins");
});

test("TMDB artwork requests keep their independent language preference", async () => {
  const calls: { path: string; params: Record<string, string> }[] = [];
  const get = async (_key: string, path: string, params: Record<string, string>) => {
    calls.push({ path, params });
    return null;
  };
  const details = loadModule("src/lib/providers/tmdb/tmdb-details.ts", {
    "./tmdb-client": { get, IMG: "img", effectiveTmdbLanguage: () => "de-DE" },
    "./tmdb-image-rungs": { tmdbBackdropUrl: () => "", tmdbPosterUrl: () => "" },
    "@/lib/settings/load": { loadStoredSettings: () => ({}) },
    "./tmdb-images": { pickLogo: () => undefined, fetchMovieAssets: async () => null },
    "./tmdb-image-lang": imageLang,
    "./tmdb-trailers": { pickTrailers: () => [] },
    "./tmdb-meta-mappers": { isAnimeItem: () => false },
    "./tmdb-find-cache": { cachedTmdbFind: () => null, rememberTmdbFind() {} },
  });
  await details.tmdbDetails("key", { id: "tmdb:movie:5", type: "movie" }, "en");
  const bundle = calls.find((c) => c.path === "movie/5")!;
  assert.equal(bundle.params.language, "en");
  assert.equal(bundle.params.include_image_language, "artwork:-");

  const images = loadModule("src/lib/providers/tmdb/tmdb-images.ts", {
    "@/lib/cache": cache,
    "@/lib/memory-profiler": { registerCache() {} },
    "@/lib/settings/load": { loadStoredSettings: () => ({}) },
    "./tmdb-client": { get },
    "./tmdb-image-rungs": {
      tmdbBackdropUrl: () => "",
      tmdbLogoUrl: () => "",
      tmdbPosterUrl: () => "",
    },
    "./tmdb-image-lang": imageLang,
  });
  await images.fetchMovieAssets("key", "tmdb:tv:7", "ja");
  const assets = calls.find((c) => c.path === "tv/7/images")!;
  assert.deepEqual(assets.params, { include_image_language: "artwork:ja" });
});

test("IMDb-based catalogs resolve through TMDB before selecting localized posters", async () => {
  const resolve = async (_key: string, id: string) => (id === "tt1" ? "tmdb:movie:9" : null);
  const localized = async (metaId: string) => {
    const p = posterHarness("useLocalizedPoster", { imdbToTmdb: resolve });
    p.render(metaId);
    await flushPromises();
    return { ...p.render(metaId), calls: p.calls };
  };
  const imdb = await localized("tt1");
  assert.deepEqual(imdb.calls.imdbToTmdb, [["key", "tt1"]]);
  assert.deepEqual(imdb.calls.localized, [["key", "tmdb:movie:9"]]);
  assert.equal(imdb.url, "localized:tmdb:movie:9");
  assert.equal(imdb.localizing, false);

  const direct = await localized("tmdb:tv:3");
  assert.deepEqual(direct.calls.imdbToTmdb, []);
  assert.deepEqual(direct.calls.localized, [["key", "tmdb:tv:3"]]);

  const other = await localized("kitsu:1");
  assert.deepEqual([other.calls.imdbToTmdb, other.calls.localized, other.url], [[], [], undefined]);
});

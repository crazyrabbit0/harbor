import assert from "node:assert/strict";
import test from "node:test";
import { loadModule, readSource } from "../scripts/benchmark-discover.mjs";

type Entry = { at: number; data: unknown };
type Client = {
  get<T>(key: string, path: string, params?: object, options?: object): Promise<T | null>;
  withTmdbDeadline<T>(ms: number, work: () => Promise<T>): Promise<T>;
};

function idbStub(store = new Map<string, Entry>()) {
  return {
    store,
    idbCacheGet: async (key: string) => store.get(key) ?? null,
    idbCacheSet: async (key: string, entry: Entry) => void store.set(key, entry),
    idbCacheDelete: async (key: string) => void store.delete(key),
  };
}

function client(options: { latency?: number; idb?: ReturnType<typeof idbStub> } = {}) {
  let requests = 0;
  const catalog = loadModule(readSource("src/lib/providers/tmdb/tmdb-catalog-cache.ts"), {
    "@/lib/cache": loadModule(readSource("src/lib/cache.ts")),
    "@/lib/idb-cache": options.idb ?? idbStub(),
  });
  const module = loadModule(readSource("src/lib/providers/tmdb/tmdb-client.ts"), {
    "@/lib/safe-fetch": {
      safeFetch: async () => {
        requests++;
        if (options.latency) await new Promise((r) => setTimeout(r, options.latency));
        return Response.json({ results: [{ id: 1, title: "Fixture" }] });
      },
    },
    "@/lib/request-scheduler": loadModule(readSource("src/lib/request-scheduler.ts")),
    "./tmdb-catalog-cache": catalog,
  }) as Client;
  return { module, requests: () => requests };
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("get() with a short deadline returns null before a slow response arrives", async () => {
  const { module } = client({ latency: 300 });
  const started = Date.now();
  const data = await module.get("key", "movie/popular", { page: "1" }, { timeoutMs: 40 });
  assert.equal(data, null);
  assert.ok(Date.now() - started < 250);
});

test("a response landing after the deadline is cached as data, not as a failure", async () => {
  const { module, requests } = client({ latency: 120 });
  assert.equal(await module.get("key", "movie/popular", {}, { timeoutMs: 20 }), null);
  await settle(200);
  const late = await module.get<{ results: unknown[] }>("key", "movie/popular");
  assert.deepEqual(late?.results, [{ id: 1, title: "Fixture" }]);
  assert.equal(requests(), 1);
});

test("withTmdbDeadline bounds only the requests started inside it", async () => {
  const { module } = client({ latency: 150 });
  const scoped = module.withTmdbDeadline(30, () => module.get("key", "tv/popular"));
  const unscoped = module.get("key", "tv/top_rated");
  assert.equal(await scoped, null);
  assert.notEqual(await unscoped, null);
});

test("a cold memory cache reads the persisted page and skips the network", async () => {
  const idb = idbStub();
  const warm = client({ idb });
  await warm.module.get("secret-key", "discover/movie", { page: "2", region: "GR" });
  await settle(0);
  const [key] = [...idb.store.keys()];
  assert.ok(key);
  assert.doesNotMatch(key, /secret-key|api_key/);
  assert.match(key, /page=2/);
  assert.match(key, /region=GR/);
  const cold = client({ idb });
  const page = await cold.module.get<{ results: { title: string }[] }>(
    "secret-key",
    "discover/movie",
    { page: "2", region: "GR" },
  );
  assert.equal(page?.results[0].title, "Fixture");
  assert.equal(cold.requests(), 0);
  page!.results[0].title = "mutated";
  const again = await cold.module.get<{ results: { title: string }[] }>(
    "secret-key",
    "discover/movie",
    { page: "2", region: "GR" },
  );
  assert.equal(again?.results[0].title, "Fixture");
});

test("a persisted page older than three hours is refetched and replaced", async () => {
  const idb = idbStub();
  await client({ idb }).module.get("key", "trending/movie/week");
  await settle(0);
  const [key] = [...idb.store.keys()];
  const stale = Date.now() - 3 * 60 * 60_000 - 1;
  idb.store.set(key, { at: stale, data: { results: [{ id: 9 }] } });
  const cold = client({ idb });
  const page = await cold.module.get<{ results: { id: number }[] }>("key", "trending/movie/week");
  assert.equal(page?.results[0].id, 1);
  assert.equal(cold.requests(), 1);
  await settle(0);
  assert.ok(idb.store.get(key)!.at > stale);
});

test("non-catalog paths and failed reads never touch or block on the persistent layer", async () => {
  const idb = idbStub();
  idb.idbCacheGet = async () => {
    throw new Error("fixture idb failure");
  };
  const { module, requests } = client({ idb });
  assert.notEqual(await module.get("key", "movie/popular"), null);
  assert.notEqual(await module.get("key", "search/movie", { query: "x" }), null);
  await settle(0);
  assert.equal(requests(), 2);
  assert.equal(
    [...idb.store.keys()].some((k) => k.includes("search")),
    false,
  );
});

test("a detail bundle is read from the persistent title layer after a restart", async () => {
  const idb = idbStub();
  const params = { language: "el-GR", append_to_response: "credits,images" };
  await client({ idb }).module.get("secret-key", "movie/603", params);
  await settle(0);
  const [key] = [...idb.store.keys()];
  assert.ok(key?.startsWith("tmdb.title.v1:"));
  assert.doesNotMatch(key, /secret-key|api_key/);
  assert.match(key, /language=el-GR/);
  const cold = client({ idb });
  const bundle = await cold.module.get<{ results: unknown[] }>("secret-key", "movie/603", params);
  assert.deepEqual(bundle?.results, [{ id: 1, title: "Fixture" }]);
  assert.equal(cold.requests(), 0);
  await cold.module.get("secret-key", "movie/603", { ...params, language: "en-US" });
  assert.equal(cold.requests(), 1);
});

test("a persisted detail bundle older than a day is refetched", async () => {
  const idb = idbStub();
  await client({ idb }).module.get("key", "tv/1399/images");
  await settle(0);
  const [key] = [...idb.store.keys()];
  idb.store.set(key, { at: Date.now() - 24 * 60 * 60_000 - 1, data: { results: [{ id: 9 }] } });
  const cold = client({ idb });
  const page = await cold.module.get<{ results: { id: number }[] }>("key", "tv/1399/images");
  assert.equal(page?.results[0].id, 1);
  assert.equal(cold.requests(), 1);
});

test("the title cache prefix is trimmable", () => {
  const source = readSource("src/lib/idb-cache.ts");
  assert.match(source, /TRIMMABLE_PREFIXES = \[[^\]]*"tmdb\.title\.v1:"/);
});

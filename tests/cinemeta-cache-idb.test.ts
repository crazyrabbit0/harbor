import assert from "node:assert/strict";
import test from "node:test";
import { loadModule, readSource } from "../scripts/benchmark-discover.mjs";

type Entry = { at: number; data: unknown };
type Meta = { id: string; name: string; videos?: unknown[] };
type CacheModule = {
  withMetaCache(
    type: "movie" | "series",
    id: string,
    load: () => Promise<{ value: Meta | null; cacheable: boolean }>,
  ): Promise<Meta | null>;
};

const local = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => local.get(k) ?? null,
  setItem: (k: string, v: string) => void local.set(k, v),
  removeItem: (k: string) => void local.delete(k),
};

function load(idb: Map<string, Entry>): CacheModule {
  return loadModule(
    readSource("src/lib/cinemeta-cache.ts"),
    {
      "@/lib/idb-cache": {
        idbCacheGet: async (key: string) => idb.get(key) ?? null,
        idbCacheSet: async (key: string, entry: Entry) => void idb.set(key, entry),
        idbCacheDelete: async (key: string) => void idb.delete(key),
      },
    },
    { localStorage },
  ) as CacheModule;
}

function longSeries(): Meta {
  const videos = Array.from({ length: 400 }, (_, i) => ({
    id: `tt1:1:${i + 1}`,
    title: `Episode ${i + 1} with a reasonably long descriptive title`,
    released: "2020-01-01T00:00:00.000Z",
  }));
  return { id: "tt1", name: "Long Series", videos };
}

test("an entry over the localStorage cap round-trips whole through IndexedDB", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const idb = new Map<string, Entry>();
  const meta = longSeries();
  assert.ok(JSON.stringify(meta).length > 20000);
  const warm = load(idb);
  await warm.withMetaCache("series", "tt1", async () => ({ value: meta, cacheable: true }));
  t.mock.timers.tick(5000);
  await new Promise((r) => setImmediate(r));
  t.mock.timers.reset();
  assert.equal(JSON.parse(local.get("harbor.cinemeta.meta.v1") ?? "{}")["series:tt1"], undefined);
  assert.equal(idb.size, 1);

  let fetched = 0;
  const cold = load(idb);
  const hit = await cold.withMetaCache("series", "tt1", async () => {
    fetched++;
    return { value: null, cacheable: false };
  });
  assert.equal(fetched, 0);
  assert.deepEqual(hit, meta);
  assert.equal(hit?.videos?.length, 400);
});

test("an expired IndexedDB entry falls through to the loader", async () => {
  const idb = new Map<string, Entry>();
  idb.set("cinemeta.meta.v1:series:tt2", {
    at: Date.now() - 4 * 60 * 60 * 1000,
    data: { id: "tt2", name: "Stale" },
  });
  const fresh = { id: "tt2", name: "Fresh" };
  const value = await load(idb).withMetaCache("series", "tt2", async () => ({
    value: fresh,
    cacheable: true,
  }));
  assert.deepEqual(value, fresh);
  assert.equal(idb.has("cinemeta.meta.v1:series:tt2"), false);
});

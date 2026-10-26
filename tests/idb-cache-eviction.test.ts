import assert from "node:assert/strict";
import test from "node:test";
import "./_indexeddb-stub.ts";

import {
  IDB_CACHE_MAX_ENTRIES,
  idbCacheGet,
  idbCacheGetFresh,
  idbCacheKeys,
  idbCacheSet,
} from "../src/lib/idb-cache.ts";

test("a stale read deletes the entry and a fresh read keeps it", async () => {
  const day = 24 * 60 * 60 * 1000;
  await idbCacheSet("stale-key", { at: Date.now() - 8 * day, data: "old" });
  await idbCacheSet("fresh-key", { at: Date.now(), data: "new" });

  assert.equal(await idbCacheGetFresh("stale-key", 7 * day), null);
  assert.equal(await idbCacheGet("stale-key"), undefined);
  assert.equal((await idbCacheGetFresh("fresh-key", 7 * day))?.data, "new");
  assert.equal((await idbCacheGet("fresh-key"))?.data, "new");
});

test("a write past the cap drops the oldest cache entries and never user data", async () => {
  const base = Date.now() - 1_000_000;
  // Older than every cache entry, so an unscoped trim would delete it first.
  await idbCacheSet("harbor.music.pinned-sources.v1", { at: base - 10, data: ["pin"] });
  for (let i = 0; i < IDB_CACHE_MAX_ENTRIES; i += 1) {
    await idbCacheSet(`harbor.sa.v1.cap-${i}`, { at: base + i, data: i });
  }

  await idbCacheSet("harbor.sa.v1.cap-newest", { at: Date.now(), data: "newest" });

  const cacheKeys = (await idbCacheKeys()).filter((k) => k.startsWith("harbor.sa.v1.cap-"));
  assert.ok(cacheKeys.length <= IDB_CACHE_MAX_ENTRIES, `cache holds ${cacheKeys.length} entries`);
  assert.equal((await idbCacheGet("harbor.sa.v1.cap-newest"))?.data, "newest");
  assert.equal(await idbCacheGet("harbor.sa.v1.cap-0"), undefined, "the oldest entry is evicted");
  assert.equal(
    (await idbCacheGet(`harbor.sa.v1.cap-${IDB_CACHE_MAX_ENTRIES - 1}`))?.data,
    IDB_CACHE_MAX_ENTRIES - 1,
  );
  assert.deepEqual((await idbCacheGet("harbor.music.pinned-sources.v1"))?.data, ["pin"]);
});

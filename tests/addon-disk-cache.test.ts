import assert from "node:assert/strict";
import test from "node:test";
import "./_indexeddb-stub.ts";

import {
  CATALOG_DISK_PREFIX,
  META_DISK_PREFIX,
  cachedAddonMeta,
  cachedCatalogRow,
} from "../src/lib/addon-catalog-cache.ts";
import { idbCacheGet, idbCacheSet } from "../src/lib/idb-cache.ts";

const settle = () => new Promise((r) => setTimeout(r, 10));

test("a catalog row stored by an earlier session is served without loading", async () => {
  await idbCacheSet(`${CATALOG_DISK_PREFIX}row-a`, { at: Date.now(), data: { name: "Popular" } });
  let loads = 0;
  const row = await cachedCatalogRow("row-a", async () => {
    loads += 1;
    return { value: { name: "fresh" }, ok: true };
  });
  assert.deepEqual(row, { value: { name: "Popular" }, ok: true });
  assert.equal(loads, 0);
});

test("only successful catalog loads are persisted", async () => {
  await cachedCatalogRow("row-ok", async () => ({ value: { name: "ok" }, ok: true }));
  await cachedCatalogRow("row-fail", async () => ({ value: null, ok: false }));
  await settle();
  assert.deepEqual((await idbCacheGet(`${CATALOG_DISK_PREFIX}row-ok`))?.data, { name: "ok" });
  assert.equal(await idbCacheGet(`${CATALOG_DISK_PREFIX}row-fail`), undefined);
});

test("a found meta persists and a transient failure does not", async () => {
  const found = await cachedAddonMeta("series", "u-found", async () => ({
    value: { id: "tt1" },
    cacheable: true,
    chars: 10,
  }));
  assert.deepEqual(found, { id: "tt1" });
  await cachedAddonMeta("movie", "u-timeout", async () => ({ value: null, cacheable: false }));
  await settle();
  assert.deepEqual((await idbCacheGet(`${META_DISK_PREFIX}u-found`))?.data, { id: "tt1" });
  assert.equal(await idbCacheGet(`${META_DISK_PREFIX}u-timeout`), undefined);
});

test("a stored meta serves the first read of a session and later reads refetch", async () => {
  await idbCacheSet(`${META_DISK_PREFIX}u-seeded`, { at: Date.now(), data: { id: "old" } });
  let loads = 0;
  const load = async () => {
    loads += 1;
    return { value: { id: "new" }, cacheable: true, chars: 10 };
  };
  assert.deepEqual(await cachedAddonMeta("series", "u-seeded", load), { id: "old" });
  assert.equal(loads, 0);
  assert.deepEqual(await cachedAddonMeta("series", "u-seeded", load), { id: "new" });
  assert.equal(loads, 1);
});

test("non-video meta types bypass the disk cache", async () => {
  let loads = 0;
  const load = async () => {
    loads += 1;
    return { value: { id: "live" }, cacheable: true, chars: 5 };
  };
  await cachedAddonMeta("tv", "u-tv", load);
  await cachedAddonMeta("tv", "u-tv", load);
  await settle();
  assert.equal(loads, 2);
  assert.equal(await idbCacheGet(`${META_DISK_PREFIX}u-tv`), undefined);
});

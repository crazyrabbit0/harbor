import assert from "node:assert/strict";
import test from "node:test";
import "./_indexeddb-stub.ts";

const host = { location: { hostname: "harbor.local" } };
(globalThis as unknown as { window: typeof host }).window = host;

let calls = 0;
let reply: () => Response = () => new Response('{"meta":null}', { status: 200 });
globalThis.fetch = (async () => {
  calls += 1;
  return reply();
}) as typeof fetch;

const { fetchAddonMeta } = await import("../src/lib/addons.ts");
const { META_DISK_PREFIX } = await import("../src/lib/addon-catalog-cache.ts");
const { idbCacheKeys } = await import("../src/lib/idb-cache.ts");

const settle = () => new Promise((r) => setTimeout(r, 10));

test("an addon's explicit {meta: null} answer is remembered on disk", async () => {
  assert.equal(await fetchAddonMeta("https://addon.example", "series", "tmdb:tv:1"), null);
  await settle();
  const keys = (await idbCacheKeys()).filter((k) => k.startsWith(META_DISK_PREFIX));
  assert.equal(keys.length, 1);
  assert.equal(calls, 1);
});

test("a reply with no meta field is not remembered", async () => {
  reply = () => new Response("{}", { status: 200 });
  assert.equal(await fetchAddonMeta("https://addon.example", "series", "tmdb:tv:2"), null);
  await settle();
  const keys = (await idbCacheKeys()).filter(
    (k) => k.includes("tmdb%3Atv%3A2") || k.includes("tmdb:tv:2"),
  );
  assert.equal(keys.length, 0);
});

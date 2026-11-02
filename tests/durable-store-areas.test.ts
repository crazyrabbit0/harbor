// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test, { mock } from "node:test";
import "./_localstorage-stub.ts";
import "./_indexeddb-stub.ts";

let userDataFile: string | null = null;
let writes = 0;
(globalThis as { window?: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { content?: string }) => {
      if (cmd === "user_data_read") return userDataFile;
      if (cmd === "user_data_write") {
        writes += 1;
        userDataFile = args.content ?? null;
        return null;
      }
      throw new Error(`unexpected command ${cmd}`);
    },
  },
  addEventListener: () => {},
};

const store = await import("../src/lib/durable-store.ts");
const recovery = await import("../src/lib/storage-recovery.ts");
await store.loadDurableStore();
// setImmediate is not mocked, so this lets a fired write reach the fake bridge.
const settle = () => new Promise((resolve) => setImmediate(resolve));
const fileKeys = () => JSON.parse(userDataFile ?? "{}") as Record<string, string>;
const storedImageCount = () =>
  new Promise<number>((resolve) => {
    const open = indexedDB.open("harbor-theme", 1);
    open.onsuccess = () => {
      const req = open.result.transaction("kv", "readonly").objectStore("kv").getAllKeys();
      req.onsuccess = () =>
        resolve(req.result.filter((k) => String(k).startsWith("collection-image:")).length);
    };
  });

test("quota recovery prunes caches but never playback history, the watchlist or watched marks", () => {
  localStorage.clear();
  const kept = [
    "harbor.playback-history.v1.p1",
    "harbor.watchlist.v1.p1",
    "harbor.manualwatched.v1.p1",
    "harbor.manualunwatched.at.v1.p1",
  ];
  for (const key of kept) localStorage.setItem(key, "[]");
  localStorage.setItem("harbor.omdb.v1", "{}");
  const { pruned } = recovery.freeStorageSpace();
  assert.deepEqual(pruned, ["harbor.omdb.v1"]);
  for (const key of kept) assert.equal(localStorage.getItem(key), "[]", key);
  // A durable key stays safe even under a cache prefix that would otherwise match it.
  assert.equal(recovery.isPrunable("harbor.tvdbo.x"), true);
  store.DURABLE_PREFIXES.push("harbor.tvdbo.durable");
  try {
    assert.equal(recovery.isPrunable("harbor.tvdbo.durable.p1"), false);
  } finally {
    store.DURABLE_PREFIXES.pop();
  }
});

test("a watchlist or watched-mark write through storage recovery reaches user-data.json", async () => {
  localStorage.clear();
  await store.flushDurableStore();
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
  try {
    assert.equal(recovery.setItemWithRecovery("harbor.watchlist.v1.p1", '[{"id":"tt1"}]'), true);
    recovery.persistCritical("harbor.manualwatched.v1.p1", '["tt1|1|2"]');
    mock.timers.tick(10_000);
  } finally {
    mock.timers.reset();
  }
  await settle();
  assert.equal(fileKeys()["harbor.watchlist.v1.p1"], '[{"id":"tt1"}]');
  assert.equal(fileKeys()["harbor.manualwatched.v1.p1"], '["tt1|1|2"]');
});

test("custom lists, manga lists and collections reach user-data.json and survive quota recovery", async () => {
  localStorage.clear();
  await store.flushDurableStore();
  const lists = await import("../src/lib/custom-lists.ts");
  const collections = await import("../src/lib/collections.ts");
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
  try {
    assert.ok(lists.createList("Weekend"));
    assert.ok(lists.createListStore("harbor.mangalists.v1").createList("Manga"));
    assert.ok(collections.createCollection("Best of"));
    localStorage.setItem("harbor.collections.p2", "[]");
    mock.timers.tick(10_000);
  } finally {
    mock.timers.reset();
  }
  await settle();
  const file = fileKeys();
  assert.match(file["harbor.customlists.v1"] ?? "", /"Weekend"/);
  assert.match(file["harbor.mangalists.v1"] ?? "", /"Manga"/);
  assert.match(file["harbor.collections.v1"] ?? "", /"Best of"/);
  assert.equal(recovery.isPrunable("harbor.collections.p2"), false);
  assert.equal(store.isDurableKey("harbor.mangalists.migrated.v1"), false);
});

test("frequent playback ticks rewrite the file at most every 10 s, and never when nothing changed", async () => {
  localStorage.clear();
  await store.flushDurableStore();
  const before = writes;
  await store.flushDurableStore();
  assert.equal(writes, before, "an unchanged snapshot is not written again");
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
  try {
    store.durableSetItem("harbor.playback-history.v1.p1", '{"tt1":{"savedAt":1}}');
    mock.timers.tick(300);
    await settle();
    const afterFirst = writes;
    assert.equal(afterFirst, before + 1, "the first tick is written after 300 ms");
    store.durableSetItem("harbor.playback-history.v1.p1", '{"tt1":{"savedAt":2}}');
    mock.timers.tick(5_000);
    await settle();
    assert.equal(writes, afterFirst, "a second tick within 10 s waits");
    mock.timers.tick(5_000);
  } finally {
    mock.timers.reset();
  }
  await store.flushDurableStore();
  assert.equal(fileKeys()["harbor.playback-history.v1.p1"], '{"tt1":{"savedAt":2}}');
});

test("an uploaded collection cover stays out of user-data.json and still resolves for display", async () => {
  localStorage.clear();
  await store.flushDurableStore();
  const collections = await import("../src/lib/collections.ts");
  const image = `data:image/webp;base64,${"A".repeat(400_000)}`;
  const id = collections.createCollection("Covered");
  assert.ok(id);
  collections.setCollectionCover(id, await collections.storeUploadedCollectionImage(image));
  await store.flushDurableStore();
  const saved = fileKeys()["harbor.collections.v1"] ?? "";
  assert.match(saved, /"Covered"/);
  assert.ok(saved.length < 2_000, `collection blob is ${saved.length} bytes`);
  assert.equal(collections.getCollection(id)?.coverImage, image);
});

test("a data-URL cover saved by an older build moves out of the durable blob on first read", async () => {
  localStorage.clear();
  const before = await storedImageCount();
  const collections = await import("../src/lib/collections.ts");
  const image = `data:image/webp;base64,${"B".repeat(300_000)}`;
  localStorage.setItem(
    "harbor.collections.v1",
    JSON.stringify([
      { id: "c1", name: "Old", bgImage: image, items: [], createdAt: 1, updatedAt: 1 },
    ]),
  );
  const changed = new Promise<void>((resolve) => {
    const off = collections.subscribeCollections(() => {
      off();
      resolve();
    });
  });
  collections.readCollections();
  await changed;
  const raw = localStorage.getItem("harbor.collections.v1") ?? "";
  assert.ok(!raw.includes("data:"), "the blob no longer carries the image");
  assert.equal(collections.getCollection("c1")?.bgImage, image);
  collections.deleteCollection("c1");
  await settle();
  assert.equal(
    await storedImageCount(),
    before,
    "migration stored the image once and delete removed it",
  );
});

test("deleting a collection keeps an image another profile's collections still reference", async () => {
  localStorage.clear();
  const collections = await import("../src/lib/collections.ts");
  const images = await import("../src/lib/collection-images.ts");
  const image = `data:image/webp;base64,${"C".repeat(1_000)}`;
  const id = collections.createCollection("Shared");
  assert.ok(id);
  const ref = await collections.storeUploadedCollectionImage(image);
  collections.setCollectionCover(id, ref);
  localStorage.setItem(
    "harbor.collections.p_a_b",
    localStorage.getItem("harbor.collections.v1") ?? "",
  );
  collections.deleteCollection(id);
  await settle();
  assert.deepEqual(await images.readCollectionImages([ref]), { [ref]: image });
  localStorage.removeItem("harbor.collections.p_a_b");
  images.releaseCollectionImage(ref);
  await settle();
  assert.deepEqual(await images.readCollectionImages([ref]), {});
});

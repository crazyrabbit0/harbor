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
  dispatchEvent: () => true,
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

test("a stored cover is undefined until IndexedDB answers after a restart, then subscribers get it", async () => {
  localStorage.clear();
  const images = await import("../src/lib/collection-images.ts");
  const image = `data:image/webp;base64,${"D".repeat(500)}`;
  const ref = "harbor-image:00000000-0000-4000-8000-00000000cold";
  await new Promise<void>((resolve) => {
    const open = indexedDB.open("harbor-theme", 1);
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", "readwrite");
      tx.objectStore("kv").put(image, "collection-image:00000000-0000-4000-8000-00000000cold");
      tx.oncomplete = () => resolve();
    };
  });
  const collections = await import("../src/lib/collections.ts");
  localStorage.setItem(
    "harbor.collections.v1",
    JSON.stringify([
      { id: "cold", name: "Cold", coverImage: ref, items: [], createdAt: 1, updatedAt: 1 },
    ]),
  );
  const fired = new Promise<void>((resolve) => {
    const off = images.subscribeCollectionImages(() => {
      off();
      resolve();
    });
  });
  assert.equal(collections.getCollection("cold")?.coverImage, undefined);
  await fired;
  assert.equal(collections.getCollection("cold")?.coverImage, image);
});

test("favorites, local Continue Watching and removed local files reach user-data.json", async () => {
  localStorage.clear();
  await store.flushDurableStore();
  const cw = await import("../src/lib/local-cw.ts");
  const removals = await import("../src/lib/local-library/removals.ts");
  // Each write runs alone: any scheduled write snapshots every durable key, which would hide a missing trigger.
  const writeAlone = async (write: () => void) => {
    await store.flushDurableStore();
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
    try {
      write();
      mock.timers.tick(10_000);
    } finally {
      mock.timers.reset();
    }
    await settle();
    return fileKeys();
  };
  const afterCw = await writeAlone(() =>
    cw.saveLocalCw({
      id: "tt9",
      type: "movie",
      name: "Kept",
      positionMs: 600_000,
      durationMs: 6_000_000,
      t: 1,
    }),
  );
  const cwKey = Object.keys(afterCw).find((k) => k.startsWith("harbor.localcw.v1"));
  assert.ok(cwKey, "local Continue Watching is mirrored");
  assert.match(afterCw[cwKey] ?? "", /"Kept"/);
  const afterRemoval = await writeAlone(() => removals.rememberLocalRemovals(["/movies/gone.mkv"]));
  assert.match(afterRemoval["harbor.library.local.removed.v1"] ?? "", /gone\.mkv/);
  for (const key of [
    "harbor.favorites.v1.p1",
    "harbor.mangafav.v1.p1",
    "harbor.charfavorites.v1.p1",
  ]) {
    assert.equal(store.isDurableKey(key), true, key);
    assert.equal(recovery.isPrunable(key), false, key);
  }
  assert.equal(store.isDurableKey("harbor.library.local.v1"), false);
});

test("ratings and their import receipts reach user-data.json and survive quota recovery", async () => {
  localStorage.clear();
  await store.flushDurableStore();
  const ratings = await import("../src/lib/ratings/store.ts");
  const receipts = await import("../src/lib/ratings/import/receipts.ts");
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
  try {
    ratings.setRatingLocal({
      itemKey: "tt42",
      mediaType: "movie",
      score: 9,
      title: "Rated",
      updatedAt: 1,
    });
    mock.timers.tick(10_000);
  } finally {
    mock.timers.reset();
  }
  await settle();
  assert.match(fileKeys()["harbor.ratings.v1"] ?? "", /"Rated"/);
  await store.flushDurableStore();
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 120_000 });
  try {
    receipts.recordImport({
      sourceId: "letterboxd",
      sourceLabel: "Letterboxd",
      count: 3,
      startedAt: 1,
      finishedAt: 2,
    });
    mock.timers.tick(10_000);
  } finally {
    mock.timers.reset();
  }
  await settle();
  assert.match(fileKeys()["harbor.ratings.imports.v1"] ?? "", /"letterboxd"/);
  for (const key of ["harbor.ratings.v1", "harbor.ratings.p1", "harbor.ratings.imports.v1"]) {
    assert.equal(store.isDurableKey(key), true, key);
    assert.equal(recovery.isPrunable(key), false, key);
  }
  assert.equal(store.isDurableKey("harbor.ratingposters.v1"), false);
});

test("manga reading progress and read chapters reach user-data.json", async () => {
  localStorage.clear();
  const { loadModule } = await import("./helpers/hook-harness.ts");
  const progress = loadModule("src/lib/manga-progress.ts", {
    react: { useEffect() {}, useState: (v: unknown) => [v, () => {}] },
    "./profiles": { useProfiles: () => ({ activeId: "p1" }) },
    "./manga/sources/suwayomi/progress-bridge": { queueSuwayomiProgress() {} },
    "./durable-store": store,
  });
  // Each write runs alone: any scheduled write snapshots every durable key, which would hide a missing trigger.
  const writeAlone = async (write: () => void) => {
    await store.flushDurableStore();
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
    try {
      write();
      mock.timers.tick(10_000);
    } finally {
      mock.timers.reset();
    }
    await settle();
    return fileKeys();
  };
  const afterRead = await writeAlone(() => progress.recordMangaChapterRead("p1", "m1", "c6"));
  assert.match(afterRead["harbor.mangaread.chapters.v1.p1"] ?? "", /"c6"/);
  const afterProgress = await writeAlone(() =>
    progress.recordMangaProgress("p1", {
      id: "m1",
      title: "Kept manga",
      chapterId: "c6",
      chapterNumber: "6",
      chapterLabel: "Chapter 6",
      page: 3,
      totalPages: 20,
      updatedAt: 1,
    }),
  );
  assert.match(afterProgress["harbor.mangaread.v1.p1"] ?? "", /"Kept manga"/);
  const afterClear = await writeAlone(() => progress.removeMangaProgress("p1"));
  assert.equal(
    afterClear["harbor.mangaread.v1.p1"],
    undefined,
    "clearing progress clears the file",
  );
  assert.equal(recovery.isPrunable("harbor.mangaread.chapters.v1.p1"), false);
  assert.equal(store.isDurableKey("harbor.manga.match.anilist.v1.p1"), false);
});

test("manga and eBook bookmarks and eBook annotations reach user-data.json", async () => {
  localStorage.clear();
  const { loadModule } = await import("./helpers/hook-harness.ts");
  const manga = loadModule("src/lib/manga-bookmarks.ts", {
    react: { useEffect() {}, useState: (v: unknown) => [v, () => {}] },
    "./profiles": { useProfiles: () => ({ activeId: "p1" }) },
    "./storage-recovery": recovery,
  });
  const ebook = await import("../src/lib/ebook/reader-state.ts");
  // Each write runs alone: any scheduled write snapshots every durable key, which would hide a missing trigger.
  const writeAlone = async (write: () => void) => {
    await store.flushDurableStore();
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
    try {
      write();
      mock.timers.tick(10_000);
    } finally {
      mock.timers.reset();
    }
    await settle();
    return fileKeys();
  };
  const afterManga = await writeAlone(() =>
    manga.addMangaBookmark("p1", {
      mangaId: "m1",
      title: "Marked manga",
      chapterId: "c3",
      chapterNumber: "3",
      chapterLabel: "Chapter 3",
      page: 12,
      totalPages: 30,
      name: "Big reveal",
    }),
  );
  assert.match(afterManga["harbor.mangabookmarks.v1.p1"] ?? "", /"Big reveal"/);
  const afterBookmark = await writeAlone(() =>
    ebook.addEBookBookmark("p1", {
      bookId: "b1",
      chapterId: "ch1",
      chapterTitle: "Opening",
      line: 40,
      preview: "It was a dark night",
    }),
  );
  assert.match(afterBookmark["harbor.ebook.bookmarks.v1.p1.b1"] ?? "", /dark night/);
  const afterNote = await writeAlone(() =>
    ebook.saveEBookAnnotation("p1", "b1", {
      chapterId: "ch1",
      ranges: [{ line: 40, start: 0, end: 10 }],
      text: "It was a d",
      color: "yellow",
      density: 1,
      title: "",
      body: "My note",
      tags: [],
      reference: false,
    }),
  );
  assert.match(afterNote["harbor.ebook.annotations.v1.p1.b1"] ?? "", /"My note"/);
  for (const key of ["harbor.mangabookmarks.v1.p1", "harbor.ebook.annotations.v1.p1.b1"]) {
    assert.equal(recovery.isPrunable(key), false, key);
  }
  assert.equal(store.isDurableKey("harbor.ebook.progress.v1.p1.b1.ch1"), false);
});

test("hidden episodes reach user-data.json and survive quota recovery", async () => {
  localStorage.clear();
  await store.flushDurableStore();
  const hidden = await import("../src/lib/hidden-episodes.ts");
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
  try {
    hidden.setEpisodeHidden("tt5", 1, 3, true);
    mock.timers.tick(10_000);
  } finally {
    mock.timers.reset();
  }
  await settle();
  assert.equal(fileKeys()["harbor.hiddenepisodes.v1"], '["tt5|1|3"]');
  assert.equal(recovery.isPrunable("harbor.hiddenepisodes.v1"), false);
});

test("eBook lists reach user-data.json with inline EPUB covers kept in IndexedDB", async () => {
  localStorage.clear();
  const library = await import("../src/lib/ebook/library.ts");
  const covers = await import("../src/lib/ebook/covers.ts");
  const cover = `data:image/jpeg;base64,${"E".repeat(300_000)}`;
  const book = { id: "local:epub1", source: "source", title: "Inline cover", authors: [], cover };
  // Each write runs alone: any scheduled write snapshots every durable key, which would hide a missing trigger.
  const writeAlone = async (write: () => void) => {
    await store.flushDurableStore();
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
    try {
      write();
      mock.timers.tick(10_000);
    } finally {
      mock.timers.reset();
    }
    await settle();
    return fileKeys();
  };
  const afterAdd = await writeAlone(() => library.toggleEBookLibrary(book as never));
  const saved = afterAdd["harbor.ebook.library.v1"] ?? "";
  assert.match(saved, /"Inline cover"/);
  assert.ok(saved.length < 2_000, `the list carries ${saved.length} bytes, not the cover`);
  assert.equal(library.ebookLibrary()[0]?.cover, cover, "the cover still displays");
  const refs = covers.eBookCoverRefs(saved);
  assert.deepEqual(Object.values(await covers.readEBookCovers(refs)), [cover]);
  const afterLater = await writeAlone(() => library.toggleEBookReadLater(book as never));
  assert.match(afterLater["harbor.ebook.read-later.v1"] ?? "", /"Inline cover"/);
  const afterFavorite = await writeAlone(() => library.toggleEBookFavorite(book as never));
  assert.match(afterFavorite["harbor.ebook.favorites.v1"] ?? "", /"Inline cover"/);
  library.toggleEBookLibrary(book as never);
  library.toggleEBookReadLater(book as never);
  await settle();
  assert.equal(Object.keys(await covers.readEBookCovers(refs)).length, 1, "favorites still use it");
  library.toggleEBookFavorite(book as never);
  await settle();
  assert.deepEqual(await covers.readEBookCovers(refs), {}, "the last list to drop it deletes it");
});

test("an eBook list saved by an older build moves its inline cover out on first read", () => {
  localStorage.clear();
  return (async () => {
    const library = await import("../src/lib/ebook/library.ts");
    const cover = `data:image/png;base64,${"F".repeat(200_000)}`;
    localStorage.setItem(
      "harbor.novel.read-later.v1",
      JSON.stringify([{ id: "77", title: "Old build", authors: [], cover }]),
    );
    assert.equal(library.eBookReadLater()[0]?.cover, cover);
    const stored = localStorage.getItem("harbor.ebook.read-later.v1") ?? "";
    assert.match(stored, /"anilist:77"/);
    assert.ok(!stored.includes("data:"), "the migrated list no longer carries the image");
    localStorage.setItem(
      "harbor.ebook.favorites.v1",
      JSON.stringify([
        { id: "anilist:8", source: "anilist", title: "Current key", authors: [], cover },
      ]),
    );
    assert.equal(library.favoriteEBooks()[0]?.cover, cover);
    assert.ok(
      !(localStorage.getItem("harbor.ebook.favorites.v1") ?? "").includes("data:"),
      "a current-key list with an inline cover is rewritten too",
    );
  })();
});

test("saved games reach user-data.json under their colon-separated profile key", async () => {
  localStorage.clear();
  await store.flushDurableStore();
  const saved = await import("../src/lib/games/saved.ts");
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
  try {
    saved.writeSavedGames("p1", [
      { id: "igdb:7", igdbId: 7, name: "Kept game", capsule: "", platforms: [] } as never,
    ]);
    mock.timers.tick(10_000);
  } finally {
    mock.timers.reset();
  }
  await settle();
  assert.match(fileKeys()["harbor.games.saved.v1:p1"] ?? "", /"Kept game"/);
  assert.equal(recovery.isPrunable("harbor.games.saved.v1:p1"), false);
  assert.equal(store.isDurableKey("harbor.games.saved.v1x"), false);
});

test("Live TV pins, queue saves, detail layout and sports reminders reach user-data.json", async () => {
  localStorage.clear();
  const pins = await import("../src/lib/iptv/pins.ts");
  const saved = await import("../src/lib/feed/saved.ts");
  const skipped = await import("../src/lib/feed/skipped.ts");
  const detail = await import("../src/lib/detail-customization.ts");
  const reminders = await import("../src/lib/sports/reminders.ts");
  // Each write runs alone: any scheduled write snapshots every durable key, which would hide a missing trigger.
  const writeAlone = async (write: () => void) => {
    await store.flushDurableStore();
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() + 60_000 });
    try {
      write();
      mock.timers.tick(10_000);
    } finally {
      mock.timers.reset();
    }
    await settle();
    return fileKeys();
  };
  const afterPin = await writeAlone(() => pins.togglePin("src1::bbc"));
  assert.equal(afterPin["harbor.iptv.pins.v1"], '["src1::bbc"]');
  const afterSave = await writeAlone(() => saved.toggleSaved("tt77"));
  assert.match(afterSave["harbor.feed.saved"] ?? "", /"tt77"/);
  const afterBlock = await writeAlone(() => skipped.blockQueueItem("tt78"));
  assert.equal(afterBlock["harbor.feed.blocked"], '["tt78"]');
  const afterLayout = await writeAlone(() =>
    detail.saveDetailCustomization({ order: ["cast"], hidden: ["trailers"] }),
  );
  assert.equal(afterLayout["harbor.detailLayout"], '{"order":["cast"],"hidden":["trailers"]}');
  const afterReminder = await writeAlone(() =>
    reminders.saveSportsReminder({
      id: "espn:nba:1",
      name: "Finals",
      league: "nba",
      startMs: Date.now() + 86_400_000,
      leadMinutes: 15,
      channels: ["discord"],
      sent: {},
      attempted: {},
      failed: [],
    }),
  );
  assert.match(afterReminder["harbor.sports.reminders.v1"] ?? "", /"Finals"/);
  for (const key of [
    "harbor.installed-addons.p1",
    "harbor.games.collections.v1:p1",
    "harbor.games.notes.v1:p1:g1",
  ]) {
    assert.equal(store.isDurableKey(key), true, key);
    assert.equal(recovery.isPrunable(key), false, key);
  }
  assert.equal(store.isDurableKey("harbor.feed.skipped"), false, "14-day snoozes stay local");
  assert.equal(store.isDurableKey("harbor.iptv.hydration.v2"), false);
});

test("a backup carries the eBook covers its lists reference, and restoring brings them back", async () => {
  localStorage.clear();
  const { loadModule } = await import("./helpers/hook-harness.ts");
  const { profileRosterFor } = await import("./helpers/profile-roster.ts");
  const covers = await import("../src/lib/ebook/covers.ts");
  const library = await import("../src/lib/ebook/library.ts");
  const backup = loadModule(
    "src/lib/backup.ts",
    {
      "@/lib/download-text": {},
      "@/lib/profile-sync/backup-payload": { buildSyncBackup: () => ({}) },
      "@/lib/theme-storage": { loadBgImage: async () => null, saveBgImage: async () => {} },
      "@/lib/profiles": { readAllProfilesIdentity: () => [] },
      "@/lib/profile-roster": profileRosterFor(localStorage),
      "@/lib/active-profile-id": { activeProfileId: () => "default" },
      "@/lib/secret-store": {
        flushSecrets: async () => {},
        getAllSecrets: () => ({}),
        isSecretKey: () => false,
        secretKeyForProfile: (k: string) => k,
        setSecret() {},
      },
      "@/lib/settings/profile-store": {
        isSettingsSecretsKey: () => false,
        migrateBlobSecrets: (v: string) => v,
      },
      "@/lib/storage-recovery": recovery,
      "@/lib/durable-store": store,
      "@/lib/ebook/covers": covers,
      "@/lib/collection-images": {
        collectionImageRefs: () => [],
        readCollectionImages: async () => ({}),
        releaseCollectionImage() {},
        restoreCollectionImages: async () => {},
      },
      "@/lib/iptv/url-credentials": { URL_SECRET_PLACEHOLDER: "***", hasUrlSecrets: () => false },
      "@/lib/local-library": {
        localLibraryReady: async () => {},
        readLocalLibrary: () => ({}),
        restoreLocalLibrary() {},
      },
    },
    { __APP_VERSION__: "test" },
  );
  const cover = `data:image/jpeg;base64,${"G".repeat(50_000)}`;
  library.toggleEBookLibrary({
    id: "local:bk",
    source: "source",
    title: "Backed up",
    authors: [],
    cover,
  } as never);
  await settle();
  const exported = await backup.buildBackup();
  assert.deepEqual(Object.values(exported.ebookCovers ?? {}), [cover]);
  const parsed = backup.parseBackup(JSON.stringify(exported));
  assert.equal(parsed.ok, true);
  const refs = covers.eBookCoverRefs(exported.data["harbor.ebook.library.v1"] ?? null);
  covers.releaseEBookCovers(refs, new Set());
  await settle();
  assert.deepEqual(await covers.readEBookCovers(refs), {}, "the cover is gone before the restore");
  await backup.applyBackup(parsed.backup);
  assert.deepEqual(Object.values(await covers.readEBookCovers(refs)), [cover]);
});

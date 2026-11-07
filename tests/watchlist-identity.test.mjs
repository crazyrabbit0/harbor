import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { isOrphanAnimeCandidate } from "../src/lib/anime-detect.ts";
import { hookHarness } from "./helpers/hook-harness.ts";
import { profileRosterFor } from "./helpers/profile-roster.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Execute production functions with isolated storage and no network or React rendering.
function load(path, mocks = {}, storage = undefined) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  new Function("require", "exports", "localStorage", output)(
    (name) => mocks[name] ?? {},
    exports,
    storage,
  );
  return exports;
}

const tab = load("src/views/library/watchlist-tab.tsx", {
  "@/lib/trakt/to-meta": load("src/lib/trakt/to-meta.ts"),
  "@/lib/stremio": { libraryMetaType: (type) => type },
  "./shared": { parseTs: (value) => (value ? Date.parse(value) : null) },
});
const local = (id, imdbId) => ({ id, imdbId, type: "movie", name: "Aladdin", addedAt: 1 });
const cloud = (id) => ({ _id: id, type: "movie", name: "Aladdin", removed: false });
const trakt = (tmdb, imdb, year) => ({
  type: "movie",
  title: "Aladdin",
  year,
  ids: { tmdb, imdb },
});

test("same-name remakes with different years remain separate", () => {
  const result = tab.mergeWatchlist([], [], [trakt(1, "tt1", 1992), trakt(2, "tt2", 2019)]);
  assert.equal(result.length, 2);
});

test("unknown-year local and Stremio titles are not collapsed by name", () => {
  const result = tab.mergeWatchlist([local("tmdb:movie:2")], [cloud("tt1")], []);
  assert.equal(result.length, 2);
});

test("IMDb aliases combine local, Stremio and Trakt while preserving removal handles", () => {
  const result = tab.mergeWatchlist(
    [local("tmdb:movie:1", "tt1")],
    [cloud("tt1")],
    [trakt(1, "tt1", 1992)],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].stremioId, "tt1");
  assert.equal(result[0].localId, "tmdb:movie:1");
});

test("bookmarked-only filtering excludes temporary entries in both library modes", () => {
  for (const mode of ["library", "watchlist"]) {
    const items = [
      cloud("tt1"),
      { ...cloud("tt2"), temp: true },
      { ...cloud("tt3"), removed: true },
    ];
    assert.deepEqual(
      tab.filterLibrary(items, true, mode).map((item) => item._id),
      ["tt1"],
    );
  }
});

test("a late identity bridge collapses both pre-existing ID forms", () => {
  const result = tab.mergeWatchlist(
    [local("tmdb:movie:1", "tt1")],
    [cloud("tt1"), cloud("tmdb:movie:1")],
    [trakt(1, "tt1", 1992)],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].localId, "tmdb:movie:1");
});

function watchlist() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const api = load(
    "src/lib/watchlist.ts",
    {
      "@/lib/profile-roster": profileRosterFor(storage),
      "@/lib/storage-recovery": {
        setItemWithRecovery: (key, value) => {
          data.set(key, value);
          return true;
        },
      },
      "@/lib/cinemeta": {
        persistableAddonOrigin: () => undefined,
        persistableVideos: () => undefined,
      },
      "@/lib/auth": { readActiveStremioAuthKey: () => null },
      "@/lib/trakt/ids": { stremioIdToTraktTarget: () => ({ ok: false }) },
      "@/lib/simkl/session": { isAuthenticated: () => false },
    },
    storage,
  );
  return api;
}

test("unchanged aggregate responses stop the subscriber refresh cycle", () => {
  const api = watchlist();
  let notifications = 0;
  api.subscribeWatchlist(() => {
    notifications++;
    assert.ok(notifications <= 1, "unchanged response must not recursively notify");
    api.setWatchlistAggregate(["tt2", "tt1", "tt1"]);
  });
  api.setWatchlistAggregate(["tt1", "tt2"]);
  assert.equal(notifications, 1);
});

test("removing a known film also removes its local IMDb/TMDB twin", () => {
  const api = watchlist();
  api.addToWatchlist(local("tmdb:movie:1", "tt1"));
  api.addToWatchlist(local("tt1"));
  api.setWatchlistAggregate(["tt1", "tmdb:movie:1", "tt2"]);
  assert.equal(api.toggleWatchlist({ ...local("tmdb:movie:1", "tt1") }), false);
  assert.deepEqual(api.readLocalEntries(), []);
  assert.deepEqual(api.watchlistAllIds(), ["tt2"]);
});

const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: "fragment" };
const elements = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((child) => elements(child, out));
  else if (node && typeof node === "object" && "props" in node) {
    out.push(node);
    elements(node.props.children, out);
    for (const [key, value] of Object.entries(node.props)) {
      if (key !== "children" && value && typeof value === "object") elements(value, out);
    }
  }
  return out;
};

function renderWatchlistTab(librarySort, flat) {
  const toggled = [];
  const GroupedGrid = () => null;
  const entry = local("tmdb:movie:7", "tt7");
  const harness = hookHarness(
    "src/views/library/watchlist-tab.tsx",
    "WatchlistTab",
    {
      "react/jsx-runtime": jsxRuntime,
      "@/lib/auth": { useAuth: () => ({ authKey: null }) },
      "@/lib/settings": {
        useSettingsSelector: (select) => select({ libraryBookmarkedOnly: true, librarySort }),
      },
      "@/lib/stremio": { library: async () => [], libraryMetaType: (type) => type },
      "@/lib/trakt/watchlist": { fetchWatchlist: async () => [] },
      "@/lib/trakt/provider": { useTrakt: () => ({ isConnected: false }) },
      "@/lib/trakt/to-meta": {},
      "@/lib/trakt/ids": {},
      "@/lib/simkl/ids": {},
      "@/lib/simkl/watchlist": {},
      "@/lib/simkl/session": { isAuthenticated: () => false },
      "@/lib/watchlist": {
        evictWatchlistAggregate: () => {},
        readLocalEntries: () => [entry],
        removeFromWatchlist: () => {},
        subscribeWatchlist: () => () => {},
        toggleWatchlist: (item) => toggled.push(item.id),
      },
      "@/lib/watchlist-sync": {},
      "@/lib/i18n": { useT: () => (text) => text },
      "./shared": {
        applyFilter: (items) => items,
        countByType: () => ({}),
        EmptyWatchlist: () => null,
        FilterBar: () => null,
        GroupedGrid,
        groupByDate: (items) => [{ label: "Today", items }],
        parseTs: () => null,
        SortControl: () => null,
        sortedGroups: (items) => [{ label: "A", items }],
      },
      "./featured-context": { useReportFeatured: () => {} },
    },
    {
      window: { addEventListener: () => {}, removeEventListener: () => {} },
      localStorage: {
        getItem: (key) => (key === "harbor.watchlist.flat" && flat ? "1" : null),
        setItem: () => {},
      },
    },
  );
  const scrollRef = { current: null };
  const grids = elements(harness.render({ mode: "watchlist", scrollRef })).filter(
    (node) => node.type === GroupedGrid,
  );
  return { grids, scrollRef, toggled };
}

test("all library groupings retain virtualization and local removal wiring", () => {
  for (const [sort, flat] of [
    ["title", false],
    ["recent", true],
    ["recent", false],
  ]) {
    const { grids, scrollRef, toggled } = renderWatchlistTab(sort, flat);
    assert.equal(grids.length, 1, `${sort}/${flat} renders one grid`);
    assert.equal(grids[0].props.scrollRef, scrollRef, `${sort}/${flat} grid is virtualized`);
    grids[0].props.onRemoveLocal("tmdb:movie:7");
    assert.deepEqual(toggled, ["tmdb:movie:7"], `${sort}/${flat} removes local entries`);
  }

  const VirtualGrid = () => null;
  const WatchlistCard = () => null;
  const shared = hookHarness("src/views/library/shared.tsx", "GroupedGrid", {
    "react/jsx-runtime": jsxRuntime,
    "lucide-react": {},
    "@/lib/settings": { useSettings: () => ({ settings: { posterScale: 1 } }) },
    "@/lib/i18n": { useT: () => (text) => text },
    "@/components/virtual-grid": { VirtualGrid },
    "./watchlist-card": { WatchlistCard },
    "@/lib/library/hydrate-meta": {},
  });
  const item = { key: "a", meta: { id: "tmdb:movie:7" }, date: null, localId: "tmdb:movie:7" };
  for (const scrollRef of [{ current: null }, undefined]) {
    const removed = [];
    const tree = shared.render({
      groups: [{ label: "A", items: [item] }],
      onRemove: () => assert.fail("a local-only item has no Stremio removal"),
      onRemoveLocal: (id) => removed.push(id),
      scrollRef,
    });
    const nodes = elements(tree);
    const virtual = nodes.find((node) => node.type === VirtualGrid);
    assert.equal(!!virtual, !!scrollRef);
    const card = virtual
      ? virtual.props.renderItem(item)
      : nodes.find((node) => node.type === WatchlistCard);
    card.props.onRemove();
    assert.deepEqual(removed, ["tmdb:movie:7"]);
  }
});

// detail.tsx is too large to render; run its orphan Kitsu search block on its own.
function orphanKitsuSearch() {
  const source = read("src/views/detail.tsx");
  const anchor = source.indexOf("const name = meta.name || detail?.title;");
  const start = source.lastIndexOf("if (k == null) {", anchor);
  let depth = 0;
  let end = start;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  const body = ts.transpile(
    `return (async () => { let k = null; ${source.slice(start, end)} return k; })();`,
    { target: ts.ScriptTarget.ES2022 },
  );
  const run = new Function(
    "meta",
    "detail",
    "searchAnime",
    "kitsuYearVerdict",
    "isOrphanAnimeCandidate",
    "failedKitsu",
    "cancelled",
    body,
  );
  return async (meta, detail, hits) => {
    const searched = [];
    const k = await run(
      meta,
      detail,
      async (name) => {
        searched.push(name);
        return hits;
      },
      async () => "ok",
      isOrphanAnimeCandidate,
      { current: null },
      false,
    );
    return { k, searched };
  };
}

test("anime search fallback retains animation, full-name and exact-year guards", async () => {
  const search = orphanKitsuSearch();
  const anime = (name) => ({ name, type: "series", genres: ["Animation"], country: "Japan" });
  const year = { year: "2022" };
  const hit = (name, y, kitsuId) => ({ name, year: y, kitsuId });

  const exact = await search(anime("Bleach TYBW"), year, [hit("Bleach: TYBW", "2022", 5)]);
  assert.equal(exact.k, 5);

  const western = { ...anime("Bleach TYBW"), country: "United States" };
  assert.deepEqual(await search(western, year, [hit("Bleach TYBW", "2022", 5)]), {
    k: null,
    searched: [],
  });
  assert.deepEqual((await search(anime("B"), year, [hit("B", "2022", 5)])).searched, []);

  const prefix = await search(anime("Bleach TYBW"), year, [hit("Bleach TYBW Part 2", "2022", 6)]);
  assert.equal(prefix.k, null);

  const otherYear = await search(anime("Bleach TYBW"), year, [
    hit("Bleach TYBW", "2004", 7),
    hit("Bleach TYBW", "2022", 8),
  ]);
  assert.equal(otherYear.k, 8);
  assert.equal((await search(anime("Bleach TYBW"), year, [hit("Bleach TYBW", "2004", 7)])).k, null);
});

test("invalidated refreshes cannot publish or retain stale membership", async () => {
  const published = [];
  let finishTrakt;
  let current = true;
  const api = load("src/lib/watchlist-sync.tsx", {
    "@/lib/stremio": { library: async () => [cloud("tt1")] },
    "@/lib/trakt/watchlist": {
      fetchWatchlist: () =>
        new Promise((resolve) => {
          finishTrakt = resolve;
        }),
    },
    "@/lib/watchlist": { setWatchlistAggregate: (ids) => published.push(ids) },
  });
  const pending = api.refreshWatchlistAggregates("test-auth", true, false, () => current);
  await Promise.resolve();
  current = false;
  finishTrakt([trakt(1, "tt1", 1992)]);
  await pending;
  assert.deepEqual(published, []);
  api.setStremioAggregate(["tt2"]);
  assert.deepEqual(published, [["tt2"]]);
});

test("current refreshes combine all connected providers and exclude temporary items", async () => {
  const published = [];
  const api = load("src/lib/watchlist-sync.tsx", {
    "@/lib/stremio": { library: async () => [cloud("tt1"), { ...cloud("tt9"), temp: true }] },
    "@/lib/trakt/watchlist": { fetchWatchlist: async () => [trakt(2, "tt2", 1992)] },
    "@/lib/simkl/watchlist": { fetchWatchlist: async () => [trakt(3, "tt3", 2019)] },
    "@/lib/watchlist": { setWatchlistAggregate: (ids) => published.push(ids) },
  });
  const items = await api.refreshWatchlistAggregates("test-auth", true, true);
  assert.equal(items.length, 1);
  assert.deepEqual(published, [["tt1", "tt2", "tmdb:movie:2", "tt3", "tmdb:movie:3"]]);
});

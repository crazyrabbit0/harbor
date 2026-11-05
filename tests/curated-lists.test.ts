// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { LIST_SEEDS } from "../src/lib/curated/catalog";
import { rankInItems, type CuratedListItem, type CuratedSnapshot } from "../src/lib/curated/types";
import en from "../src/lib/i18n/locales/en";
import { curatedListsHarness, readJson } from "./helpers/curated-lists-harness";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness";

const { REGISTRY_LATEST_LIST_ID } = loadModule("src/lib/film-registry/inductions.ts", {
  "@/data/film-registry/inductions.json": { default: { inductions: {} } },
});

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const index = readJson("src/data/curated/index.json") as {
  builtAt: string;
  lists: Array<{ id: string; count: number; snapshotDate: string; head: CuratedListItem[] }>;
};

const snapshotOf = (id: string) => readJson(`src/data/curated/${id}.json`) as CuratedSnapshot;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];
const text = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text((n as N).props?.children)
        : "";

const noLoads = () => {
  const loads: string[] = [];
  const load = async (id: string) => {
    loads.push(id);
    return [];
  };
  return { loads, load };
};

test("every descriptor has a snapshot and the index agrees with it", () => {
  assert.ok(DATE.test(index.builtAt), "index carries a build date");
  for (const seed of LIST_SEEDS) {
    const entry = index.lists.find((l) => l.id === seed.id);
    assert.ok(entry, `${seed.id} is in the index`);
    const snap = snapshotOf(seed.id);
    assert.equal(snap.id, seed.id);
    assert.equal(snap.count, snap.items.length, `${seed.id} count matches its items`);
    assert.equal(entry.count, snap.count, `${seed.id} index count matches the snapshot`);
    assert.equal(entry.snapshotDate, snap.snapshotDate);
    assert.ok(DATE.test(snap.snapshotDate), `${seed.id} snapshot date is a plain date`);
    assert.equal(
      entry.head.length,
      Math.min(seed.rowCount, snap.count),
      `${seed.id} head is the row slice`,
    );
    assert.deepEqual(entry.head, snap.items.slice(0, entry.head.length), `${seed.id} head matches`);
  }
});

test("a snapshot never publishes below the descriptor floor", () => {
  for (const seed of LIST_SEEDS) {
    const snap = snapshotOf(seed.id);
    assert.ok(
      snap.count >= seed.expectedCount,
      `${seed.id} holds ${snap.count}, floor is ${seed.expectedCount}`,
    );
  }
});

test("every item carries a usable IMDb id and a unique one", () => {
  for (const seed of LIST_SEEDS) {
    const snap = snapshotOf(seed.id);
    const seen = new Set<string>();
    for (const item of snap.items) {
      assert.match(item.imdb, /^tt\d+$/, `${seed.id} ${item.title} has an IMDb id`);
      assert.ok(!seen.has(item.imdb), `${seed.id} lists ${item.imdb} once`);
      seen.add(item.imdb);
      assert.ok(item.title.length > 0, `${seed.id} ${item.imdb} has a title`);
    }
  }
});

test("awarded lists run newest first and every item states its year", () => {
  const awarded = LIST_SEEDS.filter((s) => s.ordering === "awarded");
  assert.ok(awarded.length > 0, "the Wikidata tenants are declared");
  for (const seed of awarded) {
    const snap = snapshotOf(seed.id);
    let previous = Infinity;
    for (const item of snap.items) {
      assert.equal(item.rank, null, `${seed.id} ${item.title} claims no rank`);
      assert.equal(
        typeof item.awardYear,
        "number",
        `${seed.id} ${item.title} states the year it was honoured`,
      );
      assert.ok(
        item.awardYear <= previous,
        `${seed.id} year ${item.awardYear} follows ${previous}, so the order is broken`,
      );
      previous = item.awardYear;
    }
  }
});

test("ranked and spine lists stay in the curator's order", () => {
  for (const seed of LIST_SEEDS) {
    if (seed.ordering !== "ranked" && seed.ordering !== "spine") continue;
    const snap = snapshotOf(seed.id);
    let previous = 0;
    for (const item of snap.items) {
      assert.ok(item.rank != null, `${seed.id} ${item.title} carries a rank`);
      assert.ok(
        item.rank > previous,
        `${seed.id} rank ${item.rank} follows ${previous}, so the order is broken`,
      );
      previous = item.rank;
    }
  }
});

test("the ported NYT list keeps its published ranks", () => {
  const seed = LIST_SEEDS.find((s) => s.id === "nyt-tv-100");
  assert.ok(seed, "the NYT list is a descriptor rather than four files");
  assert.equal(seed.kind, "series");
  assert.equal(seed.ordering, "ranked");
  assert.equal(seed.source.kind, "bundled");
  const items = snapshotOf("nyt-tv-100").items;
  assert.equal(items.length, 100);
  assert.equal(rankInItems(items, "tt0903747"), 1);
  assert.equal(rankInItems(items, "tt0306414"), 2);
  assert.equal(rankInItems(items, "tt1837576"), 100);
  assert.equal(rankInItems(items, "tt0000000"), null);
  assert.equal(rankInItems(items, null), null);
});

test("the detail page can look a NYT rank up without loading a chunk", async () => {
  const { loads, load } = noLoads();
  const { canon, useCanon } = curatedListsHarness(load);
  const nyt = (entries: readonly any[]) => entries.find((e) => e.listId === "nyt-tv-100");
  const immediate = nyt(canon.canonFor("tt0903747", "series"));
  assert.equal(immediate?.place, 1, "Breaking Bad answers from the bundled head");
  assert.equal(immediate?.companion?.forRank, 1, "the rank-one companion rides along");
  assert.equal(nyt(canon.canonFor("tt1837576", "series"))?.place, 100, "the head is the list");
  assert.equal(nyt(canon.canonFor("tt0903747", "movie")), undefined, "a film never matches");

  const first = useCanon.render({ imdbId: "tt0306414", kind: "series" });
  assert.equal(nyt(first)?.place, 2, "the first render already shows the rank");
  await flushPromises();
  assert.ok(!loads.includes("nyt-tv-100"), "the NYT snapshot chunk is never requested");
  assert.equal(nyt(useCanon.render({ imdbId: "tt0306414", kind: "series" }))?.place, 2);

  const calls: unknown[][] = [];
  const entry = { listId: "nyt-tv-100", ordering: "ranked", place: 1, curator: "NYT" };
  const block = hookHarness(
    "src/components/awards-block.tsx",
    "AwardsBlock",
    {
      "lucide-react": new Proxy({}, { get: (_t, name) => String(name) }),
      "@/assets/awards/nyt-logo.svg": { default: "nyt.svg" },
      "./curated-list-logos": { curatedListLogos: {} },
      "@/lib/providers/tmdb": {},
      "@/lib/curated/use-canon": {
        useCanon: (...args: unknown[]) => (calls.push(args), [entry]),
      },
      "@/lib/settings": {},
      "@/lib/view": {},
      "@/lib/providers/wikidata": {},
      "@/lib/i18n": { useT: () => (s: string) => s },
      "./icons/award-logo": {},
      "./icons/laurel": {},
      "react/jsx-runtime": jsx,
    },
    {},
    ["CuratedAccolade"],
  );
  const tree = block.render({ awards: [], imdbId: "tt0903747", kind: "series" });
  assert.deepEqual(calls, [["tt0903747", "series"]], "the block asks useCanon for this title");
  const accolades = all(tree).filter((n) => n.type === block.exports.CuratedAccolade);
  assert.deepEqual(
    accolades.map((n) => n.props.entry),
    [entry],
  );
});

test("Criterion membership never pulls its snapshot", async () => {
  const { loads, load } = noLoads();
  const { canon, registry, useCanon } = curatedListsHarness(load);
  const criterion = registry.curatedList("criterion-collection");
  assert.ok(criterion.head.length < criterion.count, "Criterion's head is partial");
  assert.equal(canon.eligible(criterion, "movie"), false);
  assert.ok(
    !canon.canonPending("movie").some((l: { id: string }) => l.id === "criterion-collection"),
    "the 125KB snapshot is never queued",
  );
  const found = canon
    .canonFor("tt0033467", "movie")
    .find((e: { listId: string }) => e.listId === "criterion-collection");
  assert.equal(found?.place, 1104, "the spine file answers Criterion");
  assert.equal(found?.ordering, "spine");

  const first = useCanon.render({ imdbId: "tt0033467", kind: "movie" });
  assert.ok(first.some((e: { listId: string }) => e.listId === "criterion-collection"));
  await flushPromises();
  assert.ok(loads.length > 0, "the partial poll lists are still loaded");
  assert.ok(!loads.includes("criterion-collection"), "Criterion is never loaded");

  const spine = readJson("src/data/criterion-spine.json") as {
    count: number;
    spines: Record<string, number>;
  };
  assert.equal(spine.spines["tt0033467"], 1104);
  assert.ok(spine.count > 1000, "the spine file carries the whole collection");
});

test("the canon lists a viewer names are complete on disk even when the index head is short", () => {
  for (const id of ["sight-and-sound-2022", "afi-100-1998", "national-film-registry"]) {
    const seed = LIST_SEEDS.find((s) => s.id === id);
    assert.ok(seed, `${id} is a known list`);
    const snap = snapshotOf(id);
    const entry = index.lists.find((l) => l.id === id);
    assert.ok(entry, `${id} is indexed`);
    assert.ok(entry.head.length < snap.count, `${id} is the partial case the lazy load exists for`);
    assert.equal(snap.items.length, snap.count, `${id} snapshot holds every item`);
  }
});

test("the Criterion snapshot is in spine order with sparse slots", () => {
  const seed = LIST_SEEDS.find((s) => s.id === "criterion-collection");
  assert.ok(seed);
  assert.equal(seed.ordering, "spine");
  const items = snapshotOf("criterion-collection").items;
  assert.equal(items[0].imdb, "tt0028950");
  assert.equal(items[4].imdb, "tt0053198");
  assert.ok(items.at(-1).rank > items.length, "spine slots are sparser than the item count");
});

test("the row and the page only badge a number the data carries", () => {
  const { registry } = curatedListsHarness(async () => []);
  const list = (ordering: string) => ({ ...registry.curatedList("nyt-tv-100"), ordering });
  const item = { rank: 7, imdb: "tt0053198", title: "x", year: 1959, awardYear: 2003 };
  assert.equal(registry.cardBadge(list("ranked"), item), "7");
  assert.equal(registry.cardBadge(list("ranked"), { ...item, rank: null }), null);
  assert.equal(registry.cardBadge(list("spine"), item), "5", "a spine badge reads the sidecar");
  assert.equal(registry.cardBadge(list("spine"), { ...item, imdb: "tt0000000" }), null);
  assert.equal(registry.cardBadge(list("awarded"), item), "2003");
  assert.equal(registry.cardBadge(list("awarded"), { ...item, awardYear: undefined }), null);
  assert.equal(registry.cardBadge(list("unordered"), item), null);

  const badge = hookHarness("src/components/curated-card-badge.tsx", "CuratedCardBadge", {
    "@/lib/curated/registry": registry,
    "react/jsx-runtime": jsx,
  });
  assert.equal(text(badge.render({ list: list("spine"), item })), "5");
  assert.equal(badge.render({ list: list("unordered"), item }), null, "no number, no badge");

  const Badge = "CuratedCardBadge";
  const nyt = registry.curatedList("nyt-tv-100");
  const row = hookHarness("src/components/curated-list-row.tsx", "CuratedListRow", {
    "@/assets/awards/nyt-logo.svg": { default: "nyt.svg" },
    "@/components/curated-card-badge": { CuratedCardBadge: Badge },
    "@/components/pick-card": { PickCard: "PickCard" },
    "@/lib/i18n": { useT: () => (s: string) => s },
    "@/lib/curated/registry": registry,
    "@/lib/view": { useViewActions: () => ({ openCuratedList: () => {} }) },
    "./row": { Row: "Row" },
    "react/jsx-runtime": jsx,
  });
  const rowBadges = all(row.render({ listId: "nyt-tv-100" })).filter((n) => n.type === Badge);
  assert.equal(rowBadges.length, nyt.head.length, "every row card carries the shared badge");
  rowBadges.forEach((n, i) => {
    assert.equal(n.props.list, nyt);
    assert.equal(n.props.item, nyt.head[i], "the row hands the badge its own item");
  });

  const grid = hookHarness("src/views/curated-list/list-grid.tsx", "ListGrid", {
    "@/components/curated-card-badge": { CuratedCardBadge: Badge },
    "@/components/pick-card": { PickCard: "PickCard" },
    "@/lib/i18n": { useT: () => (s: string) => s },
    "@/lib/curated/registry": registry,
    "react/jsx-runtime": jsx,
  });
  const items = [nyt.head[3], nyt.head[0], nyt.head[9]];
  const gridBadges = all(grid.render({ list: nyt, items, scrollRoot: { current: null } })).filter(
    (n) => n.type === Badge,
  );
  assert.deepEqual(
    gridBadges.map((n) => n.props.item),
    items,
    "the grid badges each item it shows, never a position",
  );
  assert.ok(gridBadges.every((n) => n.props.list === nyt));
});

test("the Criterion spine sidecar is joined to the shipped list", () => {
  const spine = readJson("src/data/criterion-spine.json") as {
    builtAt: string;
    count: number;
    lowest: number;
    highest: number;
    spines: Record<string, number>;
  };
  assert.ok(DATE.test(spine.builtAt), "the sidecar carries a build date");
  assert.equal(spine.count, Object.keys(spine.spines).length);
  assert.ok(spine.count >= 1200, `${spine.count} spines, the floor is 1200`);
  assert.equal(spine.lowest, 1, "spine one exists");
  assert.ok(spine.highest > spine.count, "spine slots are sparser than the film count");
  assert.equal(spine.spines["tt0028950"], 1, "La Grande Illusion is spine one");
  assert.equal(spine.spines["tt0053198"], 5, "The 400 Blows is spine five");
  const items = snapshotOf("criterion-collection").items;
  const joined = items.filter((i) => spine.spines[i.imdb] != null).length;
  assert.ok(
    joined > items.length * 0.7,
    `only ${joined} of ${items.length} Criterion items resolve a spine number`,
  );
});

test("a festival badge names its prize without leaning on the curator line", () => {
  const badged = LIST_SEEDS.filter((s) => s.badge);
  assert.equal(badged.length, 8, "the eight unshipped festival prizes are badged");
  for (const seed of badged) {
    assert.equal(seed.ordering, "awarded", `${seed.id} badges an award year`);
    const snap = snapshotOf(seed.id);
    assert.ok(seed.rowCount >= snap.count, `${seed.id} head covers all ${snap.count} items`);
  }
  const shipped = readJson("src/data/awards.json") as Record<string, unknown>;
  for (const already of ["cannes", "venice", "berlin"]) {
    assert.ok(shipped[already], `${already} stays with the bundled award table`);
  }
  const badges = badged.map((s) => s.badge);
  assert.ok(!badges.includes("Palme d'Or"), "the top prizes already shipped are not duplicated");
  assert.ok(!badges.includes("Golden Lion"));
  assert.ok(!badges.includes("Golden Bear"));
});

test("no list descriptor duplicates an id or a pinned source", () => {
  const ids = new Set<string>();
  const sources = new Set<string>();
  for (const seed of LIST_SEEDS) {
    assert.ok(!ids.has(seed.id), `${seed.id} is declared once`);
    ids.add(seed.id);
    if (seed.source.kind === "wikidata") {
      const qid = seed.source.award;
      assert.match(qid, /^Q\d+$/, `${seed.id} pins a Wikidata item`);
      assert.ok(!sources.has(qid), `Wikidata item ${qid} is pinned once`);
      sources.add(qid);
      assert.equal(seed.source.url, `https://www.wikidata.org/wiki/${qid}`);
      continue;
    }
    if (seed.source.kind !== "trakt") continue;
    const key = String(seed.source.listId);
    assert.ok(!sources.has(key), `Trakt list ${key} is pinned once`);
    sources.add(key);
    assert.match(seed.source.url, /^https:\/\/trakt\.tv\/lists\/\d+$/);
    assert.ok(seed.source.url.endsWith(key), `${seed.id} url points at its pinned id`);
  }
});

test("only the rails Discover actually renders claim one", () => {
  const own = LIST_SEEDS.filter((s) => s.discoverRow === true).map((s) => s.id);
  assert.deepEqual([...own].sort(), ["national-film-registry-latest", "nyt-tv-100"]);
  assert.equal(REGISTRY_LATEST_LIST_ID, "national-film-registry-latest");
  const { registry } = curatedListsHarness(async () => []);
  const shelf = registry.shelfLists().map((l: { id: string }) => l.id);
  const lists = registry.curatedLists().map((l: { id: string }) => l.id);
  assert.deepEqual(
    shelf,
    lists.filter((id: string) => !own.includes(id)),
    "the rest reach the reader through the canon shelf",
  );
  // discover.tsx is too large and entangled to render, so its three switch arms stay as text.
  const discover = read("src/views/discover.tsx");
  assert.match(discover, /case "special:nyt-tv":\s*return <CuratedListRow listId="nyt-tv-100" /);
  assert.match(
    discover,
    /case "special:film-registry":\s*return <CuratedListRow listId=\{REGISTRY_LATEST_LIST_ID\} /,
  );
  assert.match(discover, /case "special:canon":\s*return <CuratedListTiles /);
});

test("English strings for every descriptor are registered", () => {
  const catalog = en as Record<string, string>;
  for (const seed of LIST_SEEDS) {
    for (const value of [seed.title, seed.curator, seed.blurb]) {
      assert.equal(catalog[value], value, `"${value.slice(0, 40)}" is in the English catalogue`);
    }
  }
});

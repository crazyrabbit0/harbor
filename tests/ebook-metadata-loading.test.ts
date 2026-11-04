import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { EBook } from "../src/lib/ebook/api.ts";
import { loadEBookApi } from "./helpers/ebook-harness.ts";
import { flushPromises, loadModule } from "./helpers/hook-harness.ts";

const METADATA_KEY = "harbor.ebook.metadata.v1";
const hang = () => new Promise<never>(() => {});

const book = (title: string, authors = ["Frank Herbert"]): EBook => ({
  id: `source:p:${title}`,
  source: "source",
  providerId: "p",
  sourceItemId: title,
  title,
  authors,
  description: "",
  genres: [],
});

const googleBook = (title: string, author: string) => ({
  items: [{ id: `g-${title}`, volumeInfo: { title, authors: [author], description: "Google" } }],
});
const binding = (id: string, title: string, description: string) => ({
  item: { value: `http://www.wikidata.org/entity/${id}` },
  matched: { value: title },
  itemDescription: { value: description },
});
const entity = (id: string, title: string, description: string, wiki?: string) => ({
  id,
  labels: { en: { value: title } },
  descriptions: { en: { value: description } },
  sitelinks: wiki ? { enwiki: { title: wiki } } : undefined,
});

type Answer = (url: URL) => unknown;

/** Loads api.ts over a scripted network, an in-memory localStorage and a manual timer queue. */
function metadataApi(answer: Answer, stored: Record<string, string> = {}) {
  const store = new Map(Object.entries(stored));
  const timers: (() => void)[] = [];
  const fetched: string[] = [];
  const anilist: unknown[] = [];
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
  const api = loadModule(
    "src/lib/ebook/api.ts",
    {
      "@/lib/anilist/client": {
        anilistRequest: async (_query: string, variables: unknown) => (anilist.push(variables), {}),
      },
      "@/lib/anilist/relations": { animeRelations: async () => [] },
      "@/lib/i18n": { getUiLanguage: () => "en" },
      "@/lib/safe-fetch": {
        safeFetch: async (url: string) => {
          fetched.push(url);
          const value = await answer(new URL(url));
          return { ok: true, json: async () => value };
        },
      },
      "@/lib/storage-recovery": {
        setItemWithRecovery: (key: string, value: string) => (store.set(key, value), true),
      },
    },
    { localStorage, setTimeout: (fn: () => void) => timers.push(fn), clearTimeout() {}, window: {} },
  );
  const count = (host: string) => fetched.filter((url) => new URL(url).hostname === host).length;
  const runTimers = () => timers.splice(0).forEach((fn) => fn());
  return { api, store, anilist, count, runTimers };
}

const sources = (list: EBook[] | undefined) => (list ?? []).map((item) => item.source).sort();

test("eBook metadata persists merged provider results and coalesces duplicate requests", async () => {
  const dune = book("Dune");
  const network: Answer = (url) =>
    url.hostname === "www.googleapis.com"
      ? googleBook("Dune", "Frank Herbert")
      : url.hostname === "query.wikidata.org"
        ? { results: { bindings: [binding("Q1", "Dune", "1965 novel by Frank Herbert")] } }
        : { entities: { Q1: entity("Q1", "Dune", "1965 novel by Frank Herbert") } };
  const first = metadataApi(network);
  const [one, two] = await Promise.all([
    first.api.fetchEBookMetadata([dune]),
    first.api.fetchEBookMetadata([dune]),
  ]);
  assert.deepEqual(sources(one), ["googlebooks", "wikidata"]);
  assert.deepEqual(two, one);
  first.runTimers();
  const persisted = Object.values(JSON.parse(first.store.get(METADATA_KEY) ?? "{}")) as {
    metadata: EBook[];
  }[];
  assert.deepEqual(sources(persisted[0]?.metadata), ["googlebooks", "wikidata"]);

  const later = metadataApi(hang, Object.fromEntries(first.store));
  let published = 0;
  const reloaded = await later.api.fetchEBookMetadata([dune], () => published++);
  assert.deepEqual(sources(reloaded), ["googlebooks", "wikidata"]);
  assert.equal(published, 1, "a fresh cache answers once without starting a lookup");
  assert.equal(later.count("www.googleapis.com") + later.count("query.wikidata.org"), 0);

  const empty: Answer = (url) =>
    url.hostname === "query.wikidata.org" ? { results: { bindings: [] } } : { items: [], docs: [] };
  const unknown = metadataApi(empty);
  const novel = book("Unknown Novel");
  await Promise.all([
    unknown.api.fetchEBookMetadata([novel]),
    unknown.api.fetchEBookMetadata([novel]),
  ]);
  assert.equal(unknown.anilist.length, 1, "a duplicate request joins the running lookup");

  const shared = metadataApi(empty);
  await Promise.all([
    shared.api.fetchEBookMetadata([book("Dune")]),
    shared.api.fetchEBookMetadata([book("Dune", ["Brian Herbert"])]),
  ]);
  assert.equal(shared.count("query.wikidata.org"), 1, "identical JSON requests share one fetch");
});

test("eBook metadata publishes provider results before every provider has settled", async () => {
  const titles = (list: EBook[]) => list.map((item) => `${item.source}:${item.title}`);
  const watch = (api: Record<string, any>, books: EBook[]) => {
    const partials: string[][] = [];
    let settled = false;
    void api
      .fetchEBookMetadata(books, (list: EBook[]) => partials.push(titles(list)))
      .then(() => (settled = true));
    return { partials, settled: () => settled };
  };
  const dune = book("Dune");
  const emma = book("Emma", ["Jane Austen"]);

  const staleAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const seeded = metadataApi(
    (url) => (url.hostname === "www.googleapis.com" ? googleBook("Dune", "Frank Herbert") : {}),
  );
  await seeded.api.fetchEBookMetadata([dune]).catch(() => []);
  seeded.runTimers();
  const record = JSON.parse(seeded.store.get(METADATA_KEY)!) as Record<string, { at: number }>;
  for (const entry of Object.values(record)) entry.at = staleAt;
  const cached = watch(metadataApi(hang, { [METADATA_KEY]: JSON.stringify(record) }).api, [dune]);
  await flushPromises();
  assert.deepEqual(cached.partials[0], ["googlebooks:Dune"], "a stale cache is shown at once");
  assert.equal(cached.settled(), false);

  const google = watch(
    metadataApi((url) =>
      url.hostname === "www.googleapis.com" && url.searchParams.get("q")?.includes("Dune")
        ? googleBook("Dune", "Frank Herbert")
        : hang(),
    ).api,
    [dune, emma],
  );
  await flushPromises();
  assert.deepEqual(google.partials, [["googlebooks:Dune"]]);
  assert.equal(google.settled(), false);

  const wikidata = watch(
    metadataApi((url) =>
      url.hostname === "query.wikidata.org"
        ? {
            results: {
              bindings: [
                binding("Q1", "Dune", "1965 novel by Frank Herbert"),
                binding("Q2", "Emma", "1815 novel by Jane Austen"),
              ],
            },
          }
        : url.hostname === "www.wikidata.org"
          ? {
              entities: {
                Q1: entity("Q1", "Dune", "1965 novel by Frank Herbert"),
                Q2: entity("Q2", "Emma", "1815 novel by Jane Austen", "Emma (novel)"),
              },
            }
          : hang(),
    ).api,
    [dune, emma],
  );
  await flushPromises();
  await flushPromises();
  assert.deepEqual(wikidata.partials, [["wikidata:Dune"]]);
  assert.equal(wikidata.settled(), false);

  let summary: (value: unknown) => void = () => {};
  const lookup = metadataApi((url) =>
    url.hostname === "www.googleapis.com"
      ? { items: [] }
      : url.hostname === "query.wikidata.org"
        ? { results: { bindings: [binding("Q1", "Dune", "1965 novel by Frank Herbert")] } }
        : url.hostname === "www.wikidata.org"
          ? { entities: { Q1: entity("Q1", "Dune", "1965 novel by Frank Herbert", "Dune") } }
          : url.hostname === "en.wikipedia.org"
            ? new Promise((resolve) => (summary = resolve))
            : { docs: [] },
  );
  const done = lookup.api.fetchEBookMetadata([book("Dune")]);
  await flushPromises();
  await flushPromises();
  summary({ extract: "Dune is a 1965 science fiction novel by Frank Herbert." });
  assert.deepEqual(sources(await done), ["wikidata"]);
  assert.deepEqual(lookup.anilist, [], "a Wikidata match makes the AniList fallback unnecessary");
});

const NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India"];
const CATALOG = [...NAMES, "Juliet", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec"];

type ProvidersOptions = {
  fetchEBookMetadata?: (batch: EBook[], onPartial?: (list: EBook[]) => void) => Promise<EBook[]>;
  plugins?: { id: string; name: string; enabled: boolean; impl: Record<string, any> }[];
  sources?: unknown[];
  fs?: Record<string, unknown>;
  epub?: Record<string, unknown>;
};

/** Loads providers.ts over the real merge helpers with fake plugins, sources and files. */
function loadProviders(options: ProvidersOptions) {
  const api = loadEBookApi();
  class PluginWorker {
    plugin: { impl: Record<string, any> };
    constructor(plugin: { impl: Record<string, any> }) {
      this.plugin = plugin;
    }
    call(method: string, args: unknown[]) {
      return Promise.resolve(this.plugin.impl[method](...args));
    }
    dispose() {}
  }
  return loadModule("src/lib/ebook/providers.ts", {
    "./extensions": {
      loadEBookExtensions: async () => {},
      installedEBookPlugins: () => options.plugins ?? [],
      subscribeEBookExtensions: () => {},
    },
    "./api": { ...api, fetchEBookMetadata: options.fetchEBookMetadata ?? (async () => []) },
    "./epub": options.epub ?? {},
    "./gutendex": {},
    "./sources": { listEBookSources: () => options.sources ?? [] },
    "@/assets/gutenberg.png": { default: "gutenberg.png" },
    "@/lib/safe-fetch": { safeFetch: async () => ({ ok: false }) },
    "./translation": {},
    "./cache": {},
    "@/lib/manga/plugins/worker-host": { PluginWorker },
    "./chapter-locations": {},
    "./reader-state": {},
    "@tauri-apps/plugin-fs": options.fs ?? {},
    "@tauri-apps/api/path": { join: async (parent: string, child: string) => `${parent}/${child}` },
  });
}

test("source browse enrichment does not block on a detail request per card", async () => {
  const details: string[] = [];
  const pending: { titles: string[]; release: () => void }[] = [];
  const providers = loadProviders({
    plugins: [
      {
        id: "p",
        name: "Plugin",
        enabled: true,
        impl: {
          popular: () => CATALOG.map((title) => ({ id: title, title, author: "Ann" })),
          detail: (id: string) => (details.push(id), null),
        },
      },
    ],
    fetchEBookMetadata: (batch, onPartial) =>
      new Promise((resolve) => {
        onPartial?.([{ ...batch[0], id: "meta", source: "googlebooks", description: "Metadata" }]);
        pending.push({ titles: batch.map((item) => item.title), release: () => resolve([]) });
      }),
  });
  const enrichedEarly: string[] = [];
  const page = await providers.loadSourceEBookPage(undefined, "plugin:p", {}, {
    onMetadata: (items: EBook[]) =>
      enrichedEarly.push(...items.filter((item) => item.description).map((item) => item.title)),
  });
  await flushPromises();
  assert.deepEqual(
    pending.map((batch) => batch.titles.length),
    [8, 8],
    "two metadata batches run while the third waits",
  );
  assert.deepEqual(enrichedEarly, ["Alpha", "India"], "partial metadata reaches cards early");
  pending[0].release();
  await flushPromises();
  assert.deepEqual(
    pending.map((batch) => batch.titles.length),
    [8, 8, 1],
  );
  pending.slice(1).forEach((batch) => batch.release());
  assert.equal((await page.enriched).length, CATALOG.length);
  assert.deepEqual(details, []);
});

test("local EPUB catalog entries expose their embedded cover before metadata merging", async () => {
  const cover = "data:image/png;base64,AA==";
  const providers = loadProviders({
    sources: [{ id: "local", name: "Local", kind: "local", location: "C:/books" }],
    fs: {
      readDir: async (dir: string) =>
        dir === "C:/books" ? [{ name: "Dune.epub", isFile: true, isDirectory: false }] : [],
      readFile: async (path: string) => {
        if (path !== "C:/books/Dune.epub") throw new Error(`unexpected ${path}`);
        return new Uint8Array([1]);
      },
    },
    epub: { parseEpub: () => ({ title: "Dune", cover, authors: [], chapters: [] }) },
  });
  const page = await providers.loadSourceEBookCatalogPage("local");
  assert.deepEqual(
    page.items.map((item: EBook) => [item.sourceItemId, item.cover, item.internalCover]),
    [["C:/books/Dune.epub", cover, cover]],
  );
});

// views/ebook.tsx is 3,451 lines with an unmanageable import graph, so its wiring stays as text.
const view = readFileSync(new URL("../src/views/ebook.tsx", import.meta.url), "utf8");

test("eBook collections use the installed source catalog without reverse metadata searches", () => {
  assert.match(view, /buildSourceEBookCollections\(\[\s*\.\.\.\(sourceCatalogItems \?\? \[\]\),/);
  assert.match(
    view,
    /await loadSourceEBookCatalogPage\(\s*providerId,\s*nextCursor,\s*browseTagRef\.current,\s*\)/,
  );
  assert.match(view, /\(title\) => searchSourceEBookCatalog\(title, providerId\),/);
  assert.doesNotMatch(view, /ebookCollections\(/);
  assert.doesNotMatch(view, /searchSourceEBooks\(book\.title/);
});

test("the Popular eBooks rail fetches metadata only when the source has no popular books", () => {
  assert.match(
    view,
    /const needsPopularMetadata = sourceCatalogItems !== null && sourceCatalogItems\.length === 0;/,
  );
  assert.match(view, /if \(!needsPopularMetadata\) return;\s*let active = true;/);
  assert.match(view, /const popularBooks = preferredEBookPopular\(sourceCatalogItems, popular\);/);
  assert.match(view, /items: popularBooks,/);
});

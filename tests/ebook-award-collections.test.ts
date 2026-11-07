import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { EBook } from "../src/lib/ebook/api.ts";
import {
  buildSourceEBookCollections,
  streamSourceEBookAwardMatches,
} from "../src/lib/ebook/collections.ts";
import { loadModule } from "./helpers/hook-harness.ts";

const book = (id: string, title: string, extra: Partial<EBook> = {}): EBook => ({
  id,
  source: "source",
  providerId: "demo",
  title,
  authors: [],
  description: "",
  genres: [],
  ...extra,
});

const novel = (id: string, label: string, image?: string) => ({
  id,
  labels: { en: { value: label } },
  descriptions: { en: { value: "novel" } },
  claims: {
    P31: [{ mainsnak: { datavalue: { value: { id: "Q7725634" } } } }],
    ...(image ? { P18: [{ mainsnak: { datavalue: { value: image } } }] } : {}),
  },
});

/** Runs api.ts wikidataAwardCollections against a scripted Wikidata that answers only P166/P1686 queries. */
function awardApi() {
  const sparql: string[] = [];
  const entities: Record<string, unknown> = {
    Q100: { id: "Q100", labels: { en: { value: "Hugo Award for Best Novel" } } },
    Q1: novel("Q1", "Dune", "dune.jpg"),
    Q2: novel("Q2", "Neuromancer", "neuro.jpg"),
    Q3: novel("Q3", "Hyperion", "hyperion.jpg"),
    Q4: novel("Q4", "No Cover"),
    Q5: {
      id: "Q5",
      labels: { en: { value: "A Film" } },
      descriptions: { en: { value: "film" } },
      claims: { P18: [{ mainsnak: { datavalue: { value: "film.jpg" } } }] },
    },
  };
  const answer = (url: URL) => {
    if (url.hostname === "query.wikidata.org") {
      const query = url.searchParams.get("query") ?? "";
      sparql.push(query);
      const awards = /wdt:P166 \?award/.test(query) && /pq:P1686 \?seed/.test(query);
      const members = /\?item wdt:P166 \?award/.test(query) && /pq:P1686 \?item/.test(query);
      const uri = (id: string) => ({ value: `http://www.wikidata.org/entity/${id}` });
      if (query.includes("?seed ?award"))
        return { results: { bindings: awards ? [{ seed: uri("Q1"), award: uri("Q100") }] : [] } };
      if (query.includes("?award ?item"))
        return {
          results: {
            bindings: members
              ? ["Q1", "Q2", "Q3", "Q4", "Q5"].map((id) => ({ award: uri("Q100"), item: uri(id) }))
              : [],
          },
        };
    }
    if (url.pathname === "/w/api.php") {
      const ids = url.searchParams.get("ids")?.split("|") ?? [];
      return { entities: Object.fromEntries(ids.map((id) => [id, entities[id]])) };
    }
    return { docs: [] };
  };
  const api = loadModule(
    "src/lib/ebook/api.ts",
    {
      "@/lib/anilist/client": { anilistRequest: async () => ({}) },
      "@/lib/anilist/relations": { animeRelations: async () => [] },
      "@/lib/i18n": { getUiLanguage: () => "en" },
      "@/lib/safe-fetch": {
        safeFetch: async (url: string) => ({
          ok: true,
          status: 200,
          json: async () => answer(new URL(url)),
        }),
      },
      "@/lib/storage-recovery": { setItemWithRecovery: () => true },
    },
    {
      localStorage: {
        length: 0,
        key: () => null,
        getItem: () => null,
        removeItem: () => {},
      },
    },
    ["wikidataAwardCollections", "wikidataMetadata", "metadataRequestKey"],
  );
  return { api, sparql };
}

test("eBook award collections use confirmed Wikidata award relationships", async () => {
  const { api, sparql } = awardApi();
  const owner = book("source:demo:dune", "Dune");
  api.wikidataMetadata.set(api.metadataRequestKey(owner), { ...owner, wikidataId: "Q1" });
  const results = await api.wikidataAwardCollections([owner]);
  assert.equal(sparql.length, 2, "one award query and one member query");
  assert.equal(results.length, 1);
  assert.equal(results[0].book, owner);
  assert.equal(results[0].collection.kind, "award");
  assert.equal(results[0].collection.name, "Hugo Award for Best Novel");
  // The owner, an uncovered novel and a non-literary winner are left out.
  assert.deepEqual(results[0].collection.books.map((member: EBook) => member.title).sort(), [
    "Hyperion",
    "Neuromancer",
  ]);
});

test("the Collections screen resolves curated awards through installed sources", async () => {
  const searched: string[] = [];
  const found = new Map([
    ["Neuromancer", book("source:demo:neuro", "Neuromancer")],
    ["Hyperion", book("source:demo:hyp", "Hyperion")],
  ]);
  const chunks: EBook[][] = [];
  const all = await streamSourceEBookAwardMatches(
    [book("source:demo:dune", "Dune")],
    async (query) => (searched.push(query), found.has(query) ? [found.get(query)!] : []),
    (books) => chunks.push(books),
  );
  assert.ok(!searched.includes("Dune"), "a title the source already listed is not searched");
  assert.ok(searched.includes("Neuromancer"));
  assert.deepEqual(
    chunks
      .flat()
      .map((b) => b.title)
      .sort(),
    ["Hyperion", "Neuromancer"],
  );
  const hugo = buildSourceEBookCollections(all).find((c) => c.id === "award:hugo");
  assert.equal(hugo?.kind, "award");
  assert.deepEqual(
    hugo?.books.map((b) => b.title),
    ["Dune", "Neuromancer", "Hyperion"],
  );
  // views/ebook.tsx is too large to load; its one wiring line passes the installed-source search.
  const view = readFileSync(new URL("../src/views/ebook.tsx", import.meta.url), "utf8");
  assert.match(view, /^\s*\(title\) => searchSourceEBookCatalog\(title, providerId\),$/m);
});

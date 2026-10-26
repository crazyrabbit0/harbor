import assert from "node:assert/strict";
import test from "node:test";
import { loadModule, readSource } from "../scripts/benchmark-discover.mjs";

type Meta = { id: string; name: string };
type Row = {
  key: string;
  metas: Meta[];
  page: number;
  hasMore: boolean;
  maxItems?: number;
  fetcher?: (page: number) => Promise<Meta[]>;
};

function harness() {
  const calls: string[] = [];
  const list = (name: string) => async (page: number) => {
    calls.push(`${name}:${page}`);
    return Array.from({ length: 25 }, (_, i) => ({
      id: `${name}-${(page - 1) * 25 + i}`,
      name: `${name} ${i} (TV)`,
    }));
  };
  const rows = loadModule(readSource("src/views/home/home-rows.ts"), {
    "@/lib/addons": {},
    "@/lib/cinemeta": {},
    "@/lib/providers/tmdb": {},
    "@/lib/providers/tmdb/tmdb-client": {},
    "@/lib/providers/jikan": {
      jikanTopAiring: list("airing"),
      jikanNewReleases: list("new"),
      jikanTopPopular: list("popular"),
      jikanUpcoming: list("upcoming"),
      stripFranchiseSuffix: (name: string) => name.replace(/ \(TV\)$/, ""),
    },
  }) as { buildAnimeHomeRows(): Promise<Row[]> };
  return { rows, calls };
}

test("anime rows request only the first page of each category up front", async () => {
  const { rows, calls } = harness();
  const built = await rows.buildAnimeHomeRows();
  assert.deepEqual(calls.sort(), ["airing:1", "new:1", "popular:1", "upcoming:1"]);
  assert.equal(built.length, 4);
  for (const row of built) {
    assert.equal(row.page, 1);
    assert.equal(row.hasMore, true);
    assert.equal(row.metas.length, 25);
  }
});

test("paging a row through its fetcher reaches the same three pages, cleaned and capped", async () => {
  const { rows } = harness();
  const [row] = await rows.buildAnimeHomeRows();
  const metas = [...row.metas];
  for (let page = 2; ; page++) {
    const more = await row.fetcher!(page);
    if (more.length === 0) break;
    metas.push(...more);
  }
  assert.equal(metas.length, 75);
  assert.equal(metas.slice(0, row.maxItems).length, 60);
  assert.equal(metas[30].name, "airing 5");
  assert.equal(new Set(metas.map((m) => m.id)).size, 75);
});

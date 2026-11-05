// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { loadModule } from "./helpers/hook-harness.ts";

type M = { id: string; name: string; poster: string; genres?: string[] };
type Theme = { id: string; type: string; genre?: string; seeds?: string[] };

const { VOYAGE_THEMES } = loadModule("src/lib/voyage/themes.ts", {
  "@/components/genre-tiles": { GENRE_PALETTE: new Proxy({}, { get: () => ({}) }) },
});

const meta = (id: string, genres: string[] = []): M => ({ id, name: id, poster: "p", genres });

// Live catalogue answers its first page only; curated seeds resolve to plain metas.
function generator(firstPage: M[]) {
  const urls: string[] = [];
  const mod = loadModule(
    "src/lib/voyage/generate.ts",
    {
      "@/lib/safe-fetch": {
        safeFetch: async (url: string) => {
          urls.push(url);
          return {
            ok: true,
            json: async () => ({ metas: url.includes("skip=") ? [] : firstPage }),
          };
        },
      },
      "@/lib/cinemeta": { meta: async (_type: string, id: string) => meta(id) },
      "@/lib/playback-history": { watchTitleKey: (name: string) => name.toLowerCase() },
    },
    // Identity shuffle: Math.random just below 1 keeps every element in place.
    { Math: Object.assign(Object.create(Math), { random: () => 0.999999 }) },
  );
  const pool = (theme: Theme) =>
    mod.generatePool(theme).then((list: M[]) => list.map((m) => m.id)) as Promise<string[]>;
  return { pool, urls };
}

test("every voyage theme ships curated tastemaker picks", () => {
  assert.ok(VOYAGE_THEMES.length >= 6, `expected the six themes, found ${VOYAGE_THEMES.length}`);
  for (const theme of VOYAGE_THEMES as Theme[]) {
    const seeds = theme.seeds ?? [];
    assert.ok(seeds.length >= 12, `theme ${theme.id} only has ${seeds.length} seeds`);
    for (const s of seeds) assert.match(s, /^tt\d+$/, `theme ${theme.id} seed ${s}`);
  }
});

test("curated seeds are unique within a theme", () => {
  for (const theme of VOYAGE_THEMES as Theme[]) {
    const seeds = theme.seeds ?? [];
    assert.equal(new Set(seeds).size, seeds.length, `theme ${theme.id} repeats a seed`);
  }
});

test("api picks must lead with the theme genre so loose tags cannot leak in", async () => {
  const lead = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"].map((id) => meta(id, ["Crime"]));
  const loose = [meta("x1", ["Drama", "Crime"]), meta("x2", ["Comedy"]), meta("x3")];
  const { pool, urls } = generator([...loose, ...lead]);
  assert.deepEqual(await pool({ id: "heist", type: "movie", genre: "Crime" }), [
    "a1",
    "a2",
    "a3",
    "a4",
    "a5",
    "a6",
    "a7",
  ]);
  assert.match(urls[0], /\/movie\/top\/genre=Crime\.json$/);
});

test("a genre that rarely leads still gets api picks instead of going empty", async () => {
  const page = [
    meta("t1", ["Drama", "Crime"]),
    meta("l1", ["Crime"]),
    meta("o1", ["Comedy"]),
    meta("t2", ["Action", "crime"]),
    meta("l2", ["crime", "Drama"]),
  ];
  const { pool } = generator(page);
  assert.deepEqual(await pool({ id: "heist", type: "movie", genre: "Crime" }), [
    "l1",
    "l2",
    "t1",
    "t2",
  ]);
});

test("the pool blends curated and api picks rather than one or the other", async () => {
  const live = ["s1", "l1", "l2", "l3", "l4", "l5", "l6"].map((id) => meta(id, ["Crime"]));
  const { pool } = generator(live);
  const theme = { id: "heist", type: "movie", genre: "Crime", seeds: ["s1", "s2"] };
  assert.deepEqual(await pool(theme), ["s1", "s2", "l1", "l2", "l3", "l4", "l5", "l6"]);
});

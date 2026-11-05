// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as uniqueArt from "../src/lib/unique-art.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

const { claimUniqueArt, releaseUniqueArt } = uniqueArt;

type Item = { id: string };
const pool = (...ids: string[]): Item[] => ids.map((id) => ({ id }));
const idOf = (m: Item) => m.id;

test("two tiles drawing from overlapping pools never show the same title", () => {
  releaseUniqueArt("a");
  releaseUniqueArt("b");
  const a = claimUniqueArt("a", pool("t1", "t2", "t3", "t4", "t5"), idOf, 3);
  const b = claimUniqueArt("b", pool("t2", "t3", "t4", "t5", "t6"), idOf, 3);
  assert.deepEqual(a.map(idOf), ["t1", "t2", "t3"]);
  assert.deepEqual(b.map(idOf), ["t4", "t5", "t6"]);
  const overlap = a.map(idOf).filter((id) => b.map(idOf).includes(id));
  assert.deepEqual(overlap, [], "adjacent tiles shared artwork");
});

test("re-claiming the same tile releases its old art instead of starving itself", () => {
  releaseUniqueArt("a");
  const first = claimUniqueArt("a", pool("t1", "t2", "t3"), idOf, 3);
  const again = claimUniqueArt("a", pool("t1", "t2", "t3"), idOf, 3);
  assert.deepEqual(again.map(idOf), first.map(idOf));
});

test("unmounting a tile frees its art for the others", () => {
  releaseUniqueArt("a");
  releaseUniqueArt("b");
  claimUniqueArt("a", pool("t1", "t2", "t3"), idOf, 3);
  releaseUniqueArt("a");
  const b = claimUniqueArt("b", pool("t1", "t2", "t3"), idOf, 3);
  assert.deepEqual(b.map(idOf), ["t1", "t2", "t3"]);
});

test("a tile with nothing left returns fewer rather than duplicating", () => {
  releaseUniqueArt("a");
  releaseUniqueArt("b");
  claimUniqueArt("a", pool("t1", "t2"), idOf, 2);
  const b = claimUniqueArt("b", pool("t1", "t2"), idOf, 2);
  assert.deepEqual(b, []);
});

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

// One art sample per row: the first entry has no backdrop, the rest overlap across tiles.
const SAMPLE = [
  { id: "bare" },
  ...["g1", "g2", "g3", "g4", "g5"].map((id) => ({ id, background: `${id}.jpg` })),
];

const ROWS = [
  {
    file: "src/components/genre-tiles.tsx",
    tile: "GenreTile",
    props: (n: number) => ({ genre: `Genre${n}` }),
    fetcher: { "@/lib/feed": { fetchGenreSample: async () => SAMPLE } },
    extra: { "@/lib/feed/tags": { MOVIE_GENRES: {} } },
  },
  {
    file: "src/components/language-tiles.tsx",
    tile: "LanguageTile",
    props: (n: number) => ({ lang: { iso: `l${n}`, name: "", endonym: "", hue: 0 } }),
    fetcher: { "@/lib/providers/tmdb": { tmdbDiscover: async () => SAMPLE } },
    extra: {},
  },
];

for (const row of ROWS) {
  test(`${row.file} tiles claim distinct art and free it on unmount`, async () => {
    const mount = (n: number) => {
      const h = hookHarness(
        row.file,
        row.tile,
        {
          ...row.fetcher,
          ...row.extra,
          "@/lib/i18n": { useT: () => (s: string) => s },
          "@/lib/providers/rpdb": { rpdbPoster: (_k: string, _id: string, src: string) => src },
          "@/lib/settings": {
            useSettingsSelector: (pick: (s: object) => unknown) =>
              pick({ tmdbKey: "k", rpdbKey: "" }),
          },
          "@/lib/unique-art": uniqueArt,
          "@/lib/view": { useViewActions: () => ({ openFilter: () => {} }) },
          "./row": { Row: "Row" },
          "./poster": { Poster: "Poster" },
          "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
        },
        {},
        [row.tile],
      );
      h.render(row.props(n));
      const art = async () => {
        await flushPromises();
        const tree = h.render(row.props(n));
        const collage = all(tree).find((e) => Array.isArray(e.props.backdrops));
        return (collage?.props.backdrops ?? []).map((m: { id: string }) => m.id);
      };
      return { art, unmount: () => h.unmount() };
    };
    const first = mount(1);
    const second = mount(2);
    assert.deepEqual(await first.art(), ["g1", "g2", "g3"]);
    assert.deepEqual(await second.art(), ["g4", "g5"]);
    first.unmount();
    second.unmount();
    const third = mount(3);
    assert.deepEqual(await third.art(), ["g1", "g2", "g3"]);
    third.unmount();
  });
}

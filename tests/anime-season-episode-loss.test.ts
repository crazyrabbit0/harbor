// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { buildAnimeOrder } from "../src/views/detail/anime-episodes/anime-order-utils.ts";
import { animePanelOf, tvdbOrderOf, type TvdbSlot } from "./helpers/anime-panel-harness.ts";

const HXH_S2 = 78;

// Hunter x Hunter season 2: TVDB lists 78 slots, Kitsu merges each pair of them into one episode.
function hxhSeason2() {
  const slots: TvdbSlot[] = [];
  const pool: any[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < HXH_S2; i++) {
    const abs = 59 + Math.floor(i / 2) * 2;
    slots.push({ id: 9000 + i, seasonNumber: 2, episodeNumber: i + 1, abs });
    if (seen.has(abs)) continue;
    seen.add(abs);
    pool.push({ id: 4000 + abs, number: abs, absoluteNumber: abs, title: `E${abs}`, synopsis: "" });
  }
  return { slots, pool };
}

test("the panel keeps all 78 slots when two TVDB slots share one Kitsu episode", async () => {
  const { slots, pool } = hxhSeason2();
  const panel = await animePanelOf(pool, slots);
  assert.ok(panel, "the panel is built");
  const rows = panel.visibleEpisodes;
  assert.equal(rows.length, HXH_S2, "season 2 must keep all 78 episodes");
  assert.equal(new Set(rows.map((r) => r.id)).size, HXH_S2, "and they must all be distinct rows");
  assert.equal(
    rows.filter((r) => r.id > 0).length,
    HXH_S2 / 2,
    "each Kitsu episode fills one slot",
  );
});

test("the order builder claims each matched episode once across seasons", () => {
  const { slots, pool } = hxhSeason2();
  const season1: TvdbSlot = { id: 8000, seasonNumber: 1, episodeNumber: 1, abs: 1 };
  const out = buildAnimeOrder(tvdbOrderOf([season1, ...slots]), pool, "Extras");
  assert.ok(out, "two seasons build an order");
  const rows = out.subsetByKey.get("2")!;
  assert.equal(rows.length, HXH_S2);
  assert.equal(new Set(rows.map((r) => r.id)).size, HXH_S2, "no episode is placed twice");
  assert.equal(rows.filter((r) => r.id > 0).length, HXH_S2 / 2);
});

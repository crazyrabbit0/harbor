// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { isGenericEpisodeName } from "../src/lib/providers/anime-episode-build.ts";

test("numbered placeholders in any listed language are generic", () => {
  for (const name of [
    "Episode 1",
    "Ep. 12",
    "EPISODE 100",
    "(Episode 3)",
    "Episode – 7",
    "Серия 5",
    "الحلقة 7",
    "επεισόδιο 4",
    "Bölüm 12",
    "Tập 5",
    "第18話",
    "18화",
    "  12  ",
    "Episode",
  ]) {
    assert.equal(isGenericEpisodeName(name), true, name);
  }
});

test("real titles, including ones that mention an episode word, are not generic", () => {
  for (const name of [
    "The Boy in the Iceberg",
    "Episode 12 - The Return",
    "Episodes of the Past",
    "Episodio 1 - Il ritorno",
    "Chapter 1: The Beginning",
    "Ep 1 ep 2",
    "A Very Long Episode Title That Mentions episode inside it",
    "",
  ]) {
    assert.equal(isGenericEpisodeName(name), false, name);
  }
});

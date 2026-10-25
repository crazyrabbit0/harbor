import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("SEED_VERSION matches the top-level v of the bundled seed", () => {
  const seed = JSON.parse(
    readFileSync(new URL("../public/anime-hero-art.json", import.meta.url), "utf8"),
  ) as { v?: number };
  const source = readFileSync(
    new URL("../src/lib/providers/anime-hero-art-static.ts", import.meta.url),
    "utf8",
  );
  const declared = /export const SEED_VERSION = (\d+);/.exec(source)?.[1];
  assert.equal(Number(declared), seed.v);
});

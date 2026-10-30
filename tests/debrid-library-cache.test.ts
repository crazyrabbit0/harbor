import assert from "node:assert/strict";
import test from "node:test";
import { createLibraryCache } from "../src/lib/debrid/library-cache.ts";

const entry = (id: string) => [{ slug: "rd" as const, id, hash: id, name: id, size: 1 }];

test("the debrid library cache keeps only the most recent API keys", () => {
  const cache = createLibraryCache(60_000);
  for (const key of ["a", "b", "c", "d", "e", "f"]) cache.set(key, entry(key));
  assert.equal(cache.size, 4);
  assert.equal(cache.get("a"), null, "the oldest key is dropped");
  assert.deepEqual(cache.get("f"), entry("f"));
});

test("an expired library is dropped on read", () => {
  const cache = createLibraryCache(0);
  cache.set("a", entry("a"));
  assert.equal(cache.get("a"), null);
  assert.equal(cache.size, 0);
});

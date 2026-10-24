import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import "./_localstorage-stub";

function load() {
  const output = ts.transpileModule(
    readFileSync(new URL("../src/lib/picker-cache.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  let evict: ((aggressive: boolean) => void) | null = null;
  const exports: any = {};
  new Function("require", "exports", output)((id: string) => {
    if (id === "./cache") {
      return { lruSet: (map: Map<string, unknown>, k: string, v: unknown) => map.set(k, v) };
    }
    if (id === "./maintenance") {
      return { registerEvictable: (_n: string, fn: (a: boolean) => void) => (evict = fn) };
    }
    throw new Error(`unexpected import ${id}`);
  }, exports);
  return { api: exports, sweep: (aggressive: boolean) => evict!(aggressive) };
}

const result = { picker: { all: [{ id: 1 }], primary: null, byTier: {} }, rejected: [], raw: {} };
const meta = { id: "tt1", type: "series", name: "Show" };

test("the prefetched next episode survives the aggressive sweep run when the player closes", () => {
  const { api, sweep } = load();
  const next = { season: 1, episode: 3 };
  const other = { season: 1, episode: 2 };
  api.setPickerCache(meta, next, result, "h");
  api.setPickerCache(meta, other, result, "h");
  api.keepPrefetchedPickerCache(meta, next);
  sweep(true);
  assert.ok(api.getPickerCache(meta, next, "h"), "the prefetched entry is kept");
  assert.equal(api.getPickerCache(meta, other, "h"), null, "everything else is swept");
});

test("only the latest prefetch is kept", () => {
  const { api, sweep } = load();
  const first = { season: 1, episode: 3 };
  const second = { season: 1, episode: 4 };
  api.setPickerCache(meta, first, result, "h");
  api.setPickerCache(meta, second, result, "h");
  api.keepPrefetchedPickerCache(meta, first);
  api.keepPrefetchedPickerCache(meta, second);
  sweep(true);
  assert.equal(api.getPickerCache(meta, first, "h"), null);
  assert.ok(api.getPickerCache(meta, second, "h"));
});

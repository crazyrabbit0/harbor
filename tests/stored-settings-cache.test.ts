// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const store = new Map<string, string>();
let parses = 0;
const realParse = JSON.parse;
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
JSON.parse = ((text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) => {
  parses++;
  return realParse(text, reviver);
}) as typeof JSON.parse;

const { storedSettings } = await import("../src/lib/stored-settings.ts");

test("the settings mirror is parsed once per change", () => {
  store.set("harbor.settings", JSON.stringify({ cinemetaEnabled: false, region: "GR" }));
  parses = 0;
  for (let i = 0; i < 50; i++) assert.equal(storedSettings().region, "GR");
  assert.equal(parses, 1);
  store.set("harbor.settings", JSON.stringify({ region: "US" }));
  assert.equal(storedSettings().region, "US");
  assert.equal(parses, 2);
  store.delete("harbor.settings");
  assert.deepEqual(storedSettings(), {});
});

test("broken JSON yields an empty object instead of throwing", () => {
  store.set("harbor.settings", "{not json");
  assert.deepEqual(storedSettings(), {});
  JSON.parse = realParse;
});

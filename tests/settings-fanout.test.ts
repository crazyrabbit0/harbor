// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { applySettingsPatch, changedSettingsKeys } from "../src/lib/settings/patch.ts";
import {
  createSelectionReader,
  createSettingsStore,
  selectionEqual,
} from "../src/lib/settings/selector-store.ts";
import type { Settings } from "../src/lib/settings/types.ts";

const base = (over: Record<string, unknown> = {}) =>
  ({
    posterRadius: 12,
    tmdbKey: "k",
    hideContent: { adult: true },
    ...over,
  }) as unknown as Settings;

test("update with values that are already set keeps the same settings object", () => {
  const s = base();
  assert.equal(applySettingsPatch(s, { posterRadius: 12, tmdbKey: "k" }), s);
  assert.equal(applySettingsPatch(s, {}), s);
});

test("update with one changed value creates a new object holding the patch", () => {
  const s = base();
  const next = applySettingsPatch(s, { posterRadius: 12, tmdbKey: "other" });
  assert.notEqual(next, s);
  assert.equal(next.tmdbKey, "other");
  assert.equal(next.posterRadius, 12);
});

test("only patched keys whose value differs count as changed for sync", () => {
  const changed = changedSettingsKeys(base(), { posterRadius: 12, tmdbKey: "other" });
  assert.deepEqual([...changed], ["tmdbKey"]);
});

test("an equal-content object replaced by a new reference counts as changed", () => {
  const s = base();
  assert.notEqual(applySettingsPatch(s, { hideContent: { adult: true } } as Partial<Settings>), s);
});

test("a selection of unchanged fields keeps its identity across unrelated settings changes", () => {
  const store = createSettingsStore(base());
  const read = createSelectionReader(store, () => (s) => ({ radius: s.posterRadius }));
  const first = read();
  store.set(base({ tmdbKey: "other" }));
  assert.equal(read(), first);
  store.set(base({ posterRadius: 20 }));
  const second = read();
  assert.notEqual(second, first);
  assert.equal(second.radius, 20);
});

test("primitive selections compare by value and nested objects by reference", () => {
  assert.equal(selectionEqual(3, 3), true);
  assert.equal(selectionEqual({ a: 1 }, { a: 1 }), true);
  assert.equal(selectionEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(selectionEqual({ a: { x: 1 } }, { a: { x: 1 } }), false);
  assert.equal(selectionEqual([1], [1]), false);
});

test("the store notifies subscribers only when the settings object changes", () => {
  const s = base();
  const store = createSettingsStore(s);
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.set(s);
  assert.equal(calls, 0);
  store.set(base());
  assert.equal(calls, 1);
  off();
  store.set(base());
  assert.equal(calls, 1);
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";

// A Rust user-data.json behind a fake Tauri bridge; durable-store reads the bridge only at call time.
let userDataFile: string | null = null;
let writes = 0;
(globalThis as { window?: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { content?: string }) => {
      if (cmd === "user_data_read") return userDataFile;
      if (cmd === "user_data_write") {
        writes += 1;
        userDataFile = args.content ?? null;
        return null;
      }
      throw new Error(`unexpected command ${cmd}`);
    },
  },
  addEventListener: () => {},
};

const KEY = "harbor.watchevents.v1.p1";
const fresh = () => import(`../src/lib/durable-store.ts?case=${Math.random()}`);
const fileKeys = () => JSON.parse(userDataFile ?? "{}") as Record<string, string>;

test("a cleared WebView gets its durable keys back from user-data.json", async () => {
  localStorage.clear();
  userDataFile = JSON.stringify({ [KEY]: '[{"id":"tt1"}]', "harbor.other": "x" });
  await (await fresh()).loadDurableStore();
  assert.equal(localStorage.getItem(KEY), '[{"id":"tt1"}]');
  assert.equal(localStorage.getItem("harbor.other"), null, "only listed prefixes are restored");
});

test("the first launch copies existing localStorage into the file without overwriting it", async () => {
  localStorage.clear();
  userDataFile = JSON.stringify({ [KEY]: "old" });
  localStorage.setItem(KEY, "newer");
  await (await fresh()).loadDurableStore();
  assert.equal(localStorage.getItem(KEY), "newer");
  assert.deepEqual(fileKeys(), { [KEY]: "newer" });
});

test("after reconciling once, the file never resurrects a key the app removed", async () => {
  localStorage.clear();
  userDataFile = null;
  localStorage.setItem(KEY, "v1");
  const first = await fresh();
  await first.loadDurableStore();
  localStorage.removeItem(KEY);
  first.syncDurableStore();
  await first.flushDurableStore();
  assert.deepEqual(fileKeys(), {});
  userDataFile = JSON.stringify({ [KEY]: "stale" });
  await (await fresh()).loadDurableStore();
  assert.equal(localStorage.getItem(KEY), null);
});

test("durableSetItem writes localStorage at once and the file after a short delay", async () => {
  localStorage.clear();
  userDataFile = null;
  const store = await fresh();
  await store.loadDurableStore();
  const before = writes;
  store.durableSetItem(KEY, "a");
  store.durableSetItem(KEY, "b");
  assert.equal(localStorage.getItem(KEY), "b");
  await store.flushDurableStore();
  assert.equal(fileKeys()[KEY], "b");
  assert.equal(writes, before + 1, "a burst of writes reaches the file once");
});

test("a corrupt user-data.json is rewritten from localStorage", async () => {
  localStorage.clear();
  userDataFile = "{not json";
  localStorage.setItem(KEY, "kept");
  await (await fresh()).loadDurableStore();
  assert.deepEqual(fileKeys(), { [KEY]: "kept" });
});

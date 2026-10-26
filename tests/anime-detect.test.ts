import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

type Meta = { genres?: string[]; country?: string; originalLanguage?: string };

function fixture(initial: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initial));
  const metaCalls: string[] = [];
  const mappingCalls: string[] = [];
  const metadata = new Map<string, Meta>();
  const mapping = new Map<string, number>();
  const timers: Array<() => void> = [];
  const mocks: Record<string, unknown> = {
    react: { useSyncExternalStore: () => {} },
    "@/lib/cinemeta": {
      meta: async (_type: string, id: string) => {
        metaCalls.push(id);
        return metadata.get(id) ?? null;
      },
    },
    "@/lib/providers/anime-mapping": {
      imdbToKitsu: async (id: string) => {
        mappingCalls.push(id);
        return mapping.get(id) ?? null;
      },
    },
    "@/lib/storage-recovery": {
      setItemWithRecovery: (key: string, value: string) => storage.set(key, value),
    },
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL("../src/lib/anime-detect.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    },
  ).outputText;
  const api = {} as typeof import("../src/lib/anime-detect");
  new Function("require", "exports", "localStorage", "setTimeout", compiled)(
    (id: string) => {
      assert.ok(id in mocks, id);
      return mocks[id];
    },
    api,
    {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
    },
    (fn: () => void) => {
      timers.push(fn);
      return timers.length;
    },
  );
  return { api, metadata, mapping, metaCalls, mappingCalls, storage, timers };
}

test("non-Japanese animation with an exact anime mapping is recognized for CW filtering", async () => {
  const h = fixture();
  h.metadata.set("tt101", { genres: ["Animation", "Drama"], country: "China" });
  h.mapping.set("tt101", 501);
  await h.api.detectAnimeForCw([{ _id: "tt101", type: "series" }]);
  assert.equal(h.api.isDetectedAnime("tt101"), true);
  assert.deepEqual(h.mappingCalls, ["tt101"]);
});

test("unmapped animation and known live action are not classified by country or name alone", async () => {
  const h = fixture();
  h.metadata.set("tt102", { genres: ["Animation"], country: "United States" });
  h.metadata.set("tt103", { genres: ["Drama"], country: "China" });
  h.mapping.set("tt103", 502);
  await h.api.detectAnimeForCw([
    { _id: "tt102", type: "series" },
    { _id: "tt103", type: "series" },
  ]);
  assert.equal(h.api.isDetectedAnime("tt102"), false);
  assert.equal(h.api.isDetectedAnime("tt103"), false);
  assert.deepEqual(h.mappingCalls, ["tt102"]);
});

test("Japanese animation needs no mapping request and repeated concurrent IDs share detection", async () => {
  const h = fixture();
  h.metadata.set("tt104", { genres: ["Animation"], country: "Japan" });
  const items = [
    { _id: "tt104", type: "series" },
    { _id: "tt104", type: "series" },
  ];
  await Promise.all([h.api.detectAnimeForCw(items), h.api.detectAnimeForCw(items)]);
  assert.equal(h.api.isDetectedAnime("tt104"), true);
  assert.deepEqual(h.metaCalls, ["tt104"]);
  assert.deepEqual(h.mappingCalls, []);
});

const day = 24 * 60 * 60 * 1000;

async function relaunch(saved: string, afterMs: number, id: string) {
  const next = fixture({ "harbor.anime.notanime.v3": saved });
  const realNow = Date.now;
  Date.now = () => realNow() + afterMs;
  try {
    await next.api.detectAnimeForCw([{ _id: id, type: "series" }]);
  } finally {
    Date.now = realNow;
  }
  return next;
}

test("a negative saved late in an old list's life outlives that list", async () => {
  const first = fixture({
    "harbor.anime.notanime.v2": JSON.stringify({ t: Date.now() - 13 * day, ids: ["tt200"] }),
  });
  first.metadata.set("tt201", { genres: ["Animation"], country: "United States" });
  await first.api.detectAnimeForCw([{ _id: "tt201", type: "series" }]);
  for (const flush of first.timers.splice(0)) flush();
  const saved = first.storage.get("harbor.anime.notanime.v3")!;
  assert.ok(JSON.parse(saved).ids.tt200, "the legacy list is carried over");
  const next = await relaunch(saved, 2 * day, "tt201");
  assert.deepEqual(next.metaCalls, []);
  assert.deepEqual(next.mappingCalls, []);
  const expired = await relaunch(saved, 2 * day, "tt200");
  assert.deepEqual(expired.metaCalls, ["tt200"], "the old entry still expires on its own date");
});

test("migrating the legacy list saves it even when the session finds nothing new", async () => {
  const h = fixture({
    "harbor.anime.notanime.v2": JSON.stringify({ t: Date.now() - day, ids: ["tt400"] }),
  });
  await h.api.detectAnimeForCw([{ _id: "tt400", type: "series" }]);
  assert.deepEqual(h.metaCalls, []);
  assert.equal(h.timers.length, 0);
  assert.ok(JSON.parse(h.storage.get("harbor.anime.notanime.v3")!).ids.tt400);
});

test("a title without Cinemeta metadata is remembered for a day, not re-mapped every launch", async () => {
  const first = fixture();
  await first.api.detectAnimeForCw([{ _id: "tt300", type: "series" }]);
  assert.deepEqual(first.mappingCalls, ["tt300"]);
  for (const flush of first.timers.splice(0)) flush();
  const saved = first.storage.get("harbor.anime.notanime.v3")!;
  assert.deepEqual((await relaunch(saved, day / 2, "tt300")).mappingCalls, []);
  assert.deepEqual((await relaunch(saved, day + 1, "tt300")).mappingCalls, ["tt300"]);
});

test("old negative classifications cannot suppress the corrected mapping check", async () => {
  const h = fixture({
    "harbor.anime.notanime.v1": JSON.stringify({ t: Date.now(), ids: ["tt105"] }),
  });
  h.metadata.set("tt105", { genres: ["Animation"], country: "China" });
  h.mapping.set("tt105", 505);
  await h.api.detectAnimeForCw([{ _id: "tt105", type: "series" }]);
  assert.equal(h.api.isDetectedAnime("tt105"), true);
});

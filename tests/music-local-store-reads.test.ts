import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadStore(files: Map<string, string>) {
  const calls: string[] = [];
  const source = readFileSync(new URL("../src/lib/music/local-store.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} as any };
  const fs = {
    BaseDirectory: { AppData: 1 },
    exists: async (path: string) => {
      calls.push(`exists ${path}`);
      return files.has(path) || [...files.keys()].some((f) => f.startsWith(`${path}/`));
    },
    mkdir: async () => {},
    readTextFile: async (path: string) => {
      calls.push(`read ${path}`);
      if (!files.has(path)) throw new Error("not found");
      return files.get(path);
    },
    writeTextFile: async (path: string, value: string) => {
      files.set(path, value);
    },
  };
  new Function("require", "module", "exports", "window", code)(() => fs, module, module.exports, {
    __TAURI_INTERNALS__: {},
  });
  return { store: module.exports as typeof import("../src/lib/music/local-store.ts"), calls };
}

test("with no store folder yet, many reads cost one folder check and no file reads", async () => {
  const { store, calls } = loadStore(new Map());
  const results = await Promise.all(["a", "b", "c"].map((n) => store.readLocalJson(n)));
  assert.deepEqual(results, [null, null, null]);
  assert.deepEqual(calls, ["exists music-store"]);
});

test("an existing file is read directly, without a per-file exists check", async () => {
  const { store, calls } = loadStore(new Map([["music-store/a.json", '{"x":1}']]));
  assert.deepEqual(await store.readLocalJson("a"), { x: 1 });
  assert.equal(await store.readLocalJson("missing"), null);
  assert.deepEqual(calls, [
    "exists music-store",
    "read music-store/a.json",
    "read music-store/missing.json",
  ]);
});

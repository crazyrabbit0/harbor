// @ts-expect-error Node test types are outside the browser tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are outside the browser tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are outside the browser tsconfig.
import test from "node:test";
import ts from "typescript";

function loadStremio() {
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/stremio.ts", import.meta.url), "utf8"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const calls: string[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const mocks: Record<string, unknown> = {
    "@/lib/safe-fetch": {
      safeFetch: async (url: string) => {
        const path = url.split("/").pop()!;
        calls.push(path);
        await gate;
        const result = path === "datastoreMeta" ? [["tt1", "2026-01-01"]] : [{ _id: "tt1" }];
        return { ok: true, status: 200, text: async () => JSON.stringify({ result }) };
      },
    },
    "@/lib/resume": { readResumeEntry: () => null, readResumeSource: () => undefined },
  };
  const api: any = {};
  new Function("require", "exports", code)((id: string) => mocks[id] ?? {}, api);
  return { api, calls, release };
}

test("concurrent identical library reads share one Stremio request each", async () => {
  const { api, calls, release } = loadStremio();
  const a = api.library("auth");
  const b = api.library("auth");
  release();
  assert.deepEqual(await a, await b);
  assert.deepEqual(calls, ["datastoreMeta", "datastoreGet"]);
});

test("library writes and reads for other accounts are never shared", async () => {
  const { api, calls, release } = loadStremio();
  release();
  await Promise.all([api.library("auth"), api.library("other")]);
  await Promise.all([
    api.libraryPut("auth", { _id: "tt1", removed: false }),
    api.libraryPut("auth", { _id: "tt1", removed: false }),
  ]);
  assert.equal(calls.filter((c) => c === "datastoreMeta").length, 2);
  assert.equal(calls.filter((c) => c === "datastorePut").length, 2);
});

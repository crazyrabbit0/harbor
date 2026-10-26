// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";

function loadClient() {
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/trakt/client.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports: any = {};
  const calls: Array<{ url: string; method: string }> = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const fetch = async (url: string, init: { method: string }) => {
    calls.push({ url, method: init.method });
    await gate;
    return new Response(JSON.stringify([{ n: calls.length }]), { status: 200 });
  };
  const mocks: Record<string, unknown> = {
    "@/lib/safe-fetch": { safeFetch: fetch },
    "./config": { TRAKT_API_BASE: "https://api.trakt.tv", TRAKT_API_VERSION: "2" },
    "./credentials": { traktApiKey: () => "key" },
    "./session": { getSession: () => ({ accessToken: "tok" }), setSession: () => {} },
  };
  new Function("require", "exports", "fetch", code)(
    (id: string) => {
      assert.ok(id in mocks, `unexpected import ${id}`);
      return mocks[id];
    },
    exports,
    fetch,
  );
  return { api: exports, calls, release };
}

test("concurrent identical GETs share one Trakt request", async () => {
  const { api, calls, release } = loadClient();
  const a = api.traktRequest("/sync/watchlist");
  const b = api.traktRequest("/sync/watchlist");
  release();
  assert.deepEqual(await a, await b);
  assert.equal(calls.length, 1);
});

test("writes and later reads are never merged", async () => {
  const { api, calls, release } = loadClient();
  release();
  await Promise.all([
    api.traktRequest("/sync/history", { method: "POST", body: {} }),
    api.traktRequest("/sync/history", { method: "POST", body: {} }),
  ]);
  await api.traktRequest("/sync/watchlist");
  await api.traktRequest("/sync/watchlist");
  assert.equal(calls.length, 4);
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";

function loadClient() {
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/simkl/client.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports: any = {};
  const calls: string[] = [];
  let profile = "a";
  const session = { accessToken: "tok" };
  const mocks: Record<string, unknown> = {
    "@/lib/safe-fetch": {
      safeFetch: async (url: string, init: { method: string }) => {
        calls.push(`${init.method} ${new URL(url).pathname}`);
        return new Response(JSON.stringify({ n: calls.length }), { status: 200 });
      },
    },
    "@/lib/active-profile-id": { activeProfileId: () => profile },
    "./config": {
      SIMKL_API_BASE: "https://api.simkl.com",
      SIMKL_APP_NAME: "harbor",
      SIMKL_APP_VERSION: "1",
      SIMKL_CLIENT_ID: "cid",
      SIMKL_USER_AGENT: "ua",
    },
    "./session": { getSession: () => session, setSession: () => {} },
    "./retry-policy": { simklRetryPolicy: () => ({ cooldown: null, delayMs: 0 }) },
  };
  new Function("require", "exports", code)((id: string) => {
    assert.ok(id in mocks, `unexpected import ${id}`);
    return mocks[id];
  }, exports);
  return { api: exports, calls, setProfile: (p: string) => (profile = p) };
}

test("concurrent identical Simkl GETs share one request", async () => {
  const { api, calls } = loadClient();
  const [a, b] = await Promise.all([
    api.simklRequest("/sync/playback?limit=40"),
    api.simklRequest("/sync/playback?limit=40"),
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(calls, ["GET /sync/playback"]);
});

test("writes and other profiles are never merged", async () => {
  const { api, calls, setProfile } = loadClient();
  const first = api.simklRequest("/sync/playback?limit=40");
  setProfile("b");
  const second = api.simklRequest("/sync/playback?limit=40");
  // Profile "a"'s request is cancelled by the switch; "b" still gets its own answer, not a shared rejection.
  const [a, b] = await Promise.allSettled([first, second]);
  assert.equal(a.status, "rejected");
  assert.equal(b.status, "fulfilled");
  setProfile("a");
  await Promise.all([
    api.simklRequest("/sync/history", { method: "POST", body: {} }),
    api.simklRequest("/sync/history", { method: "POST", body: {} }),
  ]);
  assert.equal(calls.filter((c) => c === "POST /sync/history").length, 2);
});

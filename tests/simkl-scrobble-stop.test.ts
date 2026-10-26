// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";

class SimklApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`Simkl HTTP ${status}`);
    this.status = status;
  }
}

function loadScrobble(fail: (path: string) => number | null) {
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/simkl/scrobble.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports: any = {};
  const paths: string[] = [];
  const session = {};
  const mocks: Record<string, unknown> = {
    "@/lib/active-profile-id": { activeProfileId: () => "p" },
    "./session": { getSession: () => session },
    "@/lib/tracker-resolve": { resolveForMeta: async () => ({ ok: false }) },
    "./client": {
      SimklApiError,
      simklRequest: async (path: string) => {
        paths.push(path);
        const status = fail(path);
        if (status != null) throw new SimklApiError(status);
        return {};
      },
    },
    "@/lib/anime-detect": { isDetectedAnime: () => false },
    "@/lib/anime-entry-target": {},
    "@/lib/providers/anime-mapping": {},
    "./scrobble-body": {
      buildBody: () => ({ show: { ids: { imdb: "tt0182576" } } }),
      buildEpisodeBody: () => ({}),
    },
  };
  new Function("require", "exports", code)((id: string) => {
    assert.ok(id in mocks, `unexpected import ${id}`);
    return mocks[id];
  }, exports);
  return { api: exports, paths };
}

test("a stop Simkl already recorded (409) counts as delivered", async () => {
  const { api, paths } = loadScrobble(() => 409);
  assert.equal(await api.simklScrobble("stop", "tt0182576", { season: 10, episode: 9 }, 100), true);
  assert.deepEqual(paths, ["/scrobble/stop"]);
});

test("a 409 on any other scrobble action is still a failure", async () => {
  const { api } = loadScrobble(() => 409);
  assert.equal(
    await api.simklScrobble("pause", "tt0182576", { season: 10, episode: 9 }, 40),
    false,
  );
});

test("other stop errors stay failures so the watch is retried", async () => {
  const { api } = loadScrobble(() => 500);
  assert.equal(
    await api.simklScrobble("stop", "tt0182576", { season: 10, episode: 9 }, 100),
    false,
  );
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { loadModule } from "./helpers/hook-harness.ts";
import { sourceEffect } from "./helpers/source-effect.ts";

// The cache folder and the sweep itself are unit-tested in playback_cache.rs and temp_prune.rs; this checks the wiring between files.
const at = (p: string) => new URL(`../${p}`, import.meta.url);
const mpv = readFileSync(at("src-tauri/src/mpv.rs"), "utf8");
const lib = readFileSync(at("src-tauri/src/lib.rs"), "utf8");

test("mpv writes its demuxer cache to the playback cache folder", () => {
  assert.match(mpv, /playback_cache::cache_dir\(&base, args\.cache_dir\.as_deref\(\)\)/);
  assert.match(mpv, /set_property\("cache-on-disk", "yes"\)/);
});

test("the mpv cache is swept at startup and when a player opens its folder", () => {
  assert.match(lib, /temp_prune::sweep_mpv_cache\(base\.join\("mpv-cache"\)\)/);
  assert.match(mpv, /temp_prune::sweep_mpv_cache\(dir\.clone\(\)\)/);
});

test("the torrent cache keeps its own cap and retention", async () => {
  const { DEFAULT } = await import("../src/lib/settings/defaults.ts");
  assert.ok(DEFAULT.streamCacheRetentionHours > 0);
  assert.ok(DEFAULT.streamCacheMaxGb > 0);
  const calls: Array<[string, unknown]> = [];
  const engine = loadModule(
    "src/lib/torrent/local-engine.ts",
    {
      "@tauri-apps/api/core": {
        invoke: async (name: string, args: unknown) => void calls.push([name, args]),
      },
      "./full-download": { stopFullDownload() {} },
    },
    { window: { __TAURI_INTERNALS__: {} }, console: { warn() {} } },
  );
  await engine.torrentEngineSetOptions("D:/cache", 48, 20, false);
  assert.deepEqual(calls, [
    [
      "torrent_engine_set_options",
      { dir: "D:/cache", retentionHours: 48, maxGb: 20, restart: false },
    ],
  ]);
  // App.tsx is too large to load, so only its options effect runs with a recording engine call.
  const optionsEffect = sourceEffect("src/App.tsx", "torrentEngineSetOptions(");
  const applied = (streamCacheDir: string) => {
    const sent: unknown[][] = [];
    const settings = { streamCacheDir, streamCacheRetentionHours: 48, streamCacheMaxGb: 20 };
    const { deps } = optionsEffect({
      settings,
      torrentEngineSetOptions: async (...args: unknown[]) => void sent.push(args),
    });
    assert.deepEqual(deps, [streamCacheDir, 48, 20], "the effect reruns on each cache setting");
    return sent;
  };
  assert.deepEqual(applied("D:/cache"), [["D:/cache", 48, 20, false]]);
  assert.deepEqual(applied(""), [[null, 48, 20, false]], "an empty folder means the default");
});

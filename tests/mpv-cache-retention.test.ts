// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

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
  const app = readFileSync(at("src/App.tsx"), "utf8");
  assert.match(app, /torrentEngineSetOptions\(/);
  assert.match(app, /settings\.streamCacheMaxGb/);
});

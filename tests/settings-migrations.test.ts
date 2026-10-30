import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(playlists: Array<{ kind?: string }> = []) {
  const compiled = ts.transpileModule(readFileSync("src/lib/settings/migrations.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mocks: Record<string, unknown> = {
    "@/lib/iptv/playlists-store": { readPlaylists: () => playlists },
    "./defaults": {
      DEFAULT: { subFontSize: 40, subBorderSize: 2, subMarginY: 30, streamCacheMaxGb: 8 },
    },
  };
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected import: ${id}`);
    return mocks[id];
  }, exports);
  return exports as typeof import("../src/lib/settings/migrations");
}

test("a blob from before migrations runs every one and records the version", () => {
  const m = load([{ kind: "m3u" }]);
  const s: Record<string, unknown> = { streamSort: "harbor", subFontSize: 55 };
  m.runSettingsMigrations(s);
  assert.equal(s.streamSort, "addon");
  assert.equal(s.subFontSize, 40);
  assert.equal(s.showPlaylistsTab, true);
  assert.equal(s._schemaVersion, m.SETTINGS_SCHEMA_VERSION);
  assert.equal(s._streamSortAddonV1, true, "older builds still see the flags they check");
});

test("a migration already recorded by its legacy flag never runs again", () => {
  const m = load();
  const s: Record<string, unknown> = { _rememberLastStreamOnV1: true, rememberLastStream: false };
  m.runSettingsMigrations(s);
  assert.equal(s.rememberLastStream, false);
});

test("a versioned blob runs only migrations added after its version", () => {
  const m = load();
  const s: Record<string, unknown> = {};
  m.runSettingsMigrations(s);
  s.rememberLastStream = false;
  s.streamSort = "harbor";
  m.runSettingsMigrations(s);
  assert.equal(s.rememberLastStream, false, "an earlier migration does not reset a later choice");
  assert.equal(s.streamSort, "harbor");
});

test("the migration list is append-only by flag", () => {
  const flags = load().SETTINGS_MIGRATIONS.map((x) => x.flag);
  assert.equal(new Set(flags).size, flags.length);
  assert.deepEqual(flags.slice(0, 3), [
    "_playbackSourcePreferenceV1",
    "_playbackSourcePreferenceV2",
    "_animeRowsV1",
  ]);
});

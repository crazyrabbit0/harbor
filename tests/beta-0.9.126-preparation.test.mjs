import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadModule } from "./helpers/hook-harness.ts";

const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const notes = JSON.parse(read("src/lib/updater/bundled-release-notes.json"));

test("beta app and managed installer versions agree", () => {
  const version = JSON.parse(read("package.json")).version;
  for (const path of [
    "package.json",
    "src-tauri/tauri.conf.json",
    "installer/package.json",
    "installer/src-tauri/tauri.conf.json",
  ]) {
    assert.equal(JSON.parse(read(path)).version, version, path);
  }
  for (const [path, name] of [
    ["src-tauri", "harbor"],
    ["installer/src-tauri", "harbor-setup"],
  ]) {
    assert.ok(read(path + "/Cargo.toml").includes('version = "' + version + '"'));
    assert.ok(
      read(path + "/Cargo.lock").includes('name = "' + name + '"\nversion = "' + version + '"'),
    );
  }
});

test("beta 0.9.126 notes load offline without substituting stable notes", async () => {
  let requests = 0;
  const api = loadModule("src/lib/updater/release-notes.ts", {
    "@/lib/safe-fetch": {
      safeFetch: async () => {
        requests++;
        throw new Error("Offline");
      },
    },
    "@/lib/config/endpoints": { HARBOR_DATA_BASE: "https://example.invalid" },
    "./bundled-release-notes.json": { default: notes },
  });
  assert.deepEqual(await api.releaseNote("0.9.126"), notes.notes["0.9.126"]);
  assert.equal(requests, 0);
  assert.deepEqual(await Promise.all([api.releaseNote("0.9.22"), api.releaseNote("0.9.23")]), [
    null,
    null,
  ]);
  assert.equal(await api.releaseNote("0.9.21"), null);
  assert.equal(requests, 1, "a failed feed read is not retried on every lookup");
});

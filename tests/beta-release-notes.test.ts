// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import bundled from "../src/lib/updater/bundled-release-notes.json" with { type: "json" };
import { loadModule } from "./helpers/hook-harness.ts";

const BASE = "https://data.example.invalid";

function harness(feed: Record<string, unknown>) {
  const urls: string[] = [];
  const api = loadModule("src/lib/updater/release-notes.ts", {
    "@/lib/safe-fetch": {
      safeFetch: async (url: string) => {
        urls.push(url);
        return { ok: true, json: async () => ({ notes: feed }) };
      },
    },
    "@/lib/config/endpoints": { HARBOR_DATA_BASE: BASE },
    "./bundled-release-notes.json": { default: bundled },
  }) as typeof import("../src/lib/updater/release-notes");
  return { api, urls };
}

test("every bundled beta note is served offline without a network request", async () => {
  const h = harness({});
  const versions = Object.keys(bundled.notes);
  assert.ok(versions.includes("0.9.125"));
  for (const version of versions) {
    assert.deepEqual(
      await h.api.releaseNote(version),
      bundled.notes[version as keyof typeof bundled.notes],
    );
  }
  assert.equal(await h.api.releaseNote(null), null);
  assert.equal(await h.api.releaseNote(""), null);
  assert.deepEqual(h.urls, []);
});

test("bundled beta notes never substitute for another version", async () => {
  const h = harness({ "0.9.124": { title: "Previous beta" } });
  const [previous, missing] = await Promise.all([
    h.api.releaseNote("0.9.124"),
    h.api.releaseNote("0.9.1"),
  ]);
  assert.deepEqual(previous, { title: "Previous beta" });
  assert.equal(missing, null);
  assert.equal(await h.api.releaseNote("0.999.3"), null);
  assert.deepEqual(h.urls, [`${BASE}/release-notes.json`], "the feed is read once and cached");
});

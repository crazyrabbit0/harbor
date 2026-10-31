import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsWriter } from "../src/lib/settings/settings-writer.ts";
import type { Settings } from "../src/lib/settings/types.ts";

const base = {
  tmdbLanguage: "en-US",
  tmdbKey: "",
  tvdbKey: "",
  region: "US",
} as unknown as Settings;

test("module values change before the render the update triggers, and only when they change", () => {
  const calls: string[] = [];
  let moduleLang = "en-US";
  let moduleTvdb = "";
  const commits: Settings[] = [];
  const writer = createSettingsWriter(
    base,
    {
      tmdbLanguage: (lang) => {
        moduleLang = lang;
        calls.push(`lang:${lang}`);
      },
      providerKeys: (s) => {
        moduleTvdb = s.tvdbKey;
        calls.push(`keys:${s.tvdbKey}`);
      },
    },
    // A render reads the module values at commit time.
    (next) => {
      commits.push(next);
      calls.push(`render:${moduleLang}:${moduleTvdb}`);
    },
  );
  writer.set((s) => ({ ...s, region: "GR" }));
  writer.set((s) => ({ ...s, tmdbLanguage: "el-GR" }));
  writer.set((s) => ({ ...s, tvdbKey: "abc" }));
  writer.set((s) => s);
  assert.deepEqual(calls, [
    "render:en-US:",
    "lang:el-GR",
    "render:el-GR:",
    "keys:abc",
    "render:el-GR:abc",
  ]);
  assert.equal(commits.length, 3, "an unchanged result renders nothing");
  assert.equal(writer.get().tvdbKey, "abc");
});

test("consecutive updates before a render compose on the latest value", () => {
  const writer = createSettingsWriter(
    base,
    { tmdbLanguage: () => {}, providerKeys: () => {} },
    () => {},
  );
  writer.set((s) => ({ ...s, region: "GR" }));
  writer.set((s) => ({ ...s, tvdbKey: s.region }));
  assert.equal(writer.get().tvdbKey, "GR");
});

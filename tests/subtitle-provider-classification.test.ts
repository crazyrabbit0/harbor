// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as language from "../src/lib/subtitles/language.ts";
import * as providerClassification from "../src/lib/subtitles/provider-classification.ts";
import { classifyProviderSubtitleMetadata } from "../src/lib/subtitles/provider-classification.ts";
import { loadModule } from "./helpers/hook-harness.ts";
import { loadAddonProvider, subtitles } from "./helpers/subtitle-addon-harness.ts";

test("provider subtitle flags are preserved and explicit false beats filename hints", () => {
  assert.deepEqual(
    classifyProviderSubtitleMetadata(
      {
        hearing_impaired: 1,
        forced: "yes",
        foreign_only: true,
        machine_translated: true,
      },
      [],
    ),
    {
      hearingImpaired: true,
      forced: true,
      foreignOnly: true,
      machineTranslated: true,
    },
  );
  assert.deepEqual(
    classifyProviderSubtitleMetadata(
      { hearingImpaired: false, forced: false, machineTranslated: false },
      ["Movie.SDH.forced.AI-translated.srt"],
    ),
    {
      hearingImpaired: false,
      forced: false,
      foreignOnly: undefined,
      machineTranslated: false,
    },
  );
});

test("strong filename tags provide weak fallback metadata without inspecting subtitle prose", () => {
  assert.deepEqual(
    classifyProviderSubtitleMetadata({}, ["Show.S02E05.foreign-parts.SDH.machine-translated.srt"]),
    {
      hearingImpaired: true,
      forced: true,
      foreignOnly: true,
      machineTranslated: true,
    },
  );
  assert.equal(
    classifyProviderSubtitleMetadata({}, ["A naturally written fan translation.srt"])
      .machineTranslated,
    undefined,
  );
});

const flagged = {
  url: "https://subs.test/Movie.SDH.srt",
  lang: "eng",
  id: "1",
  forced: true,
  foreign_only: "yes",
  machine_translated: true,
};
const flags = (result: Record<string, unknown>) => ({
  hearingImpaired: result.hearingImpaired,
  forced: result.forced,
  foreignOnly: result.foreignOnly,
  machineTranslated: result.machineTranslated,
});
const expected = {
  hearingImpaired: true,
  forced: true,
  foreignOnly: true,
  machineTranslated: true,
};

test("generic addon and OpenSubtitles mappers attach the shared classification", async () => {
  const { searchAddons } = loadAddonProvider(() => subtitles([flagged]));
  const addon = {
    transportUrl: "https://addon.test/manifest.json",
    manifest: { id: "a", name: "A", resources: ["subtitles"], types: ["movie"] },
  };
  const [fromAddon] = await searchAddons([addon], { type: "movie", imdbId: "tt1" }, 1_000);
  assert.deepEqual(flags(fromAddon), expected);

  const { searchOpenSubtitlesV3 } = loadModule("src/lib/subtitles/providers/opensubtitles-v3.ts", {
    "@/lib/debug": { dinfo: () => {}, dwarn: () => {} },
    "@/lib/safe-fetch": { safeFetch: () => subtitles([flagged]) },
    "../language": language,
    "../provider-classification": providerClassification,
  });
  const [fromOpenSubtitles] = await searchOpenSubtitlesV3({ type: "movie", imdbId: "tt1" });
  assert.deepEqual(flags(fromOpenSubtitles), expected);
});

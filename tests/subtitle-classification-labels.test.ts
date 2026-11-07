// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ar from "../src/lib/i18n/locales/ar.ts";
import pt from "../src/lib/i18n/locales/pt.ts";
import ru from "../src/lib/i18n/locales/ru.ts";
import { subtitleClassificationLabels } from "../src/lib/subtitles/classification-labels.ts";
import * as language from "../src/lib/subtitles/language.ts";
import * as providerLabel from "../src/lib/subtitles/provider-label.ts";
import * as releaseLabel from "../src/lib/subtitles/release-label.ts";
import * as releaseMatch from "../src/lib/subtitles/release-match.ts";
import * as trackLabel from "../src/lib/subtitles/track-label.ts";
import * as subFormat from "../src/lib/player/sub-format.ts";
import * as menuUtils from "../src/components/player/subtitle-menu/utils.ts";
import { hookHarness } from "./helpers/hook-harness.ts";
import { all } from "./helpers/subtitle-addon-harness.ts";

const allFlags = {
  hearingImpaired: true,
  forced: true,
  foreignOnly: true,
  machineTranslated: true,
};

test("subtitle classification labels provide full and compact translated presentations", () => {
  const translate = (key: string) => `[${key}]`;

  assert.deepEqual(subtitleClassificationLabels(allFlags, translate), [
    { kind: "hearingImpaired", label: "[Hearing impaired]" },
    { kind: "forced", label: "[Forced]" },
    { kind: "foreignOnly", label: "[Foreign-only]" },
    { kind: "machineTranslated", label: "[Machine-translated]" },
  ]);
  assert.deepEqual(subtitleClassificationLabels(allFlags, translate, "compact"), [
    { kind: "hearingImpaired", label: "[HI/SDH]" },
    { kind: "forced", label: "[Forced]" },
    { kind: "foreignOnly", label: "[Foreign-only]" },
    { kind: "machineTranslated", label: "[MT]" },
  ]);
  assert.deepEqual(
    subtitleClassificationLabels(
      { hearingImpaired: false, forced: false, foreignOnly: false, machineTranslated: false },
      translate,
    ),
    [],
  );
});

test("supported catalogs localize every subtitle classification label", () => {
  const localizedKeys = [
    "Hearing impaired",
    "Forced",
    "Foreign-only",
    "Machine-translated",
    "Audio verified",
  ];
  const compactKeys = ["HI/SDH", "MT"];

  for (const [locale, catalog] of [
    ["ar", ar],
    ["pt", pt],
    ["ru", ru],
  ] as const) {
    for (const key of localizedKeys) {
      assert.equal(typeof catalog[key], "string", `${locale} is missing ${key}`);
      assert.notEqual(catalog[key], key, `${locale} does not localize ${key}`);
    }
    for (const key of compactKeys) {
      assert.equal(typeof catalog[key], "string", `${locale} is missing compact label ${key}`);
      assert.ok(catalog[key].trim().length > 0, `${locale} has an empty compact label ${key}`);
    }
  }
});

const element = (type: unknown, props: Record<string, any>) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const icons = new Proxy({}, { get: (_target, name) => String(name) });
const noop = () => {};
const bracket = (key: string) => `[${key}]`;
const i18n = { useT: () => bracket };
const labels = { subtitleClassificationLabels };
const flagged = { hearingImpaired: true, machineTranslated: true };
const texts = (tree: unknown) =>
  all(tree)
    .map((node) => node.props.children)
    .filter((child): child is string => typeof child === "string");
const contextMenu = { useContextMenu: () => ({ open: noop, openAt: noop }) };

test("desktop search results show the full classification labels", () => {
  const h = hookHarness(
    "src/components/player/subtitle-menu/search-results.tsx",
    "ResultRow",
    {
      "lucide-react": icons,
      "@/components/flag": { Flag: "Flag" },
      "@/lib/context-menu": contextMenu,
      "@/lib/subtitles/save-to-disk": { saveSubtitleToDisk: noop },
      "@/lib/subtitles/added-subs": { markAddedSub: noop, useAddedSubs: () => new Set() },
      "@/lib/subtitles/limit-signal": { wasLimitReached: () => false },
      "@/lib/subtitles/pending-subs": { wasPendingSub: () => false },
      "@/lib/subtitles/translation-jobs": {
        useSubtitleTranslationStatus: () => null,
        useTranslationJob: () => false,
      },
      "@/lib/subtitles/release-match": releaseMatch,
      "@/lib/subtitles/provider-label": providerLabel,
      "@/lib/i18n": i18n,
      "@/lib/subtitles/match-explanation": {
        subtitleSearchMatchDetails: () => ({ compatibilityPercent: 0, reasons: [] }),
      },
      "@/lib/subtitles/classification-labels": labels,
      "react/jsx-runtime": jsx,
    },
    { window: { setTimeout: () => 0, clearTimeout: noop } },
    ["ResultRow"],
  );
  const result = {
    id: "1",
    url: "https://subs.test/a.srt",
    lang: "en",
    source: "addon",
    ...flagged,
  };
  const shown = texts(h.render({ result, lang: "en", onAdd: noop }));
  assert.ok(shown.includes("[Hearing impaired]"));
  assert.ok(shown.includes("[Machine-translated]"));
  assert.ok(!shown.includes("[MT]"), "the desktop menu keeps the full presentation");
});

test("desktop track rows add the audio-verified tag after the classification labels", () => {
  const h = hookHarness("src/components/player/subtitle-menu/variant-row.tsx", "VariantRow", {
    "lucide-react": icons,
    "@/components/hover-tooltip": { HoverTooltip: "HoverTooltip" },
    "@/lib/context-menu": contextMenu,
    "@/lib/player/sub-format": subFormat,
    "@/lib/subtitles/release-label": releaseLabel,
    "@/lib/subtitles/track-label": trackLabel,
    "@/lib/subtitles/save-to-disk": { saveSubtitleToDisk: noop },
    "@/lib/player/imported-subs": { useImportedSubs: () => new Set() },
    "@/lib/i18n": i18n,
    "@/lib/subtitles/release-match": releaseMatch,
    "@/lib/subtitles/classification-labels": labels,
    "./overflow-marquee": { OverflowMarquee: "OverflowMarquee" },
    "react/jsx-runtime": jsx,
  });
  const track = { id: 1, lang: "en", external: true, timingStatus: "aligned", ...flagged };
  const shown = texts(h.render({ track, rank: 1, selected: false, onPick: noop }));
  const tags = ["[Hearing impaired]", "[Machine-translated]", "[Audio verified]"];
  assert.deepEqual(
    shown.filter((text) => tags.includes(text)),
    tags,
  );
});

test("the pre-play picker shows the compact classification labels", () => {
  const h = hookHarness(
    "src/views/play-picker/subtitle-select-step.tsx",
    "TrackRow",
    {
      "lucide-react": icons,
      "@/components/icons/play-filled": { Play: "Play" },
      "@/components/flag": { Flag: "Flag" },
      "@/lib/context-menu": contextMenu,
      "@/lib/subtitles/language": language,
      "@/lib/subtitles/provider-label": providerLabel,
      "@/lib/subtitles/save-to-disk": { saveSubtitleToDisk: noop },
      "@/lib/i18n": i18n,
      "@/lib/subtitles/classification-labels": labels,
      "@/lib/providers/kitsu": { parseKitsuId: () => null },
      "@/lib/streams/anime-identity-core": { splitFranchiseDisplaySeason: () => null },
      "@/lib/use-window-fullscreen": { useWindowFullscreen: () => false },
      "./backdrop-layer": { BackdropLayer: "BackdropLayer" },
      "./hooks/use-subtitle-choices": { useSubtitleChoices: noop },
      "react/jsx-runtime": jsx,
    },
    {},
    ["TrackRow"],
  );
  const result = { id: "1", url: "u", lang: "en", source: "addon", ...flagged };
  const shown = texts(h.render({ result, selected: false, isBest: false, onPick: noop }));
  assert.ok(shown.includes("[HI/SDH]"));
  assert.ok(shown.includes("[MT]"));
  assert.ok(!shown.includes("[Hearing impaired]"));
});

test("Big Picture pre-play and player rows use the compact classification labels", () => {
  const step = hookHarness(
    "src/views/big-picture/bp-subtitle-step.tsx",
    "BpSubtitleStep",
    {
      "lucide-react": icons,
      "@/components/icons/play-filled": { Play: "Play" },
      "@/components/flag": { Flag: "Flag" },
      "@/lib/sfx": { SFX: {} },
      "@/lib/subtitles/language": language,
      "@/lib/subtitles/provider-label": providerLabel,
      "@/lib/subtitles/classification-labels": labels,
      "@/views/play-picker/hooks/use-subtitle-choices": { useSubtitleChoices: noop },
      "./bp-back": { pushBpBack: noop },
      "./bp-i18n": { useBpT: () => bracket },
      "./use-bp-focus": { currentBpFocus: noop, setBpFocus: noop },
      "react/jsx-runtime": jsx,
    },
    {},
    ["trackDetail"],
  );
  assert.equal(
    step.exports.trackDetail({ source: "addon", format: "srt", ...flagged }, bracket),
    "addon · SRT · [HI/SDH] · [MT]",
  );

  const parts = hookHarness("src/views/big-picture/player/bp-subtitle-parts.tsx", "tagsOf", {
    "@/components/player/subtitle-menu/utils": menuUtils,
    "@/lib/subtitles/provider-label": providerLabel,
    "@/lib/subtitles/track-label": trackLabel,
    "@/lib/sfx": { SFX: {} },
    "@/lib/subtitles/classification-labels": labels,
    "react/jsx-runtime": jsx,
  }).exports;
  assert.deepEqual(parts.tagsOf(allFlags, bracket), [
    "[HI/SDH]",
    "[Forced]",
    "[Foreign-only]",
    "[MT]",
  ]);
});

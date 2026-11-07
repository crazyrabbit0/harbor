// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { MOVIE_GENRES, TV_GENRES } from "../src/lib/feed/tags.ts";
import { LANGUAGES as UI_LANGUAGES } from "../src/lib/i18n/languages.ts";
import en from "../src/lib/i18n/locales/en.ts";
import { hookHarness } from "./helpers/hook-harness.ts";
import arCoverage from "../src/lib/i18n/locales/ar/coverage.ts";
import deCoverage from "../src/lib/i18n/locales/de/coverage.ts";
import esCoverage from "../src/lib/i18n/locales/es/coverage.ts";
import frCoverage from "../src/lib/i18n/locales/fr/coverage.ts";
import hiCoverage from "../src/lib/i18n/locales/hi/coverage.ts";
import idCoverage from "../src/lib/i18n/locales/id/coverage.ts";
import itCoverage from "../src/lib/i18n/locales/it/coverage.ts";
import jaCoverage from "../src/lib/i18n/locales/ja/coverage.ts";
import koCoverage from "../src/lib/i18n/locales/ko/coverage.ts";
import plCoverage from "../src/lib/i18n/locales/pl/coverage.ts";
import ptCoverage from "../src/lib/i18n/locales/pt/coverage.ts";
import ruCoverage from "../src/lib/i18n/locales/ru/coverage.ts";
import trCoverage from "../src/lib/i18n/locales/tr/coverage.ts";
import viCoverage from "../src/lib/i18n/locales/vi/coverage.ts";
import zhCoverage from "../src/lib/i18n/locales/zh/coverage.ts";

const ROOT = new URL("../", import.meta.url);
const LANGS = [
  "ar",
  "de",
  "es",
  "fr",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "pl",
  "pt",
  "ru",
  "tr",
  "vi",
  "zh",
] as const;
// Literal t() keys can only be found by scanning source; the catalogs they must reach are imported.
const CALL = /\b(?:t|tr)\(\s*(["'])((?:\\.|(?!\1)[^\\])*?)\1/g;
const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r" };
const COVERAGE = {
  ar: arCoverage,
  de: deCoverage,
  es: esCoverage,
  fr: frCoverage,
  hi: hiCoverage,
  id: idCoverage,
  it: itCoverage,
  ja: jaCoverage,
  ko: koCoverage,
  pl: plCoverage,
  pt: ptCoverage,
  ru: ruCoverage,
  tr: trCoverage,
  vi: viCoverage,
  zh: zhCoverage,
};

function walk(dir: URL, out: URL[] = []): URL[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = new URL(e.isDirectory() ? `${e.name}/` : e.name, dir);
    if (e.isDirectory()) {
      if (p.pathname.includes("/i18n/")) continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function uiStrings(): Set<string> {
  const out = new Set<string>();
  for (const f of walk(new URL("src/", ROOT))) {
    const src = readFileSync(f, "utf8");
    let m: RegExpExecArray | null;
    CALL.lastIndex = 0;
    while ((m = CALL.exec(src))) {
      const k = m[2].replace(/\\(.)/g, (_, c: string) => ESCAPES[c] ?? c);
      if (k && k.length <= 300) out.add(k);
    }
  }
  // The English quiz renders each question and option through t(), so they are UI keys too.
  for (const { q, options } of questionBank()) for (const key of [q, ...options]) out.add(key);
  return out;
}

function questionBank(): { q: string; options: string[] }[] {
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const modal = hookHarness(
    "src/components/age-gate-modal.tsx",
    "AgeGateModal",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
      "react-dom": { createPortal: (node: unknown) => node },
      "@/lib/i18n": { useT: () => (k: string) => k, useUiLanguage: () => "en" },
    },
    {},
    ["QUESTION_BANK"],
  );
  const bank = modal.exports.QUESTION_BANK;
  assert.ok(Array.isArray(bank) && bank.length > 10, "age gate question bank is missing");
  return bank;
}

const CATALOGS: Record<string, Record<string, string>> = {};
for (const lang of LANGS)
  CATALOGS[lang] = (await import(`../src/lib/i18n/locales/${lang}.ts`)).default;

function localeKeys(lang: string): Set<string> {
  return new Set(Object.keys(CATALOGS[lang]));
}

const strings = uiStrings();

test("every translated language covers every UI string", () => {
  assert.ok(strings.size > 4000, `only found ${strings.size} UI strings, the scanner is broken`);
  for (const lang of LANGS) {
    const have = localeKeys(lang);
    const missing = [...strings].filter((k) => !have.has(k));
    assert.equal(
      missing.length,
      0,
      `${lang} is missing ${missing.length}: ${missing
        .slice(0, 6)
        .map((s) => JSON.stringify(s))
        .join(", ")}`,
    );
  }
});

test("genre names reach the catalogs even though nothing passes them as a literal", () => {
  const names = new Set([...Object.keys(MOVIE_GENRES), ...Object.keys(TV_GENRES)]);
  assert.ok(names.size > 15, `only found ${names.size} genres`);
  for (const lang of LANGS) {
    const have = localeKeys(lang);
    const missing = [...names].filter((g) => !have.has(g));
    assert.deepEqual(missing, [], `${lang} is missing ${missing.length} genre names`);
  }
});

test("dynamic display language labels reach every catalog", () => {
  const labels = [...UI_LANGUAGES.map(({ label }) => label), "Right to left"];
  for (const lang of LANGS) {
    const have = localeKeys(lang);
    const missing = labels.filter((label) => !have.has(label));
    assert.deepEqual(missing, [], `${lang} is missing display language labels`);
  }
});

test("a translation never drops or invents a placeholder", () => {
  const ph = (s: string) => (s.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) ?? []).sort().join(",");
  for (const lang of LANGS) {
    let checked = 0;
    for (const [k, v] of Object.entries(COVERAGE[lang])) {
      assert.equal(ph(v), ph(en[k] ?? k), `${lang}: placeholders differ for ${JSON.stringify(k)}`);
      assert.ok(v.trim().length > 0, `${lang}: empty translation for ${JSON.stringify(k)}`);
      checked++;
    }
    assert.ok(checked > 400, `${lang}/coverage.ts only parsed ${checked} entries`);
  }
});

test("every locale barrel includes coverage and partitioned catalog layers", () => {
  for (const lang of LANGS) {
    const catalog = CATALOGS[lang];
    const layer = Object.entries(COVERAGE[lang]);
    // Later layers may override a few entries, but most coverage translations must reach the catalog.
    const kept = layer.filter(([k, v]) => catalog[k] === v).length;
    assert.ok(kept > layer.length / 2, `${lang}.ts does not spread coverage (${kept})`);
    assert.ok(
      Object.keys(catalog).length > layer.length * 5,
      `${lang}.ts does not partition its catalog`,
    );
  }
});

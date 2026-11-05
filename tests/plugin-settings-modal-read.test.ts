import { test } from "node:test";
import assert from "node:assert/strict";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children), ...all((n as N).props?.actions)]
      : [];
const text = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text((n as N).props?.children)
        : "";

function translate() {
  const ui = { lang: "en", region: "US" };
  const h = hookHarness("src/lib/i18n/translate.ts", "useT", {
    "./locales/en": { default: { Save: "Save" } },
    "./store": {
      getUiLanguage: () => ui.lang,
      getUiRegion: () => ui.region,
      useUiLanguage: () => ui.lang,
      useUiRegion: () => ui.region,
    },
    "./languages": { isRtl: () => false, LANGUAGES: [] },
    "./regional-labels": {
      associationFootballEnglishLabel: (_lang: string, region: string) => `Football-${region}`,
    },
  });
  return { h, ui };
}

const tFor = (lang: string) => (key: string, vars?: Record<string, string>) =>
  `${lang}:${key}${vars?.error ? `(${vars.error})` : ""}`;

function modal(adapter: Record<string, any>) {
  const ui = { t: tFor("en") };
  const ModalButton = "ModalButton";
  const h = hookHarness(
    "src/views/settings/plugins-panel/plugin-settings-modal.tsx",
    "PluginSettingsModal",
    {
      "../icons": { Loader2: "Loader2" },
      "@/components/dropdown": { Dropdown: "Dropdown" },
      "@/lib/i18n": { useT: () => ui.t },
      "../kit": {
        ModalButton,
        SettingGroup: "SettingGroup",
        SettingRow: "SettingRow",
        SettingsModal: "SettingsModal",
      },
      "../shared": { ToggleRow: "ToggleRow" },
      "./copy": { errorText: (say: (k: string) => string, e: Error) => say(e.message) },
      "react/jsx-runtime": jsx,
    },
  );
  const props = { plugin: { id: "p1", name: "Plugin" }, adapter, onClose: () => {} };
  const render = () => all(h.render(props));
  const buttons = (tree: N[]) => tree.filter((n) => n.type === ModalButton).map((n) => text(n));
  return { ui, render, buttons };
}

test("useT's function changes only with the language, region or catalog", () => {
  const { h, ui } = translate();
  const first = h.render();
  assert.equal(h.render(), first, "a plain re-render keeps the same function");
  ui.region = "GB";
  const regional = h.render();
  assert.notEqual(regional, first, "a region change hands back a new function");
  assert.equal(regional("Soccer"), "Football-GB");
  ui.lang = "fr";
  const french = h.render();
  assert.notEqual(french, regional, "a language change hands back a new function");
  assert.equal(h.render(), french);
  h.exports.registerUiCatalog("fr", { Save: "Enregistrer" });
  const loaded = h.render();
  assert.notEqual(loaded, french, "a newly loaded catalog hands back a new function");
  assert.equal(loaded("Save"), "Enregistrer");
});

test("reading a plugin's settings does not depend on the translation function", async () => {
  let reads = 0;
  const m = modal({
    settingsFields: async () => (reads++, [{ type: "text", key: "k", label: "K" }]),
    settingsValues: () => ({}),
  });
  m.render();
  await flushPromises();
  m.ui.t = tFor("fr");
  m.render();
  m.ui.t = tFor("de");
  m.render();
  await flushPromises();
  assert.equal(reads, 1, "a new t must not restart the read");
});

test("a failure is still reported in the language on screen", async () => {
  let fail: (e: Error) => void = () => {};
  const m = modal({ settingsFields: () => new Promise((_ok, no) => (fail = no)) });
  m.render();
  m.ui.t = tFor("fr");
  m.render();
  fail(new Error("boom"));
  await flushPromises();
  const error = m.render().find((n) => n.type === "p");
  assert.equal(
    text(error),
    "fr:This plugin's settings form failed to load: {error}(fr:boom)",
    "the failure message uses the t on screen, not the one from when it opened",
  );
});

test("the form's own buttons are still rendered with the live translation", () => {
  const m = modal({ settingsFields: () => new Promise(() => {}) });
  const before = m.render();
  assert.deepEqual(m.buttons(before), ["en:Cancel", "en:Save"]);
  m.ui.t = tFor("fr");
  const after = m.render();
  assert.deepEqual(m.buttons(after), ["fr:Cancel", "fr:Save"], "the action buttons re-read t");
  assert.ok(
    after.some((n) => n.type === "span" && text(n) === "fr:Loading plugins..."),
    "and so does the loading line",
  );
});

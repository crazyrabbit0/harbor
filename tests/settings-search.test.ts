// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { matchesSettingsSearch } from "../src/views/settings/search-match.ts";
import { anchorOf, settingsNavHarness } from "./helpers/settings-nav-harness.ts";

test("settings search matches translated labels without losing source-language matches", () => {
  const translations = new Map([
    ["Languages", "اللغات"],
    ["Account", "Conta"],
  ]);
  const translate = (value: string) => translations.get(value) ?? value;

  assert.equal(matchesSettingsSearch("اللغات", ["Languages"], translate), true);
  assert.equal(matchesSettingsSearch("conta", ["Account"], translate), true);
  assert.equal(matchesSettingsSearch("languages", ["Languages"], translate), true);
  assert.equal(matchesSettingsSearch("player", ["Languages"], translate), false);
});

test("settings search indexes open settings under Global", () => {
  const nav = settingsNavHarness();
  const entries = nav.options.filter((option) => option.label === "Open settings");
  assert.equal(entries.length, 1, "exactly one Open settings search entry");
  assert.deepEqual(entries[0], {
    label: "Open settings",
    section: "hotkeys",
    tab: "keys",
    anchorTitle: "Global",
    keywords: ["settings shortcut", "settings hotkey", "ctrl s", "preferences"],
  });
  for (const query of ["settings hotkey", "ctrl s"]) {
    const found = nav.search(query).optionMatches ?? [];
    assert.ok(
      found.some((option) => option.label === "Open settings"),
      query,
    );
  }
  assert.deepEqual(nav.submit("settings shortcut"), [["hotkeys", anchorOf("Global"), "keys"]]);

  const at = (label: string) => nav.options.findIndex((option) => option.label === label);
  assert.ok(at("Focus search") < at("Open settings"));
  assert.ok(at("Open settings") < at("Increase interface scale"));
});

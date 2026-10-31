import "./_localstorage-stub.ts";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  canRunThemeJs,
  grantThemeJsConsent,
  needsThemeJsConsent,
  revokeThemeJsConsent,
  studioThemeOrigin,
  subscribeThemeJsConsent,
  THEME_JS_CONSENT_KEY,
} from "../src/lib/theme-js-consent.ts";
import type { CustomTheme } from "../src/lib/custom-themes.ts";

let seq = 0;
function theme(patch: Partial<CustomTheme>): CustomTheme {
  seq += 1;
  return {
    id: `user:t-${seq}`,
    name: "T",
    blurb: "",
    swatch: ["#000000", "#111111", "#222222"],
    tokens: {},
    js: "console.log('hi')",
    ...patch,
  } as CustomTheme;
}

test("community theme script stays off until the user allows it", () => {
  const t = theme({ origin: "community" });
  assert.equal(needsThemeJsConsent(t), true);
  assert.equal(canRunThemeJs(t), false);
});

test("imported theme script stays off until the user allows it", () => {
  const t = theme({ origin: "imported" });
  assert.equal(needsThemeJsConsent(t), true);
  assert.equal(canRunThemeJs(t), false);
});

test("a theme the user made in Theme Studio runs its script", () => {
  const t = theme({ origin: "local" });
  assert.equal(needsThemeJsConsent(t), false);
  assert.equal(canRunThemeJs(t), true);
});

test("a legacy theme without an origin counts as foreign when it has a script", () => {
  const t = theme({});
  assert.equal(needsThemeJsConsent(t), true);
  assert.equal(canRunThemeJs(t), false);
});

test("a foreign theme without a script needs no consent", () => {
  const t = theme({ origin: "imported", js: "   " });
  assert.equal(needsThemeJsConsent(t), false);
});

test("built-in themes never ask for consent", () => {
  const t = theme({ id: "cool-grey" });
  assert.equal(needsThemeJsConsent(t), false);
  assert.equal(canRunThemeJs(t), true);
});

test("granting consent lets the script run and persists by theme id", () => {
  const t = theme({ origin: "community" });
  grantThemeJsConsent(t);
  assert.equal(canRunThemeJs(t), true);
  assert.equal(needsThemeJsConsent(t), false);
  const stored = JSON.parse(localStorage.getItem(THEME_JS_CONSENT_KEY) ?? "{}");
  assert.equal(typeof stored[t.id], "string");
});

test("a changed script asks for consent again", () => {
  const t = theme({ origin: "imported" });
  grantThemeJsConsent(t);
  const updated = { ...t, js: "console.log('changed')" };
  assert.equal(canRunThemeJs(updated), false);
  assert.equal(needsThemeJsConsent(updated), true);
});

test("revoking consent turns the script off again", () => {
  const t = theme({ origin: "community" });
  grantThemeJsConsent(t);
  revokeThemeJsConsent(t.id);
  assert.equal(canRunThemeJs(t), false);
});

test("subscribers hear grants and revokes", () => {
  const t = theme({ origin: "community" });
  let calls = 0;
  const off = subscribeThemeJsConsent(() => calls++);
  grantThemeJsConsent(t);
  revokeThemeJsConsent(t.id);
  off();
  grantThemeJsConsent(t);
  assert.equal(calls, 2);
});

test("Theme Studio keeps a foreign origin while the seed script is unchanged", () => {
  const seed = theme({ origin: "community", js: "a()" });
  assert.equal(studioThemeOrigin([seed], "a()"), "community");
  assert.equal(studioThemeOrigin([seed], "b()"), "local");
  assert.equal(studioThemeOrigin([seed], ""), "local");
  assert.equal(studioThemeOrigin([undefined], "a()"), "local");
  assert.equal(studioThemeOrigin([theme({ origin: "local", js: "a()" })], "a()"), "local");
  assert.equal(studioThemeOrigin([theme({ js: "a()" })], "a()"), "imported");
  assert.equal(
    studioThemeOrigin([seed, theme({ origin: "local", js: "c()" })], "a()"),
    "community",
  );
});

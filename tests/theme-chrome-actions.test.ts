// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { load } from "cheerio";
import {
  harborActionFor,
  isHarborNavView,
  type ActionSource,
} from "../src/lib/harbor-chrome-actions.ts";
import { getThemeById } from "../src/lib/theme.ts";
import {
  buildChrome,
  DEFAULT_CHROME,
} from "../src/views/settings/theme-panel/theme-studio/chrome-config.ts";
import {
  FULL_EXAMPLES,
  RECIPES,
} from "../src/views/settings/theme-panel/theme-studio/cheat-sheet-recipes.ts";

type CheerioRoot = ReturnType<typeof load>;
type CheerioNode = ReturnType<CheerioRoot>;

function source(node: CheerioNode): ActionSource {
  return {
    getAttribute: (name) => node.attr(name) ?? null,
    closest: (selector) => {
      const hit = node.closest(selector);
      return hit.length > 0 ? source(hit.first()) : null;
    },
  };
}

function buttonsOf(html: string) {
  const $ = load(`<div id="harbor-custom-overlay">${html}</div>`);
  return $("button")
    .toArray()
    .map((el) => ({ $, node: $(el) }));
}

const feishin = getThemeById("feishin");

test("Feishin chrome has no inline handlers and every button is wired declaratively", () => {
  assert.ok(feishin?.html, "Feishin preset html");
  const html = feishin.html;
  assert.doesNotMatch(html, /\sonclick\s*=/i);
  const buttons = buttonsOf(html);
  assert.ok(buttons.length >= 16, `expected the full Feishin button set, got ${buttons.length}`);
  for (const { $, node } of buttons) {
    const call = harborActionFor(source(node));
    assert.ok(call, `button without a valid data-harbor-action: ${$.html(node)}`);
  }
});

test("Feishin nav buttons navigate to the view their data-harbor-nav names", () => {
  assert.ok(feishin?.html, "Feishin preset html");
  const navButtons = buttonsOf(feishin.html).filter(({ node }) => node.attr("data-harbor-nav"));
  assert.ok(navButtons.length >= 11);
  for (const { node } of navButtons) {
    assert.deepEqual(harborActionFor(source(node)), {
      action: "navigate",
      view: node.attr("data-harbor-nav"),
    });
  }
});

test("Theme Studio builder chrome wires every nav item without inline handlers", () => {
  for (const position of ["sidebar", "topbar"] as const) {
    const { html } = buildChrome({ ...DEFAULT_CHROME, position });
    assert.doesNotMatch(html, /\sonclick\s*=/i);
    const nav = buttonsOf(html).filter(({ node }) => node.attr("data-harbor-nav"));
    assert.equal(nav.length, DEFAULT_CHROME.items.length);
    for (const { node } of nav) {
      assert.deepEqual(harborActionFor(source(node)), {
        action: "navigate",
        view: node.attr("data-harbor-nav"),
      });
    }
  }
});

test("cheat-sheet code samples teach data attributes, never inline handlers", () => {
  const samples = [...RECIPES.map((r) => r.code), ...FULL_EXAMPLES.map((e) => e.code)];
  for (const code of samples) assert.doesNotMatch(code, /\sonclick\s*=/i);
  const navSamples = samples.filter((code) => code.includes("data-harbor-action"));
  assert.ok(navSamples.length >= 2, "custom chrome samples use data-harbor-action");
});

function element(attrs: Record<string, string>, parent: ActionSource | null = null): ActionSource {
  const self: ActionSource = {
    getAttribute: (name) => attrs[name] ?? null,
    closest: (selector) =>
      selector === "[data-harbor-action]" && "data-harbor-action" in attrs
        ? self
        : (parent?.closest(selector) ?? null),
  };
  return self;
}

test("harborActionFor maps allowlisted actions", () => {
  assert.deepEqual(
    harborActionFor(element({ "data-harbor-action": "navigate", "data-harbor-arg": "movies" })),
    { action: "navigate", view: "movies" },
  );
  assert.deepEqual(harborActionFor(element({ "data-harbor-action": "back" })), { action: "back" });
  assert.deepEqual(harborActionFor(element({ "data-harbor-action": "search" })), {
    action: "search",
  });
  assert.deepEqual(harborActionFor(element({ "data-harbor-action": "settings" })), {
    action: "settings",
  });
});

test("harborActionFor resolves the nearest action ancestor of a clicked child", () => {
  const button = element({ "data-harbor-action": "navigate", "data-harbor-arg": "home" });
  assert.deepEqual(harborActionFor(element({}, button)), { action: "navigate", view: "home" });
});

test("harborActionFor rejects unknown actions and unknown or missing views", () => {
  assert.equal(
    harborActionFor(element({ "data-harbor-action": "eval", "data-harbor-arg": "x" })),
    null,
  );
  assert.equal(harborActionFor(element({ "data-harbor-action": "navigate" })), null);
  assert.equal(
    harborActionFor(element({ "data-harbor-action": "navigate", "data-harbor-arg": "nonsense" })),
    null,
  );
  assert.equal(
    harborActionFor(
      element({ "data-harbor-action": "navigate", "data-harbor-arg": "constructor" }),
    ),
    null,
  );
  assert.equal(harborActionFor(element({})), null);
  assert.equal(harborActionFor(null), null);
});

test("isHarborNavView accepts real views only", () => {
  assert.equal(isHarborNavView("home"), true);
  assert.equal(isHarborNavView("settings"), true);
  assert.equal(isHarborNavView("toString"), false);
  assert.equal(isHarborNavView(""), false);
});

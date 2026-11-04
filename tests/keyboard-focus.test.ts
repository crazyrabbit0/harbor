// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { shouldHandleGlobalKeyboardEvent } from "../src/lib/hotkeys.ts";
import * as poster from "../src/lib/poster-backdrop-expansion.ts";
import { nextTabStop } from "../src/lib/tab-cycle.ts";
import { hookHarness, loadModule } from "./helpers/hook-harness.ts";
import { tvDom } from "./helpers/tv-dom.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function nav(html: string, options: { rtl?: boolean; onBack?: () => boolean } = {}) {
  const dom = tvDom(html, options);
  const hotkeys = loadModule(
    "src/lib/hotkeys.ts",
    { "./stored-settings": { storedSettings: () => ({}) } },
    { document: dom.document },
  );
  const backs: string[] = [];
  const h = hookHarness(
    "src/lib/keyboard-navigation.ts",
    "useKeyboardNavigation",
    {
      "@/lib/hotkeys": hotkeys,
      "@/lib/sfx": { SFX: { close() {}, open() {}, navigate() {} } },
      "@/lib/modal-overlay": { isModalOverlayOpen: () => false, modalOverlayClose: async () => {} },
      "@/lib/poster-backdrop-expansion": poster,
      "./keyboard-navigation/geometry": { navOwnsFocus: () => false },
    },
    dom.globals,
  );
  const onBack = options.onBack ?? (() => (backs.push("back"), true));
  return { ...dom, h, api: h.exports, backs, mount: () => h.render({ onBack }) };
}

const active = (dom: { document: any }) => dom.document.activeElement.getAttribute("id");

test("TV focus waits for navigation intent before applying page defaults", () => {
  const n = nav(
    '<button id="a" data-rect="0,0,10,10"></button><button id="b" data-tv-initial-focus data-rect="0,50,10,10"></button>',
  );
  n.mount();
  n.api.focusTvPageDefault();
  assert.equal(n.document.activeElement, n.document.body, "no default focus before any TV input");
  n.api.moveFocus("down");
  n.get("#a").focus();
  n.api.focusTvPageDefault();
  assert.equal(active(n), "b");
});

test("TV focus styling uses one theme-aware ring without hard-coded white layers", () => {
  const n = nav('<button id="a" data-rect="0,0,10,10"></button>');
  n.mount();
  n.api.moveFocus("down");
  assert.equal(n.get("#a").getAttribute("data-tv-focused"), "true");
  const css: string = (n.document.querySelector("[data-tv-focus-styles]") as any).textContent;
  assert.match(css, /inset 0 0 0 2px var\(--color-accent\)/);
  assert.doesNotMatch(css, /#ffffff|#fff\b/i);
  assert.doesNotMatch(css, /0 0 0 8px|0 0 0 9px/);
});

type KeyboardEventOptions = {
  isComposing?: boolean;
  key?: string;
  repeat?: boolean;
  target?: {
    nodeType: number;
    tagName: string;
    isContentEditable?: boolean;
    getAttribute(name: string): string | null;
  };
};

function keyboardEvent(options: KeyboardEventOptions = {}) {
  const event = new Event("keydown") as KeyboardEvent;
  Object.defineProperties(event, {
    isComposing: { value: options.isComposing ?? false },
    key: { value: options.key ?? "x" },
    repeat: { value: options.repeat ?? false },
    target: { value: options.target ?? null },
  });
  return event;
}

function target(
  tagName: string,
  attributes: Record<string, string> = {},
  isContentEditable = false,
) {
  return {
    nodeType: 1,
    tagName,
    isContentEditable,
    getAttribute(name: string) {
      return attributes[name] ?? null;
    },
  };
}

function withDocumentFocus(hasFocus: boolean, run: () => void) {
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { hasFocus: () => hasFocus, activeElement: null },
  });
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  }
}

test("global keyboard shortcuts ignore text entry, IME, and unfocused windows", () => {
  withDocumentFocus(true, () => {
    assert.equal(
      shouldHandleGlobalKeyboardEvent(keyboardEvent({ target: target("INPUT") })),
      false,
    );
    assert.equal(
      shouldHandleGlobalKeyboardEvent(keyboardEvent({ target: target("TEXTAREA") })),
      false,
    );
    assert.equal(
      shouldHandleGlobalKeyboardEvent(keyboardEvent({ target: target("SELECT") })),
      false,
    );
    assert.equal(
      shouldHandleGlobalKeyboardEvent(keyboardEvent({ target: target("DIV", {}, true) })),
      false,
    );
    assert.equal(
      shouldHandleGlobalKeyboardEvent(
        keyboardEvent({ target: target("DIV", { role: "textbox" }) }),
      ),
      false,
    );
    assert.equal(shouldHandleGlobalKeyboardEvent(keyboardEvent({ isComposing: true })), false);
    assert.equal(shouldHandleGlobalKeyboardEvent(keyboardEvent({ key: "Process" })), false);
    assert.equal(shouldHandleGlobalKeyboardEvent(keyboardEvent({ repeat: true })), true);
  });
  withDocumentFocus(false, () => {
    assert.equal(shouldHandleGlobalKeyboardEvent(keyboardEvent()), false);
  });
});

test("keyboard navigation handles Back even when the global eligibility guard refuses the key", () => {
  const n = nav(
    '<button id="a" data-rect="0,0,10,10"></button><button id="b" data-rect="0,50,10,10"></button>',
  );
  n.mount();
  n.get("#a").focus();
  n.setFocus(false);
  n.key("ArrowDown");
  assert.equal(active(n), "a", "an unfocused window ignores arrows");
  const back = n.key("Escape");
  assert.deepEqual(n.backs, ["back"]);
  assert.equal(back.defaultPrevented, true, "Back never reaches the WebView");
});

const SIDEBAR_LTR =
  '<div data-tv-nav-zone><button id="nav" data-rect="0,100,40,40"></button></div>' +
  '<main><button id="c1" data-rect="200,100,100,40"></button><button id="c2" data-rect="320,100,100,40"></button></main>';

test("vertical theme nav zones participate in sidebar edge navigation", () => {
  const n = nav(SIDEBAR_LTR);
  n.mount();
  n.get("#c1").focus();
  n.api.moveFocus("left");
  assert.equal(active(n), "nav", "a data-tv-nav-zone rail counts as the sidebar");
  n.api.moveFocus("right");
  assert.equal(active(n), "c1", "and Right leaves it for the content beside it");

  const top = nav(
    '<div data-tv-nav-zone data-tv-top-chrome><button id="top" data-rect="0,0,40,40"></button></div>' +
      '<button id="c1" data-rect="200,100,100,40"></button>',
  );
  top.mount();
  top.get("#c1").focus();
  top.api.moveFocus("left");
  assert.equal(active(top), "c1", "top chrome is not a sidebar");
  assert.match(read("src/lib/theme.ts"), /<aside class="fsh-rail" data-tv-nav-zone/);
});

test("sidebar entry and exit follow physical position in LTR and RTL", () => {
  const ltr = nav(SIDEBAR_LTR);
  ltr.mount();
  ltr.get("#c2").focus();
  ltr.api.moveFocus("left");
  assert.equal(active(ltr), "c1", "Left inside a row stays in the row");
  ltr.get("#c2").focus();
  ltr.api.moveFocus("right");
  assert.equal(active(ltr), "c2", "Right at the row end does not jump to a sidebar on the left");

  const rtl = nav(
    '<main><button id="c2" data-rect="0,100,100,40"></button><button id="c1" data-rect="120,100,100,40"></button></main>' +
      '<div data-tv-nav-zone><button id="nav" data-rect="500,100,40,40"></button></div>',
    { rtl: true },
  );
  rtl.mount();
  rtl.get("#c1").focus();
  rtl.api.moveFocus("right");
  assert.equal(active(rtl), "nav", "an RTL sidebar is entered with Right");
  rtl.api.moveFocus("left");
  assert.equal(active(rtl), "c1", "and left with Left");
  rtl.get("#c2").focus();
  rtl.api.moveFocus("left");
  assert.equal(active(rtl), "c2", "Left at the far edge does not reach the sidebar");
});

const SEARCH_FIELD =
  '<button id="above" data-rect="0,0,100,40"></button>' +
  '<div id="wrap" data-settings-search-field data-tv-text-field data-rect="0,100,300,40"><input id="q" type="text" data-rect="0,500,10,10"></div>' +
  '<button id="below" data-rect="0,300,100,40"></button>';

test("settings search separates navigation focus from explicit text mode", () => {
  const n = nav(SEARCH_FIELD);
  n.mount();
  n.get("#above").focus();
  n.api.moveFocus("down");
  const q = n.get("#q");
  assert.equal(active(n), "q", "the text field cell, not the bare input, decides its position");
  assert.equal(q.getAttribute("data-search-nav-mode"), "true");
  assert.equal(q.readOnly, true, "navigation focus does not type");
  assert.equal(n.get("#wrap").getAttribute("data-tv-search-nav-focused"), "true");
  assert.equal(n.key("x", { target: q }).defaultPrevented, true, "letters are swallowed");

  n.key("Enter", { target: q });
  assert.equal(q.getAttribute("data-search-editing"), "true");
  assert.equal(q.readOnly, false);
  assert.equal(n.key("x", { target: q }).defaultPrevented, false, "editing types normally");

  n.key("Escape", { target: q });
  assert.deepEqual(n.backs, [], "Escape leaves editing instead of going back");
  assert.equal(q.getAttribute("data-search-editing"), null);
  assert.equal(q.getAttribute("data-search-nav-mode"), "true");
  n.key("Escape", { target: q });
  assert.deepEqual(n.backs, ["back"]);

  const other = nav(
    '<button id="b" data-rect="0,0,10,10"></button><div data-tv-text-field data-rect="0,50,100,20"><input id="t" type="search" data-rect="0,50,100,20"></div>',
  );
  other.mount();
  other.api.moveFocus("down");
  other.get("#t").focus();
  other.fire("focusin", { target: other.get("#t") });
  assert.equal(
    other.get("#t").getAttribute("data-search-nav-mode"),
    "true",
    "Tab focus gets the same nav mode",
  );
  assert.match(
    read("src/views/settings/nav.tsx"),
    /<div data-settings-search-field data-tv-text-field /,
  );
  const css = read("src/index.css");
  assert.match(css, /data-tv-search-nav-focused/);
  assert.match(css, /data-tv-search-editing-focused/);
});

test("every global search listener uses the shared keyboard eligibility guard", () => {
  const dom = tvDom('<input id="q" type="text"><button id="b"></button>');
  const opened: boolean[] = [];
  const hotkeys = loadModule(
    "src/lib/hotkeys.ts",
    { "./stored-settings": { storedSettings: () => ({}) } },
    { document: dom.document },
  );
  hookHarness(
    "src/components/search/search-hotkey.tsx",
    "SearchHotkey",
    {
      "@/lib/hotkeys": hotkeys,
      "@/lib/search-context": { useSearch: () => ({ setOpen: (v: boolean) => opened.push(v) }) },
      "@/lib/settings": {
        useSettingsSelector: (pick: (s: object) => unknown) =>
          pick({ hotkeys: { globalSearchFocus: "f" } }),
      },
    },
    dom.globals,
  ).render();
  dom.key("f", { target: dom.get("#q") });
  assert.deepEqual(opened, [], "typing f in a field does not open search");
  dom.key("f", { target: dom.get("#b") });
  assert.deepEqual(opened, [true]);
  for (const file of ["src/chrome/topbar.tsx", "src/chrome/royal-topbar.tsx"]) {
    assert.match(read(file), /if \(!shouldHandleGlobalKeyboardEvent\(e\)\) return;/);
  }
});

test("settings sidebar account row uses a spatial cell container", () => {
  assert.match(
    read("src/views/settings/settings-sidebar.tsx"),
    /<div data-tv-nav-cell className="hset-rail-me">/,
  );
});

test("home search overlay types directly and closes through its modal closer on Back", () => {
  const n = nav(
    '<button id="page" data-rect="0,0,10,10"></button>' +
      '<div data-search-overlay="true" data-tv-focus-scope="true" data-rect="0,0,500,500">' +
      '<button id="close" data-tv-modal-close data-rect="480,0,20,20"></button>' +
      '<input id="q" type="text" data-tv-text-auto="true" data-rect="0,0,400,40">' +
      '<button id="hit" data-rect="0,100,100,40"></button></div>',
  );
  n.mount();
  const q = n.get("#q");
  q.focus();
  const down = n.key("ArrowDown", { target: q });
  assert.equal(down.defaultPrevented, false, "arrows reach the input");
  assert.equal(active(n), "q");
  assert.equal(q.getAttribute("data-search-editing"), "true");
  n.key("Escape", { target: q });
  assert.deepEqual(
    n.clicks.map((el: any) => el.getAttribute("id")),
    ["close"],
  );
  assert.deepEqual(n.backs, [], "the overlay closes itself before the page goes back");
  const overlay = read("src/components/search/search-overlay.tsx");
  assert.match(overlay, /data-search-overlay="true"/);
  assert.match(overlay, /data-tv-focus-scope=\{closing \? undefined : "true"\}/);
  assert.match(
    overlay,
    /<TvModalClose onClose=\{handleModalClose\} label=\{t\("Close search"\)\} \/>/,
  );
  assert.match(overlay, /data-tv-text-auto="true"/);
});

test("search Tab navigation stays scoped, wraps both ways, and removes its listener", () => {
  const stops = ["input", "action", "result"];
  assert.equal(nextTabStop(stops, "input", false), "action");
  assert.equal(nextTabStop(stops, "result", false), "input");
  assert.equal(nextTabStop(stops, "outside", false), "input");
  assert.equal(nextTabStop(stops, null, false), "input");
  assert.equal(nextTabStop(stops, "action", true), "input");
  assert.equal(nextTabStop(stops, "input", true), "result");
  assert.equal(nextTabStop(stops, "outside", true), "result");
  const overlay = read("src/components/search/search-overlay.tsx");
  assert.match(
    overlay,
    /if \(!\(e\.target instanceof Node\) \|\| !root\.contains\(e\.target\)\) return;/,
  );
  assert.match(
    overlay,
    /nextTabStop\(els, document\.activeElement as HTMLElement, e\.shiftKey\)\.focus\(\)/,
  );
  assert.match(overlay, /return \(\) => root\.removeEventListener\("keydown", onKeyDown\)/);
});

test("focus restoration never borrows a rounded radius onto page roots", () => {
  const n = nav('<button id="a" data-rect="0,0,10,10"></button>');
  n.mount();
  n.document.body.style.borderRadius = "12px";
  n.api.tvFocus(n.document.body);
  assert.equal(n.document.body.style.borderRadius, "");
  const button = n.get("#a");
  n.api.tvFocus(button);
  assert.equal(button.style.borderRadius, "8px", "ordinary buttons still get a rounded ring");
});

test("F6 blocks the native default without stopping custom shortcut propagation", () => {
  const n = nav('<button id="a" data-rect="0,0,10,10"></button>');
  n.mount();
  const before = n.listenerCount("keydown");
  const f6 = n.key("F6");
  assert.equal(f6.defaultPrevented, true);
  assert.equal(f6.stopped, false);
  assert.equal(n.key("F5").defaultPrevented, false);
  n.h.unmount();
  assert.equal(n.listenerCount("keydown"), before - 2, "both keydown listeners are removed");
});

test("search focus overrides coexist with Music styles and reduced-motion support", () => {
  const css = read("src/index.css");
  assert.match(css, /\[data-search-overlay\] input/);
  assert.match(
    css,
    /\[data-search-overlay\] \[data-tv-search-editing-focused="true"\],\s*\[data-search-overlay\] \[data-tv-search-nav-focused="true"\] \{\s*outline: none !important;\s*\}/,
  );
  assert.match(css, /\.music-eq-bars \{/);
  assert.match(css, /@keyframes music-eq-bounce/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.music-eq-bars i \{\s*animation: none;/,
  );
});

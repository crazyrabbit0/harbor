import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { LAYOUTS, navChromeHarness, nestedInButton } from "./helpers/nav-chrome-harness.ts";
import { navDragHarness } from "./helpers/nav-drag-harness.ts";
import { navMenuHarness } from "./helpers/nav-menu-harness.ts";
import { all } from "./helpers/tree-render.ts";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(read(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  new Function("require", "exports", ...Object.keys(globals), code)(
    (name) => mocks[name] ?? {},
    exports,
    ...Object.values(globals),
  );
  return exports;
}
const allFeatures = { appFeatures: () => ({ games: true, music: true }) };
const nav = load("src/chrome/nav-items.tsx", {
  "@/lib/sports/enabled": { useSportsEnabled: () => false },
  "@/lib/streams/plugins/available": { usePluginCataloguesAvailable: () => false },
  "@/lib/app-features": allFeatures,
});
const navWithPlugins = load("src/chrome/nav-items.tsx", {
  "@/lib/sports/enabled": { useSportsEnabled: () => false },
  "@/lib/streams/plugins/available": { usePluginCataloguesAvailable: () => true },
  "@/lib/app-features": allFeatures,
});
const navWithoutGames = load("src/chrome/nav-items.tsx", {
  "@/lib/sports/enabled": { useSportsEnabled: () => false },
  "@/lib/streams/plugins/available": { usePluginCataloguesAvailable: () => false },
  "@/lib/app-features": { appFeatures: () => ({ games: false, music: true }) },
});
const cfg = () => ({ order: [], hidden: [], renamed: {} });

test("a build without the games feature drops Games from the nav, the editors and the saved order", () => {
  assert.ok(nav.useAvailableNavItems().some((item) => item.id === "games"));
  assert.ok(!navWithoutGames.useAvailableNavItems().some((item) => item.id === "games"));
  assert.ok(!navWithoutGames.builtNavItems().some((item) => item.id === "games"));
  assert.ok(navWithoutGames.builtNavItems().some((item) => item.id === "music"));
  assert.ok(
    !navWithoutGames.effectiveNavOrder({ ...cfg(), order: ["games", "home"] }).includes("games"),
  );
});

test("customization retains Music and the Sports availability gate", () => {
  assert.ok(nav.NAV_ITEMS.some((item) => item.id === "music"));
  assert.ok(nav.NAV_ITEMS.some((item) => item.id === "sports"));
  assert.ok(!nav.useAvailableNavItems().some((item) => item.id === "sports"));
});
test("the Plugins tab appears only once a plugin can stand up rows of its own", () => {
  assert.ok(nav.NAV_ITEMS.some((item) => item.id === "plugins"));
  assert.ok(!nav.useAvailableNavItems().some((item) => item.id === "plugins"));
  assert.ok(navWithPlugins.useAvailableNavItems().some((item) => item.id === "plugins"));
});
test("hide and restore do not discard order or renamed labels", () => {
  const original = { order: ["music", "home"], hidden: [], renamed: { music: "My music" } };
  const hidden = nav.toggleNavHidden(original, "music");
  assert.ok(!nav.applyNavCustomization(nav.NAV_ITEMS, hidden).some((item) => item.id === "music"));
  const restored = nav.toggleNavHidden(hidden, "music");
  assert.deepEqual(restored, original);
  assert.equal(nav.applyNavCustomization(nav.NAV_ITEMS, restored)[0].label, "My music");
});
test("move preserves hidden and renamed items and only changes order", () => {
  const original = { ...cfg(), hidden: ["manga"], renamed: { music: "My music" } };
  const moved = nav.moveNavItem(original, "music", "home", "before");
  assert.equal(moved.order[0], "music");
  assert.deepEqual(moved.hidden, original.hidden);
  assert.deepEqual(moved.renamed, original.renamed);
  assert.equal(new Set(moved.order).size, nav.NAV_ITEMS.length);
});

const migrations = load("src/lib/settings/migrations.ts", {
  "@/lib/iptv/playlists-store": { readPlaylists: () => [] },
  "./defaults": { DEFAULT: {} },
});
function migrate(parsed) {
  migrations.runSettingsMigrations(parsed);
  return parsed;
}
test("settings repair no longer wipes saved hidden tabs", () => {
  const settings = migrate({ navCustomization: { ...cfg(), hidden: ["music", "calendar"] } });
  assert.deepEqual(settings.navCustomization.hidden, ["music", "calendar"]);
});
test("legacy Live TV and manga switches migrate once without duplicate hides", () => {
  const settings = migrate({
    hideContent: { liveTv: true, manga: true, adult: true, sports: true },
    navCustomization: { ...cfg(), hidden: ["manga", "music"] },
  });
  assert.deepEqual(settings.navCustomization.hidden, ["manga", "music", "live"]);
  assert.deepEqual(settings.hideContent, { adult: true, sports: true });
  settings.navCustomization.hidden = [];
  assert.deepEqual(migrate(settings).navCustomization.hidden, []);
});
test("edit mode publishes changes and restores the root marker on exit", () => {
  const document = { documentElement: { dataset: {} } };
  const api = load("src/chrome/nav-edit-mode.ts", {}, { document });
  api.setNavEditMode(true);
  assert.equal(document.documentElement.dataset.navEditing, "true");
  api.setNavEditMode(false);
  assert.equal(document.documentElement.dataset.navEditing, undefined);
});

const ids = ["home", "movies", "settings", "calendar"];

for (const name of Object.keys(LAYOUTS)) {
  test(`${name} retains available navigation, keyboard menus, and checked activation`, () => {
    const chrome = navChromeHarness(name, { ids });
    const drawn = chrome.entries.map((el) => el.props["data-nav-drop-id"]);
    assert.ok(drawn.includes("home") && drawn.includes("calendar"), drawn.join());
    assert.ok(!drawn.includes("games"), "only items useAvailableNavItems returned are drawn");

    for (const entry of chrome.entries) {
      chrome.pressKey(entry, "ContextMenu");
      chrome.pressKey(entry, "F10", true);
    }
    assert.equal(
      chrome.dispatched.length,
      chrome.entries.length * 2,
      "each item opens its menu by key",
    );
    assert.ok(chrome.dispatched.every((e) => e.type === "contextmenu"));

    const home = chrome.entries.find((el) => el.props["data-nav-drop-id"] === "home");
    const menu = chrome.menuFor(home);
    assert.equal(menu.kind, "nav");
    assert.equal(menu.itemId, "home");
    chrome.click(home);
    menu.onOpen();
    assert.deepEqual(
      chrome.views,
      ["home", "home"],
      "the menu's Open runs the same checked action as a click",
    );

    const editing = navChromeHarness(name, { ids, editing: true });
    const badge = editing.navEdit().NavHideBadge;
    assert.ok(
      all(editing.tree).some((el) => el.type === badge),
      "edit mode draws hide badges",
    );
    assert.deepEqual(nestedInButton(editing.tree, badge), [], "buttons must not nest");
  });
}

test("nav menu invokes the supplied checked action rather than navigating directly", () => {
  const navItems = loadNavItems();
  let opened = 0;
  const menu = navMenuHarness(navItems, {
    itemId: "home",
    view: "home",
    label: "Home",
    onOpen: () => (opened += 1),
  });
  menu.item("nav-open").props.onClick();
  assert.equal(opened, 1);
  assert.deepEqual(menu.views, [], "Open never calls setView itself");
  assert.equal(menu.closes(), 1);

  const root = menu.menu();
  assert.equal(root.props["data-tv-focus-scope"], true);
  const close = all(root).find((el) => el.type === "TvModalClose");
  close.props.onClose();
  assert.equal(menu.closes(), 2, "the TV close button closes the menu");

  assert.equal(menu.observers.length, 1);
  assert.equal(menu.observers[0].target, menu.menuNode, "the menu re-measures on resize");
  assert.equal(root.props.style.top, 672 - (672 + 300 - 792), "flips up by its overflow");

  assert.equal(menu.frames.length, 1, "focus moves into the menu on the next frame");
  menu.unmount();
  assert.equal(menu.frames[0].cancelled, true, "closing before that frame cancels it");
  assert.equal(menu.observers[0].disconnected, true);
  assert.deepEqual(menu.focus, ["trigger"], "focus returns to the item that opened the menu");

  const other = navMenuHarness(navItems, { itemId: "home", view: "home", label: "Home" });
  assert.equal(other.item("nav-open").props.disabled, true, "no action means no Open");
  const edit = navMenuHarness(navItems, { kind: "edit" });
  assert.equal(edit.menu().props["data-tv-focus-scope"], undefined, "only nav menus trap focus");
});

test("drag cleanup, reduced motion, and RTL handling are present", () => {
  const navItems = loadNavItems();
  const ids = ["home", "movies", "calendar"];
  const vertical = [0, 1, 2].map((i) => ({ left: 0, top: i * 50, width: 100, height: 40 }));
  const drag = navDragHarness({ navItems, ids, boxes: vertical });
  drag.dragTo(50, drag.center(2).y + 10);
  assert.equal(drag.ghost.inert, true, "the drag ghost is inert");
  assert.deepEqual(drag.mediaQueries, ["(prefers-reduced-motion: reduce)"]);
  assert.ok(drag.ghost.style.transform.includes("scale(1.06)"));
  drag.drop();
  assert.deepEqual(orderOf(drag.commits.at(-1), ids), ["movies", "calendar", "home"]);
  assert.deepEqual(
    drag.listenerTypes(),
    ["click"],
    "only the one-shot click swallow stays after a drop",
  );

  const still = navDragHarness({ navItems, ids, boxes: vertical, reducedMotion: true });
  still.dragTo(50, still.center(2).y + 10);
  assert.ok(
    still.ghost.style.transform.endsWith("scale(1)"),
    "reduced motion keeps the ghost unscaled",
  );
  assert.deepEqual(still.animations, [], "reduced motion skips the reflow animation");

  const leaving = navDragHarness({ navItems, ids, boxes: vertical });
  leaving.dragTo(50, leaving.center(2).y + 10);
  leaving.setEditing(false);
  assert.equal(leaving.ghost.removed, true, "leaving edit mode cleans up the active drag");
  assert.equal(leaving.listenerCount(), 0);
  assert.deepEqual(leaving.commits, []);

  const unmounted = navDragHarness({ navItems, ids, boxes: vertical });
  unmounted.dragTo(50, unmounted.center(2).y + 10);
  unmounted.unmount();
  assert.equal(unmounted.ghost.removed, true, "unmounting mid-drag cleans up the active drag");
  assert.equal(unmounted.listenerCount(), 0);
  // In RTL the first item sits on the right, so a drop past the leftmost item lands it last.
  const rtlBoxes = [2, 1, 0].map((i) => ({ left: i * 110, top: 0, width: 100, height: 40 }));
  const rtl = navDragHarness({ navItems, ids, boxes: rtlBoxes, rtl: true });
  rtl.dragTo(rtl.center(2).x - 30, 20);
  rtl.drop();
  assert.deepEqual(orderOf(rtl.commits.at(-1), ids), ["movies", "calendar", "home"]);
});

const orderOf = (cfg, ids) => cfg.order.filter((id) => ids.includes(id));

function loadNavItems() {
  return load("src/chrome/nav-items.tsx", {
    "@/lib/sports/enabled": { useSportsEnabled: () => true },
    "@/lib/streams/plugins/available": { usePluginCataloguesAvailable: () => true },
    "@/lib/app-features": allFeatures,
  });
}

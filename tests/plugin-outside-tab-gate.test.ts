import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import "./_localstorage-stub.ts";
import { DEFAULT } from "../src/lib/settings/defaults.ts";
import { providesOwnRows } from "../src/lib/streams/plugins/runnable.ts";
import {
  extensionCatalogueBase,
  isExtensionCatalogueBase,
} from "../src/lib/streams/plugins/extension/catalogue-base.ts";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];
const names = new Proxy({}, { get: (_t, name) => String(name) });
const i18n = { useT: () => (s: string) => s };

test("plugins stay out of the surfaces outside their own page until they are allowed", () => {
  assert.equal(DEFAULT.pluginsOutsideTab, false);
});

test("the switch is offered with the NEW badge", () => {
  const updates: unknown[] = [];
  const settings = { ...DEFAULT, pluginsOutsideTab: true };
  const h = hookHarness("src/views/settings/plugins-panel/installed-tab.tsx", "InstalledTab", {
    "../icons": names,
    "@/lib/i18n": i18n,
    "@/lib/plugins": { pluginKinds: () => [], usePluginKindsVersion: () => 0 },
    "@/lib/read-at-version": { readAtVersion: (_v: unknown, fn: () => unknown) => fn() },
    "@/lib/settings": {
      useSettings: () => ({ settings, update: (p: unknown) => updates.push(p) }),
    },
    "../kit": names,
    "../shared": names,
    "../ui": names,
    "./copy": { kindLabel: () => "" },
    "./plugin-row": names,
    "react/jsx-runtime": jsx,
  });
  const rows = all(h.render({ onAddRepository() {} })).filter(
    (n) => n.type === "ToggleRow" && n.props.newId === "plugins:outside-tab",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].props.value, true);
  rows[0].props.onChange(false);
  assert.deepEqual(updates, [{ pluginsOutsideTab: false }]);

  const badges = loadModule("src/views/settings/settings-new.ts", {
    react: { useSyncExternalStore: (_s: unknown, get: () => unknown) => get() },
    "@/lib/read-at-version": { readAtVersion: (_v: unknown, fn: () => unknown) => fn() },
  });
  const isNew = badges.useSettingNew() as (id: string) => boolean;
  assert.equal(isNew("plugins:outside-tab"), true, "an id that is not registered shows no badge");
});

function catalogBrowse() {
  const calls = { refresh: 0, sync: 0 };
  const row = {
    pluginId: "ext",
    providerId: "prov",
    row: "Popular",
    providerName: "Prov",
    pluginName: "Ext",
    pluginIcon: undefined,
    type: "movie",
  };
  const addon = {
    transportUrl: "https://addon.test/manifest.json",
    manifest: { id: "a", name: "Addon", catalogs: [{ type: "movie", id: "top", name: "Top" }] },
  };
  const mod = loadModule("src/lib/catalog-browse.ts", {
    "./addons": {
      createAddonCatalogFetcher: () => () => Promise.resolve([]),
      gatherCatalogAddons: async () => [addon],
      isCollectionCatalog: () => false,
    },
    "./streams/plugins": {
      extensionCatalogueBase,
      extensionCataloguePage: async () => [],
      extensionCataloguesSync: () => (calls.sync++, [row]),
      isExtensionCatalogueBase,
      refreshExtensionCatalogues: async () => void calls.refresh++,
      subscribeExtensionCatalogues: () => () => {},
    },
  });
  return { list: mod.listBrowseCatalogs, calls };
}

test("a surface that does not want plugin rows does not ask for them", async () => {
  const off = catalogBrowse();
  const without = await off.list(null, { pluginRows: false });
  assert.deepEqual(
    without.map((c: { base: string }) => c.base),
    ["https://addon.test"],
  );
  assert.deepEqual(off.calls, { refresh: 0, sync: 0 }, "no plugin is queried for the surface");

  const on = catalogBrowse();
  const withRows = await on.list(null, { pluginRows: true });
  assert.deepEqual(
    withRows.map((c: { base: string }) => c.base),
    [extensionCatalogueBase("ext", "prov"), "https://addon.test"],
  );
  assert.deepEqual(on.calls, { refresh: 1, sync: 1 });
});

function browseSpy() {
  const asked: unknown[] = [];
  let notify = () => {};
  return {
    asked,
    fire: () => notify(),
    module: {
      browseFetcher: () => () => Promise.resolve([]),
      catalogTypeLabelKey: () => undefined,
      listBrowseCatalogs: (_k: unknown, opts: unknown) => (asked.push(opts), Promise.resolve([])),
      subscribeBrowseCatalogs: (cb: () => void) => ((notify = cb), () => {}),
    },
  };
}

const settingsMock = (settings: Record<string, unknown>) => ({
  useSettingsSelector: (pick: (s: Record<string, unknown>) => unknown) => pick(settings),
  useSettingsUpdate: () => () => {},
});

function catalogsView(pluginsOutsideTab: boolean) {
  const spy = browseSpy();
  const h = hookHarness("src/views/catalogs.tsx", "Catalogs", {
    "lucide-react": names,
    "@/components/icons/pencil-outline": names,
    "@/components/icons/search-icon": names,
    "@/lib/auth": { useAuth: () => ({ authKey: "k" }) },
    "@/lib/catalog-browse": spy.module,
    "@/lib/view": { useViewActions: () => ({ setView() {} }) },
    "@/lib/i18n": i18n,
    "@/lib/settings": settingsMock({ catalogsHidden: [], catalogsPinned: [], pluginsOutsideTab }),
    "./catalogs/catalog-shelf": names,
    "./catalogs/catalog-manage-list": names,
    "./catalogs/addon-filter-select": names,
    "./catalogs/use-catalog-list": {
      useCatalogList: () => ({
        types: [],
        addons: [],
        filtered: [],
        pinnedCats: [],
        pinnedSet: new Set(),
        hiddenSet: new Set(),
        groups: [],
      }),
    },
    "@/lib/window-drag": { useContentDrag: () => ({}) },
    "react/jsx-runtime": jsx,
  });
  h.render({});
  spy.fire();
  return spy.asked;
}

function catalogBrowserView(pluginsOutsideTab: boolean) {
  const spy = browseSpy();
  const h = hookHarness("src/views/discover/catalog-browser.tsx", "CatalogBrowser", {
    "lucide-react": names,
    "@/components/icons/search-icon": names,
    "@/lib/auth": { useAuth: () => ({ authKey: "k" }) },
    "@/lib/catalog-browse": spy.module,
    "@/lib/i18n": i18n,
    "@/lib/settings": settingsMock({ pluginsOutsideTab }),
    "@/lib/view": { useViewActions: () => ({ openGrid() {} }) },
    "react/jsx-runtime": jsx,
  });
  h.render();
  spy.fire();
  return spy.asked;
}

function pluginsPage() {
  const spy = browseSpy();
  const h = hookHarness("src/views/plugins.tsx", "Plugins", {
    "lucide-react": names,
    "@/lib/auth": { useAuth: () => ({ authKey: "k" }) },
    "@/lib/catalog-browse": spy.module,
    "@/lib/streams/plugins": { isExtensionCatalogueBase, subscribeStreamPlugins: () => () => {} },
    "@/lib/streams/plugins/extension/search": {
      searchPlugins: async () => [],
      searchPluginPage: async () => [],
    },
    "@/lib/view": { useViewActions: () => ({ openSettings() {}, openGrid() {} }) },
    "@/lib/i18n": i18n,
    "@/lib/window-drag": { useContentDrag: () => ({}) },
    "@/components/feed-shelf": names,
    "./catalogs/catalog-shelf": names,
    "./plugins/plugin-picker": { PluginPicker: "PluginPicker", ALL_PLUGINS: "" },
    "./plugins/plugin-hero": names,
    "./plugins/plugin-arrange": names,
    "./plugins/section-order": { forFilter: (groups: unknown) => groups, readOrder: () => ({}) },
    "react/jsx-runtime": jsx,
  });
  h.render({});
  spy.fire();
  return spy.asked;
}

test("the Plugins page is the only surface that always asks for plugin rows", () => {
  assert.deepEqual(pluginsPage(), [{ pluginRows: true }, { pluginRows: true }]);
  for (const outside of [false, true]) {
    const want = [{ pluginRows: outside }, { pluginRows: outside }];
    assert.deepEqual(catalogsView(outside), want, "Catalogs threads the setting");
    assert.deepEqual(catalogBrowserView(outside), want, "Discover threads the setting");
  }
  // Mobile search is over 1000 lines of view code, so its one call is checked as text.
  const mobile = readFileSync("src/views/mobile/mobile-search.tsx", "utf8");
  assert.match(
    mobile,
    /listBrowseCatalogs\(authKey, \{\s+pluginRows: settings\.pluginsOutsideTab,/,
  );
});

test("every caller of the catalog list is one of the surfaces checked above", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path.replace(/\\/g, "/")];
    });
  const callers = walk("src")
    .filter((path) => /\.tsx?$/.test(path) && path !== "src/lib/catalog-browse.ts")
    .filter((path) => readFileSync(path, "utf8").includes("listBrowseCatalogs("))
    .sort();
  assert.deepEqual(
    callers,
    [
      "src/views/catalogs.tsx",
      "src/views/discover/catalog-browser.tsx",
      "src/views/mobile/mobile-search.tsx",
      "src/views/plugins.tsx",
    ],
    "a new caller must thread settings.pluginsOutsideTab and get a test here",
  );
});

test("only a plugin that stands up rows of its own is held back", () => {
  // An extension has a page of its own; a row-less plugin held back would be unreachable.
  assert.equal(providesOwnRows({ format: "android-extension" }), true);
  assert.equal(providesOwnRows({ format: "provider-script" }), false);
  assert.equal(providesOwnRows({ format: "harbor" }), false);
});

function pluginLayer() {
  const asked: unknown[] = [];
  const plugin = { transportUrl: "harbor-plugin://p", manifest: { name: "Plugin" } };
  return {
    asked,
    module: {
      loadStreamPlugins: async () => {},
      pluginAddons: (opts: unknown) => (asked.push(opts), [plugin]),
      pluginListKey: () => "",
      setStreamPluginConfig: () => {},
      subscribeStreamPluginList: () => () => {},
    },
  };
}

const addonSources = {
  "@/lib/addon-store": {
    fetchInstalledAddons: async () => [],
    fetchManifestAt: async () => null,
    filterEnabled: (list: unknown[]) => list,
  },
  "@/lib/addons": { userAddons: async () => [], withDebridKeys: (list: unknown[]) => [...list] },
  "@/lib/addons-store/reorder": {
    applyOrderToItems: (l: unknown[]) => l,
    loadDisplayOrder: () => [],
  },
};

async function picker(settings: Record<string, unknown>) {
  const plugins = pluginLayer();
  const h = hookHarness(
    "src/views/play-picker/use-addons.ts",
    "run",
    {
      ...addonSources,
      "@/lib/streams/plugins": plugins.module,
      "@/lib/plugins/auto-check": { schedulePluginAutoCheck: () => {} },
    },
    { console: { info() {} } },
  );
  h.exports.run = (s: Record<string, unknown>) => h.exports.useAddons(null, s);
  const full = { ...DEFAULT, ...settings };
  h.render(full);
  await flushPromises();
  return { asked: plugins.asked, addons: h.render(full).addons };
}

test("the Play button asks a plugin with no rows of its own whatever the switch says", async () => {
  for (const outside of [false, true]) {
    const { asked, addons } = await picker({ pluginsEnabled: true, pluginsOutsideTab: outside });
    assert.deepEqual(
      asked.map((o) => (o as { includeExtensions: boolean }).includeExtensions),
      [outside],
      "the switch must not stand the row-less plugins down",
    );
    assert.deepEqual(
      addons.map((a: { manifest: { name: string } }) => a.manifest.name),
      ["Plugin"],
    );
  }
  const paused = await picker({ pluginsEnabled: false, pluginsOutsideTab: true });
  assert.deepEqual(paused.asked, []);
});

async function background(settings: Record<string, unknown>) {
  const plugins = pluginLayer();
  const ctx = loadModule("src/lib/auto-download/context.ts", {
    ...addonSources,
    "@/lib/profile-roster": { activeSettingsSource: () => ({ profileId: "p", linked: false }) },
    "@/lib/debrid/registry": { buildDebridClients: () => [] },
    "@/lib/settings/profile-store": { loadEffective: () => ({ ...DEFAULT, ...settings }) },
    "@/lib/streams/plugins": plugins.module,
  });
  const { addons } = await ctx.gatherContext();
  return { asked: plugins.asked, addons };
}

test("background work keeps the extensions back but never the row-less plugins", async () => {
  for (const outside of [false, true]) {
    const { asked, addons } = await background({
      pluginsEnabled: true,
      pluginsBackground: true,
      pluginsOutsideTab: outside,
    });
    assert.deepEqual(
      asked.map((o) => (o as { includeExtensions: boolean }).includeExtensions),
      [outside],
    );
    assert.equal(addons.length, 1);
  }
  const off = await background({
    pluginsEnabled: true,
    pluginsBackground: false,
    pluginsOutsideTab: true,
  });
  assert.deepEqual(off.asked, []);
});

test("a plugin row pinned to Home goes with the others", async () => {
  const fetched: string[] = [];
  const { buildPinnedCatalogRows } = loadModule("src/lib/pinned-catalogs-rows.ts", {
    "./catalog-browse": {
      browseFetcher: (cat: { base: string }) => {
        fetched.push(cat.base);
        return () => Promise.resolve([{ id: "tt1" }]);
      },
    },
    "./streams/plugins/extension/catalogue-base": { isExtensionCatalogueBase },
  });
  const pluginBase = extensionCatalogueBase("ext", "prov");
  const pinned = [
    {
      id: "a",
      name: "Addon",
      source: "catalog",
      params: { base: "https://a", type: "movie", id: "x" },
    },
    {
      id: "p",
      name: "Plugin",
      source: "catalog",
      params: { base: pluginBase, type: "movie", id: "y" },
    },
  ];
  const keys = async (pluginRows: boolean) =>
    (await buildPinnedCatalogRows(pinned, { pluginRows })).map((r: { key: string }) => r.key);

  assert.deepEqual(
    await keys(false),
    ["pinned:a"],
    "a pinned plugin row is still a plugin being asked",
  );
  assert.deepEqual(fetched, ["https://a"]);
  assert.deepEqual(await keys(true), ["pinned:a", "pinned:p"]);
});

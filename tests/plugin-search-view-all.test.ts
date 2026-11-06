import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./_localstorage-stub.ts";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";
import { all, jsx, names, t, text, type N } from "./helpers/plugin-ui-tree.ts";

// Rust and Kotlin cannot run here, so the two lines of wiring on their side stay text checks.
const RUST = readFileSync("src-tauri/src/capstan.rs", "utf8");
const API = readFileSync("android-extension-compat/src/api/MainAPI.kt", "utf8");

type Item = { name: string; url: string };

// The real bridge and the real search walk, over a bridge that answers `answer(provider, page)`.
function walk(answer: (providerId: string, page: number) => Item[]) {
  const calls: { command: string; args: Record<string, any> }[] = [];
  const bridge = loadModule("src/lib/streams/plugins/extension/bridge.ts", {
    "@tauri-apps/api/core": {
      invoke: async (command: string, args: Record<string, any>) => {
        calls.push({ command, args });
        if (command === "capstan_search") {
          return { results: answer(args.providerId, args.page) };
        }
        return {};
      },
    },
  });
  const providers = [
    { id: "a", name: "A", types: ["movie"], hasQuickSearch: true },
    { id: "b", name: "B", types: ["movie"], hasQuickSearch: false },
  ];
  const search = loadModule("src/lib/streams/plugins/extension/search.ts", {
    "../catalogues": {
      budget: () => 1000,
      gated: (_p: unknown, _w: string, _ms: number, fn: any) => fn(),
    },
    "../runnable": { pluginCatalogueSources: () => [{ id: "plug", name: "Plug" }] },
    "./bridge": {
      bridgeProviders: async () => providers,
      bridgeSearch: bridge.bridgeSearch,
      warmBridge: async () => {},
    },
    "./catalogue": {
      metaFor: (_cat: unknown, item: Item) => ({ id: item.url, type: "movie", name: item.name }),
      providersOf: (_plugin: unknown, all: unknown[]) => all,
    },
    "./match": { relevanceScore: () => 0 },
    "./meta-type": { providerMetaType: () => "movie" },
  });
  return { calls, page: search.searchPluginPage };
}

const items = (prefix: string, count: number): Item[] =>
  Array.from({ length: count }, (_, i) => ({ name: `${prefix}${i}`, url: `${prefix}${i}` }));

test("the search call carries the page it was asked for", async () => {
  const run = walk(() => []);
  await run.page("plug", "dune", 3);
  const sent = run.calls.filter((c) => c.command === "capstan_search");
  assert.deepEqual(
    sent.map((c) => c.args),
    [
      { providerId: "a", query: "dune", quick: true, page: 3 },
      { providerId: "b", query: "dune", quick: false, page: 3 },
    ],
  );
  // The Rust command already takes a page and forwards it; only the TS side ever dropped it.
  assert.match(RUST, /page: Option<u32>/);
  assert.match(RUST, /params\["page"\] = json!\(page\)/);
});

test("a walk past the shelves is not capped, and repeats across providers are merged", async () => {
  const run = walk((provider) =>
    provider === "a" ? items("a", 100) : [...items("a", 5), ...items("b", 5)],
  );
  const found = await run.page("plug", "dune", 1);
  // More than a shelf's cap per provider (30) or per plugin (60), and the five shared ids once.
  assert.equal(found.length, 105);
  assert.equal(new Set(found.map((m: { id: string }) => m.id)).size, 105);
});

test("a page that is not a page, or a plugin that is not runnable, asks nothing", async () => {
  const run = walk(() => items("a", 1));
  assert.deepEqual(await run.page("plug", "dune", 0), []);
  assert.deepEqual(await run.page("plug", "   ", 1), []);
  assert.deepEqual(await run.page("someone-else", "dune", 1), []);
  assert.equal(run.calls.filter((c) => c.command === "capstan_search").length, 0);
});

test("a provider with nothing past its first page ends the walk", () => {
  // Kotlin: the extension API answers an empty list past page one unless the extension pages.
  assert.match(API, /if \(page > 1\) return SearchResponseList\(emptyList\(\), false\)/);
});

async function pluginsPage() {
  const searches: { q: string; resolve: (r: unknown[]) => void }[] = [];
  const pages: unknown[][] = [];
  const grids: Record<string, any>[] = [];
  const catalog = { key: "k1", base: "harbor-plugin://plug/prov", addonName: "Plug" };
  const h = hookHarness("src/views/plugins.tsx", "Plugins", {
    "lucide-react": names,
    "@/lib/auth": { useAuth: () => ({ authKey: "k" }) },
    "@/lib/catalog-browse": {
      listBrowseCatalogs: async () => [catalog],
      subscribeBrowseCatalogs: () => () => {},
    },
    "@/lib/streams/plugins": {
      isExtensionCatalogueBase: () => true,
      subscribeStreamPlugins: () => () => {},
    },
    "@/lib/streams/plugins/extension/search": {
      searchPlugins: (q: string) => new Promise((resolve) => searches.push({ q, resolve })),
      searchPluginPage: async (...args: unknown[]) => (pages.push(args), []),
    },
    "@/lib/view": {
      useViewActions: () => ({
        openSettings() {},
        openGrid: (g: Record<string, any>) => grids.push(g),
      }),
    },
    "@/lib/i18n": { useT: () => t },
    "@/lib/window-drag": { useContentDrag: () => ({}) },
    "@/components/feed-shelf": names,
    "./catalogs/catalog-shelf": names,
    "./plugins/plugin-picker": { PluginPicker: "PluginPicker", ALL_PLUGINS: "" },
    "./plugins/plugin-hero": names,
    "./plugins/plugin-arrange": names,
    "./plugins/section-order": { forFilter: (groups: unknown) => groups, readOrder: () => ({}) },
    "react/jsx-runtime": jsx,
  });
  let tree: unknown = h.render({});
  await flushPromises();
  const render = () => (tree = h.render({}));
  render();
  const find = (pred: (n: N) => boolean) => all(tree).filter(pred);
  return { searches, pages, grids, render, find };
}

test("each plugin offers the walk, and starts it from the first page", async () => {
  const p = await pluginsPage();
  const input = p.find((n) => n.type === "input")[0];
  input.props.onChange({ target: { value: " dune " } });
  p.render();
  p.find((n) => n.type === "form")[0].props.onSubmit({ preventDefault() {} });
  p.render();
  p.render();
  p.searches[0].resolve([
    {
      pluginId: "plug",
      pluginName: "Plug",
      metas: [{}],
      providers: [{ providerId: "prov", providerName: "Prov", metas: [{}] }],
    },
  ]);
  await flushPromises();
  p.render();

  const viewAll = p.find(
    (n) => n.type === "button" && text(n.props.children).includes(t("View all")),
  );
  assert.equal(viewAll.length, 1, "one View all per plugin shelf");
  viewAll[0].props.onClick();
  assert.equal(p.grids.length, 1);
  assert.equal(p.grids[0].title, "Plug");
  assert.ok(
    !("initial" in p.grids[0]),
    "seeded with the capped shelf rows the walk would skip page one",
  );
  await p.grids[0].fetcher(2);
  assert.deepEqual(
    p.pages,
    [["plug", "dune", 2]],
    "the walk asks for the title that was asked, by page",
  );
});

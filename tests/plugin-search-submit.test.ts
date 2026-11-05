import { test } from "node:test";
import assert from "node:assert/strict";
import "./_localstorage-stub.ts";
import {
  extensionCatalogueBase,
  isExtensionCatalogueBase,
} from "../src/lib/streams/plugins/extension/catalogue-base.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

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
const t = (key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}|${JSON.stringify(vars)}` : key;

type Group = { pluginId: string; pluginName: string; metas: unknown[]; providers: unknown[] };
const group = (id: string): Group => ({
  pluginId: id,
  pluginName: id,
  metas: [{}],
  providers: [{ providerId: "prov", providerName: "Prov", metas: [{}] }],
});

async function pluginsPage() {
  const searches: { q: string; resolve: (r: Group[]) => void }[] = [];
  const catalog = { key: "k1", base: extensionCatalogueBase("plug", "prov"), addonName: "Plug" };
  const h = hookHarness("src/views/plugins.tsx", "Plugins", {
    "lucide-react": names,
    "@/lib/auth": { useAuth: () => ({ authKey: "k" }) },
    "@/lib/catalog-browse": {
      listBrowseCatalogs: async () => [catalog],
      subscribeBrowseCatalogs: () => () => {},
    },
    "@/lib/streams/plugins": { isExtensionCatalogueBase, subscribeStreamPlugins: () => () => {} },
    "@/lib/streams/plugins/extension/search": {
      searchPlugins: (q: string) => new Promise((resolve) => searches.push({ q, resolve })),
      searchPluginPage: async () => [],
    },
    "@/lib/view": { useViewActions: () => ({ openSettings() {}, openGrid() {} }) },
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
  let tree = h.render({});
  await flushPromises();
  const render = () => (tree = h.render({}));
  render();
  const find = (pred: (n: N) => boolean) => all(tree).filter(pred);
  const form = () => find((n) => n.type === "form" && "data-plugins-search" in n.props)[0];
  const input = () => find((n) => n.type === "input")[0];
  const prevented: boolean[] = [];
  return {
    searches,
    find,
    render,
    input,
    type: (value: string) => (input().props.onChange({ target: { value } }), render()),
    submit: () => {
      form().props.onSubmit({ preventDefault: () => prevented.push(true) });
      // The search effect runs after this render; the next one shows its state.
      render();
      return render();
    },
    prevented,
    hero: () => find((n) => n.type === "PluginHero").length,
    shelves: () => find((n) => n.type === "FeedShelf"),
    clear: () => find((n) => n.type === "button" && n.props.onClick && n.props["aria-label"])[0],
  };
}

test("a search runs when it is submitted, not as the box is typed in", async () => {
  const p = await pluginsPage();
  p.type("dune");
  p.type("dune 2 ");
  assert.equal(p.searches.length, 0, "typing alone never searches");
  p.submit();
  assert.deepEqual(p.prevented, [true], "Enter does not reload the page");
  assert.deepEqual(
    p.searches.map((s) => s.q),
    ["dune 2"],
    "the submitted term is the trimmed box text",
  );
  p.type("dune 3");
  assert.equal(p.searches.length, 1, "editing after a search does not search again");
  p.type("dune 2");
  p.submit();
  assert.deepEqual(
    p.searches.map((s) => s.q),
    ["dune 2", "dune 2"],
    "submitting the same term asks again",
  );
});

test("the box's text is not what was asked for", async () => {
  const p = await pluginsPage();
  assert.equal(p.hero(), 1, "the hero shows while nothing is asked for");
  p.type("dune");
  assert.equal(p.hero(), 1, "typing is not an ask");
  p.submit();
  p.type("arrival");
  assert.equal(p.hero(), 0);
  const heading = p.shelves().find((n) => n.props.shelf.id === "plugin-search");
  assert.equal(heading?.props.shelf.title, t("Results for {q}", { q: "dune" }));
  assert.equal(heading?.props.items, null, "the answer is still pending");
});

test("the last title's rows are dropped as a new search starts", async () => {
  const p = await pluginsPage();
  const providerShelves = () =>
    p.shelves().filter((n) => String(n.props.shelf.id).startsWith("plugin-search:"));
  p.type("dune");
  p.submit();
  p.searches[0].resolve([group("first")]);
  await flushPromises();
  p.render();
  assert.equal(providerShelves().length, 1);
  p.type("arrival");
  p.submit();
  assert.equal(providerShelves().length, 0, "the previous title's rows are not an answer");
  p.searches[1].resolve([group("second")]);
  await flushPromises();
  p.render();
  assert.deepEqual(
    providerShelves().map((n) => n.props.shelf.id),
    ["plugin-search:second:prov"],
  );
});

test("the clear button does not submit the form it sits in", async () => {
  const p = await pluginsPage();
  assert.equal(p.clear(), undefined, "an empty box offers no clear button");
  p.type("dune");
  p.submit();
  const clear = p.clear();
  assert.equal(clear.props.type, "button", "a bare button inside a form submits it");
  clear.props.onClick();
  p.render();
  assert.equal(p.input().props.value, "");
  assert.equal(p.hero(), 1, "clearing the box clears the search with it");
  assert.equal(p.shelves().length, 0);
  assert.equal(p.searches.length, 1);
});

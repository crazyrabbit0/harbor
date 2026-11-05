// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { loadModule } from "./helpers/hook-harness.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Kotlin, Rust and the bridge doc cannot run here, so their wiring stays a text check.
const doc = read("android-extension-compat/docs/BRIDGE.md");
const dispatch = read("android-extension-compat/src/host/BridgeServer.kt");
const rust = read("src-tauri/src/capstan.rs");
const registry = read("src-tauri/src/lib.rs");

function bridge(answer: unknown) {
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  const mod = loadModule("src/lib/streams/plugins/extension/bridge.ts", {
    "@tauri-apps/api/core": {
      invoke: async (command: string, args: Record<string, unknown>) => {
        calls.push({ command, args });
        return answer;
      },
    },
  });
  return { mod, calls };
}

test("the catalogue methods the desktop side sends are the ones the bridge answers", () => {
  for (const method of ["catalogue", "cataloguePage"]) {
    assert.match(doc, new RegExp(`\\| \`${method}\``), `BRIDGE.md must document ${method}`);
    assert.match(dispatch, new RegExp(`"${method}" ->`), `the bridge must dispatch ${method}`);
    assert.match(rust, new RegExp(`call\\(&app, "${method}"`), `capstan.rs must send ${method}`);
  }
  assert.match(rust, /"row": row/, "cataloguePage is addressed by row name, not by row data");
});

test("both catalogue commands are registered and called with the arguments Rust takes", async () => {
  for (const command of ["capstan_catalogue", "capstan_catalogue_page"]) {
    assert.match(rust, new RegExp(`pub async fn ${command}\\b`), `${command} must exist`);
    assert.match(registry, new RegExp(`capstan::${command},`), `${command} must be registered`);
  }
  const { mod, calls } = bridge({ rows: [] });
  await mod.bridgeCatalogue("prov");
  await mod.bridgeCataloguePage("prov", "Popular", 2);
  // Tauri maps camelCase arguments onto the snake_case Rust parameters.
  assert.deepEqual(calls, [
    { command: "capstan_catalogue", args: { providerId: "prov" } },
    { command: "capstan_catalogue_page", args: { providerId: "prov", row: "Popular", page: 2 } },
  ]);
});

test("a page is read out of the sections the bridge writes, not a flat list", async () => {
  const a = { name: "A", url: "a" };
  const b = { name: "B", url: "b" };
  const flat = { name: "Flat", url: "f" };
  const sectioned = bridge({
    sections: [{ items: [a] }, { items: [b] }, {}],
    items: [flat],
    hasNext: true,
  });
  const page = await sectioned.mod.bridgeCataloguePage("prov", "Popular", 1);
  assert.deepEqual(page, { items: [a, b], note: null, hasNext: true });
  const last = bridge({ sections: [{ items: [a] }], hasNext: "true" });
  assert.equal((await last.mod.bridgeCataloguePage("prov", "Popular", 9)).hasNext, false);
});

const pluginRow = {
  pluginId: "plug",
  pluginName: "Plugin",
  pluginIcon: "icon",
  providerId: "prov",
  providerName: "Provider",
  row: "Popular",
  type: "movie",
};

function browse() {
  const log: string[] = [];
  const mod = loadModule("src/lib/catalog-browse.ts", {
    "./addons": {
      gatherCatalogAddons: async () => [
        {
          transportUrl: "https://addon.example/manifest.json",
          manifest: {
            id: "ad",
            name: "Addon",
            catalogs: [{ type: "movie", id: "top", name: "Top" }],
          },
        },
      ],
      createAddonCatalogFetcher: (cursor: { base: string }) => {
        log.push(`addon:${cursor.base}`);
        return async () => [];
      },
      isCollectionCatalog: () => false,
    },
    "./streams/plugins": {
      extensionCatalogueBase: (p: string, v: string) => `harbor-plugin://${p}/${v}`,
      extensionCataloguePage: async (base: string, row: string, type: string, page: number) => {
        log.push(`plugin:${base}:${row}:${type}:${page}`);
        return [];
      },
      extensionCataloguesSync: () => [pluginRow],
      isExtensionCatalogueBase: (base: string) => base.startsWith("harbor-plugin://"),
      refreshExtensionCatalogues: async () => log.push("refresh"),
      subscribeExtensionCatalogues: () => () => {},
    },
  });
  return { mod, log };
}

test("a plugin's own catalogs go through the browse surface every addon catalog uses", async () => {
  const withPlugins = browse();
  const list = await withPlugins.mod.listBrowseCatalogs(null, { pluginRows: true });
  assert.deepEqual(
    list.map((c: { base: string; id: string }) => `${c.base}#${c.id}`),
    ["harbor-plugin://plug/prov#Popular", "https://addon.example#top"],
  );
  assert.deepEqual(withPlugins.log, ["refresh"]);

  const without = browse();
  const bare = await without.mod.listBrowseCatalogs(null, { pluginRows: false });
  assert.deepEqual(
    bare.map((c: { base: string }) => c.base),
    ["https://addon.example"],
    "a surface that does not ask for plugin rows must not get them",
  );
  assert.deepEqual(without.log, []);

  await withPlugins.mod.browseFetcher(list[0], null)(3);
  assert.deepEqual(withPlugins.log.slice(1), ["plugin:harbor-plugin://plug/prov:Popular:movie:3"]);
  await withPlugins.mod.browseFetcher(list[1], null)(1);
  assert.deepEqual(withPlugins.log.slice(2), ["addon:https://addon.example"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_localstorage-stub.ts";
import { pinnedPluginBase, pinnedPluginUrl } from "../src/lib/streams/addons.ts";
import * as pluginModule from "../src/lib/streams/plugins/addon.ts";
import * as catalogueBase from "../src/lib/streams/plugins/extension/catalogue-base.ts";
import { persistableAddonOrigin } from "../src/lib/cinemeta.ts";
import { DEFAULT } from "../src/lib/settings/defaults.ts";
import type { Addon } from "../src/lib/addons.ts";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";

const { pluginIdFromCatalogueBase } = pluginModule;

const PLUGIN = "plugin:repo.uhdmovies";
const PROVIDER_BASE = `harbor-plugin://${PLUGIN}/vega`;
const PLUGIN_BASE = `harbor-plugin://${PLUGIN}`;

const addon = (transportUrl: string, id: string): Addon => ({
  manifest: { id, name: id, resources: [], types: [] },
  transportUrl,
});

const pluginAddon = addon(PLUGIN_BASE, PLUGIN);
const otherPlugin = addon("harbor-plugin://plugin:repo.other", "plugin:repo.other");
const repoGrouped = addon("harbor-plugin://repo/abc123", "plugin-repo:abc123");
const httpAddon = addon("https://v3-cinemeta.strem.io/manifest.json", "cinemeta");

test("a row's base resolves to the plugin that listed it", () => {
  assert.equal(pluginIdFromCatalogueBase(PROVIDER_BASE), PLUGIN);
  assert.equal(pluginIdFromCatalogueBase(PLUGIN_BASE), PLUGIN);
  assert.equal(pluginIdFromCatalogueBase("harbor-plugin://repo/abc123"), undefined);
  assert.equal(pluginIdFromCatalogueBase("https://v3-cinemeta.strem.io"), undefined);
  assert.equal(pluginIdFromCatalogueBase("harbor-plugin://"), undefined);
});

test("a provider-level base pins the plugin's own addon", () => {
  const forced = [{ base: PROVIDER_BASE, id: "capstan:vega:abc" }];
  assert.equal(pinnedPluginBase(forced), PROVIDER_BASE);
  assert.equal(
    pinnedPluginUrl(forced, [httpAddon, otherPlugin, pluginAddon]),
    PLUGIN_BASE,
    "the provider part tells rows apart, the match is on the plugin",
  );
});

test("a repository grouping does not answer for one of its plugins", () => {
  const forced = [{ base: PROVIDER_BASE, id: "capstan:vega:abc" }];
  assert.equal(
    pinnedPluginUrl(forced, [httpAddon, repoGrouped]),
    undefined,
    "the pin needs the plugin's own addon in the list, not a group that contains it",
  );
});

test("a catalogue that is no longer here pins nothing", () => {
  const forced = [{ base: PROVIDER_BASE, id: "capstan:vega:abc" }];
  assert.equal(pinnedPluginUrl(forced, [httpAddon]), undefined);
  assert.equal(
    pinnedPluginUrl(
      [{ base: "https://v3-cinemeta.strem.io", id: "tt0137523" }],
      [httpAddon, pluginAddon, otherPlugin],
    ),
    undefined,
    "a row from a normal addon leaves every plugin free",
  );
  assert.equal(pinnedPluginUrl(undefined, [pluginAddon]), undefined);
});

test("a saved row keeps the base it is resolved and played through", () => {
  assert.deepEqual(persistableAddonOrigin({ id: "k", name: "n", base: PROVIDER_BASE }), {
    id: "k",
    name: "n",
    logo: undefined,
    base: PROVIDER_BASE,
  });
  assert.deepEqual(
    persistableAddonOrigin({ id: "k", name: "n", base: "https://v3-cinemeta.strem.io" }),
    { id: "k", name: "n", logo: undefined, base: "https://v3-cinemeta.strem.io" },
  );
  const without = persistableAddonOrigin({ id: "k", name: "n" });
  assert.ok(without && !("base" in without), "no base stored, none invented");
  assert.equal(persistableAddonOrigin(null), undefined);
});

test("a plugin row carries the catalogue it came from", () => {
  const catalogue = loadModule("src/lib/streams/plugins/extension/catalogue.ts", {
    "./catalogue-base": catalogueBase,
    "./detail": { capstanId: (provider: string, url: string) => `${provider}:${url}` },
    "./listing": {
      readListing: (title: string) => ({ title, rest: "", quality: [], year: null }),
    },
    "./meta-type": { metaType: () => "movie", providerMetaType: () => "movie" },
    "./bridge": {},
  });
  const cat = { pluginId: PLUGIN, pluginName: "UHD", providerId: "vega", type: "movie", row: "R" };
  const meta = catalogue.metaFor(cat, { name: "Title", url: "https://x.invalid/1" });
  assert.equal(
    meta.addonOrigin.base,
    PROVIDER_BASE,
    "without its base a saved row cannot name its plugin at play time",
  );
  assert.equal(pluginIdFromCatalogueBase(meta.addonOrigin.base), PLUGIN);
});

/** The real pipeline input builder over scripted installed plugins; records the list ranks came from. */
function pipelineInput(installed: Addon[], covers: Record<string, string[]> = {}) {
  const rankedFrom: Addon[][] = [];
  const api = loadModule(
    "src/lib/streams/episode-pipeline-input.ts",
    {
      "@/lib/addons": {
        addonBasesForOrigin: (_a: Addon[], origin?: { base?: string }) =>
          origin?.base ? [origin.base] : [],
      },
      "@/lib/cinemeta": { isAddonNativeMeta: () => false },
      "@/lib/playback-history": { readPlayback: () => null },
      "./addon-priority": {
        resolveAddonRanks: (list: Addon[]) => (rankedFrom.push(list), {}),
      },
      "./anime-identity-core": { animeAbsoluteFromScopedId: () => null },
      "./plugins/addon": {
        ...pluginModule,
        pluginAddonById: (id: string) => installed.find((a) => a.manifest.id === id),
        pluginsForAddon: (a: Addon) => (covers[a.transportUrl] ?? []).map((id) => ({ id })),
      },
      "./stream-ids": { unverifiedAnimeSeasonId: () => null },
    },
    { window: {} },
  );
  const build = (params: Record<string, unknown>) =>
    api.buildEpisodePipelineInput({
      episode: undefined,
      imdbId: null,
      streamIds: ["tt1"],
      debrids: [],
      settings: { ...DEFAULT, pluginsEnabled: true },
      strictMode: false,
      filterDisabled: false,
      ...params,
    });
  return { build, rankedFrom };
}

const pluginRow = (origin: { id: string; base?: string }) => ({
  id: "capstan:vega:abc",
  type: "movie",
  name: "Title",
  addonOrigin: { name: "UHD", ...origin },
});

test("the pipeline resolves an item's own plugin even where plugins are kept out", () => {
  const p = pipelineInput([pluginAddon, otherPlugin]);
  const byBase = p.build({
    meta: pluginRow({ id: PLUGIN, base: PROVIDER_BASE }),
    addons: [httpAddon],
  });
  assert.deepEqual(
    byBase.addons.map((a: Addon) => a.transportUrl),
    [httpAddon.transportUrl, PLUGIN_BASE],
  );
  assert.deepEqual(
    byBase.forcedAddonBases.map((f: { base: string }) => f.base),
    [PROVIDER_BASE, PLUGIN_BASE],
  );
  assert.deepEqual(
    p.rankedFrom.at(-1),
    byBase.addons,
    "ranks are computed from the list that is actually queried",
  );

  const byId = p.build({ meta: pluginRow({ id: PLUGIN }), addons: [httpAddon] });
  assert.deepEqual(
    byId.addons.map((a: Addon) => a.transportUrl),
    [httpAddon.transportUrl, PLUGIN_BASE],
    "a row that kept only its plugin's id still resolves",
  );

  const grouped = pipelineInput([pluginAddon], { [repoGrouped.transportUrl]: [PLUGIN] });
  const covered = grouped.build({
    meta: pluginRow({ id: PLUGIN, base: PROVIDER_BASE }),
    addons: [repoGrouped],
  });
  assert.deepEqual(
    covered.addons,
    [repoGrouped],
    "a repository grouping that already covers the plugin is not asked twice",
  );

  const paused = p.build({
    meta: pluginRow({ id: PLUGIN, base: PROVIDER_BASE }),
    addons: [httpAddon],
    settings: { ...DEFAULT, pluginsEnabled: false },
  });
  assert.deepEqual(paused.addons, [httpAddon], "with every plugin paused nothing is resolved");
});

test("background work does not resolve an item's plugin", async () => {
  const p = pipelineInput([pluginAddon]);
  const queried: Addon[][] = [];
  const background = loadModule("src/lib/auto-download/resolve.ts", {
    "@/lib/streams/episode-pipeline-input": {
      buildEpisodePipelineInput: (params: Record<string, unknown>) => p.build(params),
    },
    "@/lib/streams/pipeline": {
      runPipeline: async (input: { addons: Addon[] }) => (
        queried.push(input.addons),
        { picker: { all: [] } }
      ),
    },
    "@/lib/streams/resolve": { resolveStream: async () => ({ ok: false }) },
    "@/lib/streams/anime-identity": { buildStreamIdsWithIdentity: async () => ["tt1"] },
    "./context": { readSettings: () => ({ ...DEFAULT, pluginsEnabled: true }) },
  });
  const meta = pluginRow({ id: PLUGIN, base: PROVIDER_BASE });
  const pick = await background.resolveBestDownload(meta, undefined, {
    allowP2p: false,
    maxHeight: null,
    imdbId: null,
    debrids: [],
    addons: [httpAddon],
    signal: new AbortController().signal,
  });
  assert.equal(pick, null);
  assert.deepEqual(queried, [[httpAddon]]);
});

test("the picker reads the installed set even while the switch keeps plugins out", async () => {
  for (const settings of [
    { pluginsEnabled: true, pluginsOutsideTab: false },
    { pluginsEnabled: false, pluginsOutsideTab: false },
  ]) {
    let loads = 0;
    const h = hookHarness(
      "src/views/play-picker/use-addons.ts",
      "run",
      {
        "@/lib/addon-store": {
          fetchInstalledAddons: async () => [],
          fetchManifestAt: async () => null,
          filterEnabled: (list: unknown[]) => list,
        },
        "@/lib/addons": { userAddons: async () => [], withDebridKeys: (l: unknown[]) => [...l] },
        "@/lib/addons-store/reorder": {
          applyOrderToItems: (l: unknown[]) => l,
          loadDisplayOrder: () => [],
        },
        "@/lib/streams/plugins": {
          loadStreamPlugins: async () => {
            loads++;
          },
          pluginAddons: () => [],
          pluginListKey: () => "",
          setStreamPluginConfig() {},
          subscribeStreamPluginList: () => () => {},
        },
        "@/lib/plugins/auto-check": { schedulePluginAutoCheck() {} },
      },
      { console: { info() {} } },
    );
    h.exports.run = (s: Record<string, unknown>) => h.exports.useAddons(null, s);
    h.render({ ...DEFAULT, ...settings });
    await flushPromises();
    assert.equal(loads, 1, `the store loads with ${JSON.stringify(settings)}`);
    assert.deepEqual(h.render({ ...DEFAULT, ...settings }).addons, []);
  }
});

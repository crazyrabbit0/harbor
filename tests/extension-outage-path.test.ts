import assert from "node:assert/strict";
import test from "node:test";
import * as match from "../src/lib/streams/plugins/extension/match.ts";
import { hookHarness, loadModule } from "./helpers/hook-harness.ts";
import { pluginRuntimeHarness } from "./helpers/plugin-runtime-harness.ts";
import { all, jsx, names, t, text, type N } from "./helpers/plugin-ui-tree.ts";

// A down site and a title with no sources both come back empty; each link that carries the difference is run here.

function bridgeAnswering(answer: unknown) {
  return loadModule("src/lib/streams/plugins/extension/bridge.ts", {
    "@tauri-apps/api/core": { invoke: async () => answer },
  });
}

test("the bridge client reads the reason off every answer that can be empty", async () => {
  const down = bridgeAnswering({ results: [], found: false, success: false, note: "  Site down " });
  assert.deepEqual(await down.bridgeSearch("p", "dune", false), { items: [], note: "Site down" });
  assert.deepEqual(await down.bridgeLoad("p", "https://p.example/"), {
    media: null,
    note: "Site down",
  });
  assert.equal((await down.bridgeLoadLinks("p", "data")).note, "Site down");

  const quiet = bridgeAnswering({ results: [], found: false, success: false, note: "   " });
  assert.equal((await quiet.bridgeSearch("p", "dune", false)).note, null);
  assert.equal((await quiet.bridgeLoad("p", "u")).note, null);
  assert.equal((await quiet.bridgeLoadLinks("p", "d")).note, null);
});

function extensionRun(bridge: { search: unknown; load: unknown }) {
  const outages: string[] = [];
  const logs: [string, string][] = [];
  const mod = loadModule("src/lib/streams/plugins/extension/run.ts", {
    "./bridge": {
      bridgeProviders: async () => [{ id: "p", extensionId: "e", name: "Prov" }],
      bridgeSearch: async () => bridge.search,
      bridgeLoad: async () => bridge.load,
      bridgeLoadLinks: async () => ({ success: false, links: [], subtitles: [], note: null }),
      extensionsSupported: () => true,
      warmBridge: async () => {},
    },
    "./match": match,
  });
  const plugin = { name: "Plug", entryId: "e", native: { providerIds: ["p"], extensionId: "e" } };
  const req = {
    type: "movie",
    id: "x",
    ids: [],
    imdbId: null,
    tmdb: null,
    title: "Dune",
    year: 2021,
    season: null,
    episode: null,
    absoluteEpisode: null,
    settings: {},
  };
  const hooks = {
    log: (level: string, line: string) => logs.push([level, line]),
    seen() {},
    call() {},
    outage: (line: string) => outages.push(line),
  };
  const go = () => mod.runExtensionPlugin(plugin, req, new AbortController().signal, 60_000, hooks);
  return { go, outages, logs };
}

const dune = { name: "Dune", url: "https://p.example/dune", type: "movie" };

test("an empty search and a null load both report the reason instead of passing silently", async () => {
  const noResults = extensionRun({ search: { items: [], note: "Site down" }, load: null });
  assert.deepEqual(await noResults.go(), []);
  assert.deepEqual(noResults.outages, ["Site down"]);

  const noPage = extensionRun({
    search: { items: [dune], note: null },
    load: { media: null, note: "Blocked" },
  });
  assert.deepEqual(await noPage.go(), []);
  assert.deepEqual(noPage.outages, ["Blocked"]);
});

test("an empty answer with no reason is logged, and is not an outage", async () => {
  const noResults = extensionRun({ search: { items: [], note: null }, load: null });
  await noResults.go();
  assert.deepEqual(noResults.outages, []);
  assert.equal(noResults.logs.length, 1, "nothing is dropped without a word");

  const noPage = extensionRun({
    search: { items: [dune], note: null },
    load: { media: null, note: null },
  });
  await noPage.go();
  assert.deepEqual(noPage.outages, []);
  assert.ok(
    noPage.logs.some(([level]) => level === "warn"),
    "a null load is not skipped silently",
  );
});

test("the runtime keeps the reason only for a run that produced nothing", async () => {
  const run = pluginRuntimeHarness({ id: "ext", failures: 0, autoPaused: false });
  const health = () => run.mod.pluginHealth("ext");

  run.behave(async (hooks) => {
    hooks.outage("Site down");
    return [];
  });
  await run.go();
  assert.equal(health().lastSkip, "Site down");

  run.behave(async (hooks) => {
    hooks.outage("Site down");
    return [{ url: "https://x.example/v.mp4" }];
  });
  await run.go();
  assert.equal(health().lastSkip, null, "a run that found streams is not an outage");

  run.behave(async () => []);
  await run.go();
  assert.equal(health().lastSkip, null, "an empty run with no reason clears the last one");
});

function ladder(over: Record<string, unknown>) {
  const h = hookHarness("src/views/play-picker/picker-empty-ladder.tsx", "PickerEmptyLadder", {
    "@/lib/i18n": { useT: () => t },
    "./empty-states": names,
    "./source-outages": { SourceOutages: "SourceOutages" },
    "react/jsx-runtime": jsx,
  });
  const props = {
    meta: { id: "tt1", type: "movie" },
    result: null,
    addonsSettled: true,
    pipelineDone: true,
    streamIds: ["tt1"],
    debridCount: 0,
    addonCount: 1,
    allCount: 0,
    rawCount: 0,
    strictMode: false,
    forceShowAll: false,
    ...over,
  };
  return all(h.render(props)).map((n: N) => n.type);
}

test("the picker shows it above whichever empty state is on screen", () => {
  const states = ["EmptyState", "NoSourcesState", "FilteredOutState", "TheatresEmptyState"];
  const empty = ladder({});
  assert.ok(empty.includes("SourceOutages"));
  assert.ok(empty.includes("EmptyState"), "the empty state is on screen");
  assert.ok(
    empty.indexOf("SourceOutages") < empty.findIndex((type) => states.includes(type as string)),
    "the outage list comes before the empty states, not after them",
  );

  const noSources = ladder({ debridCount: 1 });
  assert.ok(noSources.includes("NoSourcesState"));
  assert.ok(noSources.indexOf("SourceOutages") < noSources.indexOf("NoSourcesState"));

  assert.ok(!ladder({ addonsSettled: false }).includes("SourceOutages"), "not before they settle");
  assert.ok(!ladder({ allCount: 3 }).includes("SourceOutages"), "not once there are sources");
});

function outagesList(clock: { now: number }, plugins: Record<string, any>[]) {
  let notify = () => {};
  const h = hookHarness(
    "src/views/play-picker/source-outages.tsx",
    "SourceOutages",
    {
      "@/lib/i18n": { useT: () => t },
      "@/lib/streams/plugins": {
        pluginHealth: (id: string) => plugins.find((p) => p.id === id)?.health ?? null,
        runnableStreamPlugins: () => plugins,
        subscribeStreamPlugins: (cb: () => void) => ((notify = cb), () => {}),
      },
      "react/jsx-runtime": jsx,
    },
    { Date: { now: () => clock.now } },
  );
  return {
    items: () =>
      all(h.render())
        .filter((n: N) => n.type === "li")
        .map((n: N) => text(n)),
    fire: () => notify(),
  };
}

test("the picker reads published health and never claims a stale outage is happening now", () => {
  const clock = { now: 10 * 60_000 };
  const health = (lastSkip: string | null, lastAt: number | null) => ({ lastSkip, lastAt });
  const list = outagesList(clock, [
    { id: "fresh", name: "Fresh", health: health("Down", clock.now - 60_000) },
    { id: "stale", name: "Stale", health: health("Old news", clock.now - 4 * 60_000) },
    { id: "never", name: "Never", health: health("No time", null) },
    { id: "fine", name: "Fine", health: health(null, clock.now) },
    { id: "unseen", name: "Unseen", health: null },
  ]);
  assert.deepEqual(list.items(), ["Fresh · Down"]);
});

test("a reason with no run time is not shown, even early in the session", () => {
  const clock = { now: 60_000 };
  const list = outagesList(clock, [
    { id: "never", name: "Never", health: { lastSkip: "No time", lastAt: null } },
  ]);
  assert.deepEqual(list.items(), []);
});

test("a health change reaches an outage list that is already on screen", () => {
  const clock = { now: 10 * 60_000 };
  const plugins: Record<string, any>[] = [{ id: "a", name: "A", health: null }];
  const list = outagesList(clock, plugins);
  assert.deepEqual(list.items(), []);
  plugins[0].health = { lastSkip: "Down", lastAt: clock.now };
  list.fire();
  assert.deepEqual(list.items(), ["A · Down"]);
});

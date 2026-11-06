import { test } from "node:test";
import assert from "node:assert/strict";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";
import { pluginRuntimeHarness } from "./helpers/plugin-runtime-harness.ts";
import { all, jsx, names, t, text, type N } from "./helpers/plugin-ui-tree.ts";

const copy = loadModule("src/views/settings/plugins-panel/copy.ts", {
  "@/lib/streams/plugins": { pluginErrorCode: () => null },
});

const view = (state: string) => ({
  id: "p",
  name: "P",
  version: "1",
  kind: "stream",
  types: ["movie"],
  lang: [],
  author: "a",
  format: "android-extension",
  state,
  enabled: true,
  nsfw: false,
  verified: false,
  hasSettings: false,
  checkable: true,
  hosts: [],
  learnedHosts: [],
  repoName: "R",
  repoUrl: "r",
  installedAt: 0,
  updateVersion: null,
  canRevert: false,
  previousVersion: null,
  error: null,
});

test("a plugin that answers again is not left stood down", async () => {
  const run = pluginRuntimeHarness({ id: "ext", failures: 3, autoPaused: true });
  await run.go();
  await flushPromises();
  assert.deepEqual(run.saves, [{ id: "ext", failures: 0, autoPaused: false }]);
});

test("the pause follows the failures rather than latching", async () => {
  const fail = async (stored: Record<string, unknown>) => {
    const run = pluginRuntimeHarness({ id: "ext", ...stored });
    run.behave(async () => {
      throw new Error("down");
    });
    await assert.rejects(run.go(), /down/);
    await flushPromises();
    return run.saves[0];
  };
  assert.deepEqual(await fail({ failures: 1, autoPaused: false }), {
    id: "ext",
    failures: 2,
    autoPaused: false,
  });
  assert.deepEqual(await fail({ failures: 2, autoPaused: false }), {
    id: "ext",
    failures: 3,
    autoPaused: true,
  });
  // A stale pause with a short failure count does not outlive the count.
  assert.deepEqual(await fail({ failures: 0, autoPaused: true }), {
    id: "ext",
    failures: 1,
    autoPaused: false,
  });
});

test("an auto-paused row names the failure and leaves the action to the retry button", () => {
  const paused = copy.stateCopy(t, { state: "auto-paused" });
  assert.ok(paused.warn.startsWith("Stopped after {n} failures."));
  assert.equal(paused.lock, null, "the plugin is still switched on");
  assert.equal(copy.stateCopy(t, { state: "enabled" }).warn, null);
});

function row(state: string, opts: { masterOff?: boolean; noCheck?: boolean; timeoutSec?: number }) {
  const calls: unknown[][] = [];
  const adapter = {
    check: opts.noCheck
      ? undefined
      : async (...args: unknown[]) => {
          calls.push(args);
          return { count: 0, ms: 4, requests: 1, error: null };
        },
    health: () => null,
    log: () => [],
  };
  const h = hookHarness(
    "src/views/settings/plugins-panel/plugin-row.tsx",
    "PluginRow",
    {
      "../icons": names,
      "@/components/addon-logo": names,
      "@/lib/dates": { relativeTime: () => "" },
      "@/lib/i18n": { useT: () => t, useUiLanguage: () => "en" },
      "@/lib/settings": { useSettings: () => ({ settings: { addonTimeoutSec: opts.timeoutSec } }) },
      "../kit": names,
      "../shared": names,
      "../ui": names,
      "./bits": { BARE_ICON: "", Chip: "Chip", Switch: "Switch", languageNames: () => "" },
      "./copy": copy,
      "./plugin-settings-modal": names,
      "react/jsx-runtime": jsx,
    },
    {},
  );
  const props = { plugin: view(state), adapter, masterOff: opts.masterOff ?? false };
  let tree: unknown = h.render(props);
  const render = () => (tree = h.render(props));
  const buttons = (label: string) =>
    all(tree).filter((n: N) => n.type === "SButton" && text(n.props.children).includes(label));
  const note = () => all(tree).find((n: N) => n.type === "RowNote");
  return { calls, render, buttons, note, noteText: () => text(note()?.props.children) };
}

test("the retry is offered on the row, and only while it is stood down", () => {
  const retry = (state: string, opts = {}) => row(state, opts).buttons(t("Try again")).length;
  assert.equal(retry("auto-paused"), 1);
  assert.equal(retry("error"), 0, "a state Harbor did not set has nothing to retry");
  assert.equal(retry("enabled"), 0);
  assert.equal(retry("auto-paused", { masterOff: true }), 0, "every plugin is paused");
  assert.equal(retry("auto-paused", { noCheck: true }), 0, "no check to run");
});

test("the retry and the expanded check are one runner", async () => {
  const r = row("auto-paused", { timeoutSec: 5 });
  r.buttons(t("Try again"))[0].props.onClick();
  await flushPromises();
  // The wait is the one pressing Play gets, floored at eight seconds.
  assert.deepEqual(r.calls, [["p", 8000]]);

  const open = all(r.render()).find((n: N) => n.type === "RowText");
  open?.props.onClick();
  r.render();
  r.buttons(t("Check it works"))[0].props.onClick();
  await flushPromises();
  assert.deepEqual(r.calls, [
    ["p", 8000],
    ["p", 8000],
  ]);
});

test("a retry that ran shows its outcome in place of the message", async () => {
  const r = row("auto-paused", {});
  assert.ok(r.noteText().startsWith("Stopped after {n} failures."));
  r.buttons(t("Try again"))[0].props.onClick();
  await flushPromises();
  r.render();
  assert.equal(r.noteText(), t("No streams came back."));

  const other = row("error", {});
  other.buttons(t("Check it works"));
  assert.equal(other.buttons(t("Try again")).length, 0);
});

test("one refresh runs everything the panel stood down", async () => {
  const checks: unknown[][] = [];
  const adapter = {
    kind: "stream",
    plugins: () => [
      { ...view("auto-paused"), id: "down-1" },
      { ...view("enabled"), id: "working" },
      { ...view("error"), id: "broken" },
      { ...view("update"), id: "outdated" },
      { ...view("auto-paused"), id: "down-2" },
    ],
    check: async (...args: unknown[]) => void checks.push(args),
  };
  const tab = (pluginsEnabled: boolean, kinds: unknown[]) => {
    const h = hookHarness("src/views/settings/plugins-panel/installed-tab.tsx", "InstalledTab", {
      "../icons": names,
      "@/lib/i18n": { useT: () => t },
      "@/lib/plugins": { pluginKinds: () => kinds, usePluginKindsVersion: () => 0 },
      "@/lib/read-at-version": { readAtVersion: (_v: unknown, fn: () => unknown) => fn() },
      "@/lib/settings": {
        useSettings: () => ({ settings: { pluginsEnabled, addonTimeoutSec: 12 }, update() {} }),
      },
      "../kit": names,
      "../shared": names,
      "../ui": names,
      "./copy": { kindLabel: () => "" },
      "./plugin-row": names,
      "react/jsx-runtime": jsx,
    });
    const tree = h.render({ onAddRepository() {} });
    return all(tree)
      .filter((n: N) => n.type === "SettingRow" && n.props.label === t("Refresh all"))
      .flatMap((n: N) => all(n).filter((c: N) => c.type === "SButton"));
  };

  const [refresh] = tab(true, [adapter]);
  refresh.props.onClick();
  await flushPromises();
  assert.deepEqual(checks, [
    ["down-1", 12000],
    ["down-2", 12000],
  ]);

  assert.equal(tab(false, [adapter]).length, 0, "nothing to try while plugins are all paused");
  const none = { ...adapter, plugins: () => [view("enabled")] };
  assert.equal(tab(true, [none]).length, 0, "nothing stood down, nothing offered");
});

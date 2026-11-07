// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { all, treeHarness } from "./helpers/tree-render.ts";
import { settingsViewHarness } from "./helpers/settings-view-harness.ts";

type Spot = { tab: string; anchor: string };
const t = (key: string) => key;
const i18n = { useT: () => t };
const event = { preventDefault() {}, stopPropagation() {} };

/** Renders a component and clicks every button, returning the openSettings calls it made. */
function openSettingsCalls(file: string, name: string, mocks: Record<string, any>, props = {}) {
  const calls: unknown[][] = [];
  const view = {
    useViewActions: () => ({
      openSettings: (...args: unknown[]) => calls.push(args),
      goBack() {},
      setView() {},
      openPerson() {},
      openMeta() {},
    }),
    useScrollMemory() {},
  };
  const h = treeHarness(
    file,
    { "@/lib/view": view, "@/lib/i18n": i18n, ...mocks },
    {
      lenient: true,
      globals: { requestAnimationFrame: () => 0 },
    },
  );
  const tree = h.render({ type: h.exports[name], props });
  for (const el of all(tree)) {
    if (el.type === "button") el.props.onClick?.(event);
    if (typeof el.props.onOpenSettings === "function") el.props.onOpenSettings();
  }
  return calls;
}

/** Renders a settings panel and returns every Section title and SettingGroup label in it. */
function groupTitles(file: string, name: string, mocks: Record<string, any>, props = {}) {
  const h = treeHarness(file, { "@/lib/i18n": i18n, ...mocks }, { lenient: true });
  return all(h.render({ type: h.exports[name], props }))
    .filter((el) => el.type === "Section" || el.type === "SettingGroup")
    .map((el) => el.props.title ?? el.props.label);
}

const onboarding = { useOnboarding: () => ({ isDismissed: () => false, dismiss() {} }) };
const settingsWith = (settings: Record<string, unknown>) => ({
  useSettingsSelector: (pick: (s: object) => unknown) => pick(settings),
  useSettings: () => ({ settings, update() {}, toggleStreaming() {} }),
});
const auth = { useAuth: () => ({ authKey: null }) };

const providerTitles = () =>
  groupTitles("src/views/settings/library-panel/providers-tab.tsx", "ProvidersTab", {
    "@/lib/settings": settingsWith({ songIdProvider: "audd" }),
    "@/lib/auth": auth,
    "@/lib/meta-resource": {
      hasCustomMetaAddon: () => false,
      hasCustomMetaAddonAsync: () => new Promise(() => {}),
    },
    "@/lib/providers/omdb": {
      resetOmdbBudget() {},
      subscribeOmdbBudget: () => () => {},
      omdbBudget: () => ({ used: 0, limit: 1000 }),
    },
    "./provider-keys": { useProviderKeys: () => ({ keyRow: () => null, modals: null }) },
  });

// Each link names the section, tab and Section/SettingGroup title that hold its setting.
const LINKS: { from: () => unknown[][]; spot: [string, Spot]; holder: () => string[] }[] = [
  {
    from: () =>
      openSettingsCalls("src/views/detail/play-mode-hint.tsx", "PlayModeHint", {
        "@/lib/onboarding": onboarding,
        "@/lib/settings": settingsWith({ instantPlay: true }),
      }),
    spot: ["player", { tab: "play", anchor: "Play button behavior" }],
    holder: () =>
      groupTitles("src/views/settings/quality-panel/play-tab.tsx", "PlayTab", {
        "../shared": { ROW_DESC: "", Section: "Section" },
      }),
  },
  {
    from: () =>
      openSettingsCalls("src/components/nudge.tsx", "TmdbNudge", {
        "@/lib/onboarding": onboarding,
        "@/lib/settings": settingsWith({ tmdbKey: "" }),
      }),
    spot: ["library", { tab: "providers", anchor: "Metadata providers" }],
    holder: providerTitles,
  },
  {
    from: () =>
      openSettingsCalls("src/views/people.tsx", "PeopleView", {
        "@/lib/harbor-rank": { fetchRankManifest: () => new Promise(() => {}) },
        "@/lib/people-rankings": {
          isHarborExplanation: () => false,
          usePeopleRankings: () => ({ status: "ready", people: [] }),
        },
        "./people/people-tier-band": { PeopleJumpIndex: "PeopleJumpIndex", presentBands: () => [] },
      }),
    spot: ["library", { tab: "providers", anchor: "Metadata providers" }],
    holder: providerTitles,
  },
  {
    from: () =>
      openSettingsCalls(
        "src/views/play-picker/no-sources-modal.tsx",
        "NoSourcesConfiguredModal",
        {},
        {
          meta: { name: "Dune" },
        },
      ),
    spot: ["streaming", { tab: "services", anchor: "Debrid services" }],
    holder: () =>
      groupTitles("src/views/settings/streaming-sources-panel/debrid-tab.tsx", "DebridTab", {
        "@/lib/settings": settingsWith({ streaming: [] }),
        "@/lib/auth": auth,
        "@/lib/providers/streaming": { SERVICES: [] },
      }),
  },
];

test("settings deep links land on the row that holds their setting", () => {
  for (const { from, spot, holder } of LINKS) {
    assert.deepEqual(from(), [spot]);
    assert.ok(
      holder().includes(spot[1].anchor),
      `${spot[0]} should title a group "${spot[1].anchor}"`,
    );
  }
  assert.ok(
    groupTitles(
      "src/views/settings/player-panel/p2p-advanced-section.tsx",
      "P2PPowerToolsSection",
      {
        "@/lib/settings": settingsWith({}),
        "@/lib/torrent/local-engine": {},
      },
    ).includes("P2P streaming"),
  );
});

test("the source picker's P2P notice opens the engine tab at P2P streaming", () => {
  // play-picker.tsx is too large to render here, so this pins its one wiring line.
  const picker = readFileSync(new URL("../src/views/play-picker.tsx", import.meta.url), "utf8");
  assert.ok(
    picker.includes(
      'onClick={() => openSettings("p2p", { tab: "engine", anchor: "P2P streaming" })}',
    ),
  );
});

test("an open-settings request with a spot is routed through the anchor jump", async () => {
  const page = await settingsViewHarness({
    section: "library",
    spot: { tab: "providers", anchor: "Metadata providers" },
  });
  page.rerender();
  assert.deepEqual(page.panels(), ["LibraryPanel"]);
  assert.deepEqual(page.anchors.at(-1)?.[2], {
    anchor: "anchor:Metadata providers",
    tab: "providers",
  });
});

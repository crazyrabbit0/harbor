// Renders the real Settings page (`views/settings.tsx`) with its panels as named lazy stand-ins.
import { TOP_GROUPS, groupForSection } from "../../src/views/settings/groups.ts";
import { all, named, treeHarness } from "./tree-render.ts";

export const anchorOf = (title: string) => `anchor:${title}`;

type Request = { section?: string; spot?: { tab?: string; anchor?: string } };

export async function settingsViewHarness(request: Request = {}) {
  const anchors: unknown[][] = [];
  const trackers: string[] = [];
  const view = { settingsSectionRequest: request, topKind: "settings", chromeHidden: false };
  const h = treeHarness(
    "src/views/settings.tsx",
    {
      "./settings/nav": named,
      "./settings/groups": { TOP_GROUPS, groupForSection },
      "./settings/tracker-request": { requestTracker: (id: string) => trackers.push(id) },
      "./settings/sub-tabs": { SubTabsProvider: "SubTabsProvider" },
      "./settings/tab-registry": { tabsFor: () => [] },
      "./settings/anchor-navigation": {
        glideSettingsToTop: () => () => {},
        useSettingsAnchor: (...args: unknown[]) => anchors.push(args),
      },
      "./settings/page-actions": { PageActionsProvider: "PageActionsProvider" },
      "./settings/shared": {
        SettingsActiveContext: { Provider: "SettingsActiveContext.Provider" },
        settingsAnchor: anchorOf,
      },
      "./settings/tv-panel/store": {},
      "./settings/theme-panel/library-open-store": { useThemeLibraryOpen: () => false },
      "@/lib/settings": { useSettings: () => ({ settings: { theme: {} }, update() {} }) },
      "@/lib/view": { useView: () => view },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/use-media-query": { useMediaQuery: () => false },
      "@/lib/providers/omdb": { resetOmdbBudget() {} },
      "@/lib/keyboard-navigation/geometry": { isBackKey: () => false },
    },
    {
      lenient: true,
      globals: {
        window: {
          addEventListener() {},
          removeEventListener() {},
          setTimeout: () => 0,
          clearTimeout() {},
        },
        requestAnimationFrame: () => 0,
      },
    },
  );
  const root = { type: h.exports.Settings, props: {} };
  let tree = h.render(root);
  await new Promise((resolve) => setImmediate(resolve));
  const find = (type: string) => all(tree).find((el) => el.type === type);
  const panels = () =>
    all(tree)
      .map((el) => el.type?.resolved)
      .filter((name): name is string => typeof name === "string" && /Panel$|Stub$/.test(name));
  return {
    anchors,
    trackers,
    rerender: () => (tree = h.render(root)),
    /** The section-jump handler Settings hands its search box. */
    jump: (...args: unknown[]) => find("SettingsTools")!.props.onSubmit(...args),
    /** Registers sub-tabs for a section the way a panel's useSubTabs does. */
    registerTabs: (reg: unknown) => find("SubTabsProvider")!.props.value.setReg(reg),
    panels,
  };
}

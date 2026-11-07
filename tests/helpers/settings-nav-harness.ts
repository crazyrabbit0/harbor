// Runs the real settings search (`views/settings/nav.tsx`) with its stores stubbed.
import { TOP_GROUPS } from "../../src/views/settings/groups.ts";
import { settingsOptionBuilt } from "../../src/views/settings/option-features.ts";
import * as searchMatch from "../../src/views/settings/search-match.ts";
import { all, treeHarness } from "./tree-render.ts";

export type Option = {
  label: string;
  section: string;
  tab?: string;
  anchorTitle?: string;
  keywords?: string[];
};

export const anchorOf = (title: string) => `anchor:${title}`;

export function settingsNavHarness() {
  const h = treeHarness(
    "src/views/settings/nav.tsx",
    {
      "@/lib/settings": { useSettings: () => ({ settings: { theme: {} } }) },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/theme": { activeLayout: () => "sidebar" },
      "@/lib/view": { useView: () => ({ goBack() {}, canGoBack: false, setView() {} }) },
      "./search-match": searchMatch,
      "./shared": { settingsAnchor: anchorOf },
      "./groups": { TOP_GROUPS },
      "./settings-new": { markSectionSeen() {}, useSettingsNew: () => () => false },
      "@/lib/updater/experimental-access": { useExperimentalAccess: () => false },
      "@/lib/app-features": { appFeatures: () => ({ games: true, music: true }) },
      "./option-features": { settingsOptionBuilt },
      "@/lib/plugins": { useStreamPluginCount: () => 0 },
    },
    { expose: ["SETTINGS_OPTIONS"] },
  );
  const options = h.exports.SETTINGS_OPTIONS as Option[];
  /** Types the query into the settings search box and presses Enter; returns what was submitted. */
  function submit(query: string) {
    const calls: unknown[][] = [];
    const tools = h.render({
      type: h.exports.SettingsTools,
      props: { query, setQuery() {}, onSubmit: (...args: unknown[]) => calls.push(args) },
    });
    const input = all(tools).find((el) => el.type === "input")!;
    input.props.onKeyDown({ key: "Enter" });
    return calls;
  }
  const search = (query: string) =>
    h.run(() => h.exports.useNavSearch(query.trim().toLowerCase())) as {
      matches: { id: string }[] | null;
      optionMatches: Option[] | null;
    };
  return { options, submit, search };
}

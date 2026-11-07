// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";
import * as quality from "../src/components/player/stream-switcher/quality.ts";
// @ts-expect-error The search indexer is a plain .mjs module.
import { settingsSearchEntries } from "../scripts/settings-search-entries.mjs";
import { hookHarness } from "./helpers/hook-harness.ts";
import { all, jsx, names } from "./helpers/plugin-ui-tree.ts";

const at = (path: string) => new URL(`../${path}`, import.meta.url);
const i18n = { useT: () => (key: string) => key };

// play-picker.tsx is too large to load, so its JSX is read as a syntax tree.
test("source mode stays reachable before either picker layout renders", () => {
  const source = readFileSync(at("src/views/play-picker.tsx"), "utf8");
  const tree = ts.createSourceFile(
    "p.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const toggles: ts.JsxSelfClosingElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "StreamModeToggle")
      toggles.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(toggles.length, 1, "the picker renders one shared source-mode control");
  // No enclosing ternary or && guard depends on the picker layout.
  for (let n: ts.Node = toggles[0]; n; n = n.parent) {
    const guard = ts.isConditionalExpression(n)
      ? n.condition
      : ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        ? n.left
        : null;
    assert.ok(!guard?.getText(tree).includes("pickerLayout"), "not inside a layout branch");
  }
  const mode = toggles[0].attributes.properties.find((p) => p.name?.getText(tree) === "mode");
  assert.equal(mode?.getText(tree), "mode={settings.streamMode}");
});

test("source mode can also be repaired from normal settings", () => {
  const settings = { pickerLayout: "condensed", streamMode: "addons" };
  const updates: unknown[] = [];
  const h = hookHarness("src/views/settings/streaming-sources-panel/picker-tab.tsx", "PickerTab", {
    "react/jsx-runtime": jsx,
    "./picker-layout-preview": names,
    "@/lib/settings": {
      useSettings: () => ({ settings, update: (p: unknown) => updates.push(p) }),
    },
    "@/lib/keyboard-navigation": { tvHover() {} },
    "../shared": { Section: "Section", Segmented: "Segmented", ToggleRow: "ToggleRow" },
    "../kit": { SettingRow: "SettingRow" },
    "@/lib/i18n": i18n,
  });
  const section = all(h.render()).find(
    (n) => n.type === "Section" && n.props.title === "Source mode",
  );
  assert.ok(section, "the picker tab has a Source mode section");
  const control = all(section.props.children).find((n) => n.type === "Segmented");
  assert.ok(control);
  assert.equal(control.props.value, "addons");
  assert.deepEqual(
    control.props.options.map((o: { value: string }) => o.value),
    ["both", "addons", "p2p"],
  );
  control.props.onChange("both");
  assert.deepEqual(updates, [{ streamMode: "both" }]);

  const entries = settingsSearchEntries(readFileSync(at("src/views/settings/nav.tsx"), "utf8"));
  const entry = entries.find((e: { anchor?: string }) => e.anchor === "Source mode");
  assert.ok(entry, "settings search lands on the Source mode section");
  assert.equal(entry.section, "streaming");
  assert.equal(entry.tab, "picker");
});

test("source-mode controls describe transport instead of calling every source an addon", () => {
  const toggle = hookHarness("src/components/stream-mode-toggle.tsx", "StreamModeToggle", {
    "react/jsx-runtime": jsx,
    "@/lib/i18n": i18n,
  });
  const picked: string[] = [];
  const buttons = all(
    toggle.render({ mode: "addons", onChange: (m: string) => picked.push(m) }),
  ).filter((n) => n.type === "button");
  const addons = buttons.find((n) => n.props["aria-pressed"] === true);
  assert.equal(addons?.props.children, "Direct/debrid");
  addons?.props.onClick();
  assert.deepEqual(picked, ["addons"]);

  const modes: string[] = [];
  const menu = hookHarness(
    "src/components/player/stream-switcher/filters-menu.tsx",
    "FiltersMenu",
    {
      "react/jsx-runtime": jsx,
      "lucide-react": names,
      "@/components/addon-logo": names,
      "@/components/format-badge": names,
      "@/lib/i18n": i18n,
      "./lang-utils": { abbreviateLanguages: () => "" },
      "./quality": quality,
    },
    { window: { addEventListener() {}, removeEventListener() {} } },
  );
  const filters = {
    mode: "both",
    setMode: (m: string) => modes.push(m),
    quality: "all",
    qualityOptions: [],
    source: "all",
    sourceOptions: [],
    addon: "all",
    addonOptions: [],
    addonLogos: new Map(),
    preferredLangs: [],
    langHidden: 0,
    rejectedCount: 0,
  };
  all(menu.render({ filters }))
    .find((n) => n.type === "button")
    ?.props.onClick();
  const chip = all(menu.render({ filters })).find(
    (n) => typeof n.type === "function" && n.props.children === "Direct/debrid",
  );
  assert.ok(chip, "the switcher's addons-mode chip is labelled Direct/debrid");
  chip.props.onClick();
  assert.deepEqual(modes, ["addons"]);

  const streamModes: string[] = [];
  const s = {
    streamMode: "addons",
    setStreamMode: (m: string) => streamModes.push(m),
    qualityChips: [],
    debrids: [],
    facets: [],
    preferredLangs: [],
    customFilters: [],
    addonOptions: [],
    addonFilter: "all",
    localFiles: [],
    homeServerCopies: [],
    total: 3,
  };
  const chips = hookHarness("src/views/big-picture/bp-stream-chips.tsx", "BpStreamChips", {
    "react/jsx-runtime": jsx,
    "lucide-react": names,
    "@/components/player/stream-switcher/quality": quality,
    "@/views/play-picker/picker-utils": { abbreviateLanguages: () => "" },
    "./bp-i18n": { useBpT: i18n.useT },
    "./bp-library-chips": { BP_CHIP_EDGE_MASK: "", BpChip: "BpChip", BpChipDivider: "Divider" },
    "./bp-stream-menu": { BpStreamMenu: "BpStreamMenu" },
  });
  const props = { s, sourceKind: "online", onSourceKind() {}, onClose() {} };
  const source = all(chips.render(props)).find(
    (n) => n.type === "BpChip" && n.props.label === "Direct/debrid only",
  );
  assert.ok(source, "Big Picture names the addons mode Direct/debrid only");
  source.props.onSelect();
  const options = all(chips.render(props)).find((n) => n.type === "BpStreamMenu")?.props.options;
  const option = options.find((o: { id: string }) => o.id === "addons");
  assert.equal(option.label, "Direct/debrid only");
});

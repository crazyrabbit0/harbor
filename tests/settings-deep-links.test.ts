// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Each link must name the section, tab and Section/SettingGroup title that actually hold its setting.
const LINKS: [file: string, call: string, holder: string, title: string][] = [
  [
    "src/views/play-picker.tsx",
    'openSettings("p2p", { tab: "engine", anchor: "P2P streaming" })',
    "src/views/settings/player-panel/p2p-advanced-section.tsx",
    "P2P streaming",
  ],
  [
    "src/views/detail/play-mode-hint.tsx",
    'openSettings("player", { tab: "play", anchor: "Play button behavior" })',
    "src/views/settings/quality-panel/play-tab.tsx",
    "Play button behavior",
  ],
  [
    "src/components/nudge.tsx",
    'openSettings("library", { tab: "providers", anchor: "Metadata providers" })',
    "src/views/settings/library-panel/providers-tab.tsx",
    "Metadata providers",
  ],
  [
    "src/views/people.tsx",
    'openSettings("library", { tab: "providers", anchor: "Metadata providers" })',
    "src/views/settings/library-panel/providers-tab.tsx",
    "Metadata providers",
  ],
  [
    "src/views/play-picker/no-sources-modal.tsx",
    'openSettings("streaming", { tab: "services", anchor: "Debrid services" })',
    "src/views/settings/streaming-sources-panel/debrid-tab.tsx",
    "Debrid services",
  ],
];

test("settings deep links land on the row that holds their setting", () => {
  for (const [file, call, holder, title] of LINKS) {
    const src = read(file).replace(/\s+/g, " ");
    assert.ok(src.includes(call), `${file} should call ${call}`);
    assert.ok(read(holder).includes(`t("${title}")`), `${holder} should title a group "${title}"`);
  }
});

test("an open-settings request with a spot is routed through the anchor jump", () => {
  const settings = read("src/views/settings.tsx");
  assert.match(
    settings,
    /handleNav\(section, spot\.anchor \? settingsAnchor\(spot\.anchor\) : undefined, spot\.tab\)/,
  );
});

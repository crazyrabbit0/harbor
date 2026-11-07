// @ts-expect-error Node test types are outside the browser tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are outside the browser tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are outside the browser tsconfig.
import test from "node:test";
import { hookHarness, loadModule } from "./helpers/hook-harness.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
// Exercise the real selection function with isolated local-resume state.
const { resumeDefaultSeason: selectSeason } = loadModule("src/lib/episode-progress.ts", {
  "@/lib/manual-watched": { manualWatchedState: () => undefined },
  "@/lib/resume": { lastPlayedEpisode: () => null, readResumeEntry: () => null },
});
const seasons = [1, 2, 3].map((seasonNumber) => ({ seasonNumber, episodeCount: 10 }));

test("season selection starts new series at the first regular season", () => {
  assert.equal(selectSeason("series", seasons, new Set()), 1);
});

test("season selection uses later watch progress without a local resume entry", () => {
  assert.equal(selectSeason("series", seasons, new Set(["2:1"])), 2);
});

test("nine watched episodes out of ten do not skip the season finale", () => {
  const watched = new Set(Array.from({ length: 9 }, (_, i) => `1:${i + 1}`));
  assert.equal(selectSeason("series", seasons, watched, 1), 1);
  watched.add("1:10");
  assert.equal(selectSeason("series", seasons, watched, 1), 2);
});

test("explicit valid resume season wins over watched-season inference", () => {
  assert.equal(selectSeason("series", seasons, new Set(["2:1"]), 3), 3);
});

test("HLS reconnect options never retry normal streamed EOF", () => {
  for (const path of ["src-tauri/src/mpv.rs", "src-tauri/livetv/src/multiview.rs"]) {
    assert.doesNotMatch(read(path), /reconnect_streamed=1/);
    assert.match(read(path), /reconnect=1/);
  }
  assert.match(read("src-tauri/src/mpv.rs"), /"demuxer-cache-dir"/);
});

const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: "fragment" };
type Node = { type: unknown; props: Record<string, any> };
const elements = (node: unknown, out: Node[] = []): Node[] => {
  if (Array.isArray(node)) node.forEach((child) => elements(child, out));
  else if (node && typeof node === "object" && "props" in node) {
    out.push(node as Node);
    elements((node as Node).props.children, out);
  }
  return out;
};
const stub = () => null;

function webhooksPanel(desktopEnabled: boolean) {
  let selectTab: (id: string) => void = () => {};
  const RuleBuilder = () => null;
  const DesktopNotifyField = () => null;
  const settings = {
    webhooks: {
      desktopEnabled,
      discordUrl: "",
      telegramUrl: "",
      sources: {},
      notifyMovies: true,
      notifyTv: true,
      notifyAnime: true,
    },
    webhookRules: [],
    customCalendar: { trackedPeople: [] },
  };
  const harness = hookHarness("src/views/settings/webhooks-panel.tsx", "WebhooksPanel", {
    "react/jsx-runtime": jsxRuntime,
    "./sub-tabs": {
      useSubTabs: (_tabs: unknown, _value: string, onChange: (id: string) => void) => {
        selectTab = onChange;
      },
    },
    "./icons": {},
    "@/assets/trakt.svg": { default: "trakt.svg" },
    "@/lib/calendar": { fireWebhook: async () => ({ ok: true }) },
    "@/lib/auth": { useAuth: () => ({ authKey: null }) },
    "@/lib/settings": { useSettings: () => ({ settings, update: () => {} }) },
    "@/lib/trakt/provider": { useTrakt: () => ({ isConnected: false }) },
    "@/lib/i18n": { useT: () => (text: string) => text },
    "./shared": { Section: stub, ToggleRow: stub },
    "./webhooks-panel/rule-builder": { RuleBuilder },
    "./webhooks-panel/webhook-field": {
      DiscordMark: stub,
      DiscordTutorial: stub,
      WebhookField: stub,
    },
    "./webhooks-panel/telegram-field": { TelegramComposedField: stub },
    "./webhooks-panel/desktop-field": { DesktopNotifyField },
  });
  const find = (type: unknown) => elements(harness.render()).find((node) => node.type === type);
  harness.render();
  selectTab("rules");
  return { builder: find(RuleBuilder), destinations: () => find(DesktopNotifyField) };
}

function ruleEditor(channels: Record<string, boolean>, can: Record<string, boolean>) {
  let saveDisabled: boolean | undefined;
  const harness = hookHarness(
    "src/views/settings/webhooks-panel/rule-builder.tsx",
    "RuleEditor",
    {
      "react/jsx-runtime": jsxRuntime,
      "../icons": {},
      "@/lib/i18n": { useT: () => (text: string) => text },
      "@/lib/feed/tags": { MOVIE_GENRES: {} },
      "@/lib/keyboard-navigation": { tvFocus: () => {} },
      "@/lib/keyboard-navigation/geometry": { navOwnsFocus: () => false },
      "@/components/dropdown": { Dropdown: stub },
      "../shared": { ROW_DESC: "", Section: stub, Segmented: stub, ToggleRow: stub },
      "../kit": {
        ModalButton: stub,
        ROW_ACTION_DANGER: "",
        SettingGroup: stub,
        SettingRow: stub,
        SettingsModal: stub,
      },
      "../page-actions": {
        usePageActions: (actions: Array<{ id: string; disabled?: boolean }>) => {
          saveDisabled = actions.find((action) => action.id === "webhook-rule-save")?.disabled;
        },
      },
      "../ui": { SButton: stub, SRow: stub },
    },
    {},
    ["RuleEditor"],
  );
  harness.render({
    rule: {
      id: "r1",
      name: "",
      enabled: true,
      trigger: { event: "newMovie" },
      channels: { discord: false, telegram: false, desktop: false, ...channels },
    },
    isNew: true,
    trackedPeople: [],
    canDiscord: !!can.discord,
    canTelegram: !!can.telegram,
    canDesktop: !!can.desktop,
    nameRef: { current: null },
    onSave: () => {},
    onDelete: () => {},
    onCancel: () => {},
  });
  return saveDisabled;
}

test("desktop rule integration retains destination setup and available-channel guards", () => {
  for (const desktopEnabled of [true, false]) {
    const panel = webhooksPanel(desktopEnabled);
    assert.equal(panel.builder?.props.canDesktop, desktopEnabled);
    assert.equal(panel.destinations(), undefined);
    panel.builder?.props.onSetUp();
    assert.ok(panel.destinations(), "Set up a destination returns to the Destinations tab");
  }
  const all = { discord: true, telegram: true, desktop: true };
  assert.equal(ruleEditor({}, all), true, "a rule with no channel cannot be saved");
  for (const channel of ["discord", "telegram", "desktop"]) {
    assert.equal(ruleEditor({ [channel]: true }, all), false, `${channel} alone is enough`);
    assert.equal(
      ruleEditor({ [channel]: true }, { ...all, [channel]: false }),
      true,
      `${channel} counts only once it is set up`,
    );
  }
});

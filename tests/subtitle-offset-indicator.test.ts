// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import * as offsetLib from "../src/lib/player/subtitle-offset.ts";
import { DEFAULT } from "../src/lib/settings/defaults.ts";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import { keyboardShortcutsHarness } from "./helpers/keyboard-shortcuts-harness.ts";

const { formatSubtitleOffset, sanitizeSubtitleOffsetPosition, sanitizeSubtitleOffsetSize } =
  offsetLib;

type Node = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: Node["props"]) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const all = (node: unknown): Node[] => {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!node || typeof node !== "object") return [];
  return [node as Node, ...all((node as Node).props?.children)];
};
const text = (node: unknown): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(text).join("")
      : node && typeof node === "object"
        ? text((node as Node).props?.children)
        : "";
const t = (s: string) => s;

test("subtitle offsets are displayed as signed milliseconds", () => {
  assert.equal(formatSubtitleOffset(0.3), "+300 ms");
  assert.equal(formatSubtitleOffset(-0.05), "-50 ms");
  assert.equal(formatSubtitleOffset(0), "0 ms");
});

test("both subtitle delay shortcuts apply and show the current offset", async () => {
  const k = keyboardShortcutsHarness({}, { subDelaySec: 0.2 });
  await flushPromises();
  assert.equal(k.render().subtitleOffsetSec, null);
  k.key("keydown", { key: "z", code: "KeyZ" });
  assert.equal(k.render().subtitleOffsetSec, 0.1);
  k.key("keydown", { key: "x", code: "KeyX" });
  assert.equal(k.render().subtitleOffsetSec, 0.3);
  k.key("keydown", { key: "X", code: "KeyX", shiftKey: true });
  assert.deepEqual(k.calls, ["sub-delay 0.1", "sub-delay 0.3"], "shift+x is a different binding");
  const hide = k.timers.at(-1)!;
  assert.equal(hide.ms, 1800);
  hide.fn();
  assert.equal(k.render().subtitleOffsetSec, null, "the readout hides after its timer");
});

function indicator(settings: Record<string, unknown>, delaySec: number | null, preview = false) {
  const root = hookHarness(
    "src/components/player/subtitle-offset-indicator.tsx",
    "SubtitleOffsetIndicator",
    {
      "lucide-react": { Captions: "Captions" },
      "@/lib/i18n": { useT: () => t },
      "@/lib/player/subtitle-offset": offsetLib,
      "@/lib/settings": {
        useSettingsSelector: (select: (s: unknown) => unknown) =>
          select({
            subOffsetIndicatorEnabled: DEFAULT.subOffsetIndicatorEnabled,
            subOffsetIndicatorPosition: DEFAULT.subOffsetIndicatorPosition,
            subOffsetIndicatorSize: DEFAULT.subOffsetIndicatorSize,
            ...settings,
          }),
      },
      "react/jsx-runtime": jsx,
    },
  ).render({ delaySec, preview }) as Node;
  return { root, inner: root.props.children as Node };
}

test("the indicator shows the offset only while one is set and the setting is on", () => {
  const shown = indicator({}, -0.05);
  assert.equal(shown.root.props["aria-hidden"], false);
  assert.match(text(shown.root), /-50 ms/);
  assert.match(shown.inner.props.className, /opacity-100/);
  const hidden = indicator({}, null);
  assert.equal(hidden.root.props["aria-hidden"], true);
  assert.match(hidden.inner.props.className, /translate-y-2 opacity-0/, "it rises in from below");
  assert.match(hidden.inner.props.className, /motion-reduce:transition-none/);
  assert.equal(
    indicator({ subOffsetIndicatorEnabled: false }, 0.3).root.props["aria-hidden"],
    true,
  );
  const preview = indicator({ subOffsetIndicatorEnabled: false }, 0.3, true);
  assert.equal(preview.root.props["aria-hidden"], false, "the settings preview always shows");
  assert.equal(preview.root.props.role, undefined, "the preview is not announced");
  assert.equal(shown.root.props.role, "status");
});

test("the indicator follows the position and size settings", () => {
  assert.match(indicator({}, 0.1).root.props.className, /bottom-32 left-1\/2 -translate-x-1\/2/);
  assert.match(
    indicator({ subOffsetIndicatorPosition: "top-right" }, 0.1).root.props.className,
    /right-8 top-24/,
  );
  assert.match(
    indicator({ subOffsetIndicatorPosition: "top-right" }, 0.1, true).root.props.className,
    /right-4 top-4/,
  );
  const size = (s: string) =>
    all(indicator({ subOffsetIndicatorSize: s }, 0.1).root).find((n) => n.type === "Captions")!
      .props.size;
  assert.deepEqual([size("small"), size("medium"), size("large")], [14, 17, 20]);
});

test("the player stage shows the indicator outside picture-in-picture", () => {
  const Indicator = "SubtitleOffsetIndicator";
  const SyncBar = "SubSyncBar";
  const stage = (pipMode: boolean) =>
    all(
      hookHarness("src/views/player/stage-overlays.tsx", "StageOverlays", {
        "@/components/player/anime4k-indicator": { Anime4kIndicator: "Anime4k" },
        "@/components/player/svp-indicator": { SvpIndicator: "Svp" },
        "@/components/player/stats-overlay": { StatsOverlay: "Stats" },
        "@/components/player/subtitle-offset-indicator": { SubtitleOffsetIndicator: Indicator },
        "@/components/player/sub-style-bar": { SubStyleBar: "SubStyleBar" },
        "@/components/player/picture-bar": { PictureBar: "PictureBar" },
        "@/components/player/sub-sync-bar": { SubSyncBar: SyncBar },
        "@/components/player/subtitle-overlay": { SubtitleOverlay: "SubtitleOverlay" },
        "@/components/player/volume-indicator": { VolumeIndicator: "Volume" },
        "@/components/player/speed-indicator": { SpeedIndicator: "Speed" },
        "@/components/player/action-indicator": { ActionIndicator: "Action" },
        "@/components/player/content-advisory-toast": { ContentAdvisoryToast: "Toast" },
        "@/lib/i18n": { useT: () => t },
        "@/lib/player/captions-popout-state": { useCaptionsPopoutOpen: () => false },
        "@/components/player/content-advisory-prompt": { ContentAdvisoryPrompt: "Prompt" },
        "react/jsx-runtime": jsx,
      }).render({
        snap: { ...emptySnapshot, subDelaySec: 0.1 },
        engine: "mpv",
        pipMode,
        subtitleOffsetSec: 0.4,
        holdSpeedActive: false,
        volumeIndicator: {},
        speedIndicator: {},
        actionIndicator: {},
        contentAdvisory: { categories: [], playKey: "", imdbId: null },
      }),
    );
  const nodes = stage(false);
  assert.equal(nodes.find((n) => n.type === Indicator)!.props.delaySec, 0.4);
  assert.equal(nodes.find((n) => n.type === SyncBar)!.props.delaySec, 0.1);
  assert.equal(
    stage(true).find((n) => n.type === Indicator),
    undefined,
  );
});

function syncBar(initialDelaySec: number, delaySec: number) {
  const applied: number[] = [];
  const h = hookHarness(
    "src/components/player/sub-sync-bar.tsx",
    "SubSyncBar",
    {
      "lucide-react": { Check: "Check", RotateCcw: "RotateCcw", Type: "Type", X: "X" },
      "@/lib/i18n": { useT: () => t },
      "@/lib/player/sub-sync": {
        closeSyncBar: () => {},
        useSyncBarState: () => ({ open: true, initialDelaySec }),
      },
      "./autosync/autosync-popover": { AutosyncPopover: "AutosyncPopover" },
      "./autosync/autosync-store": { useAutoSyncHandle: () => null },
      "react/jsx-runtime": jsx,
    },
    {
      window: {
        setTimeout: () => 1,
        clearTimeout() {},
        addEventListener() {},
        removeEventListener() {},
      },
    },
  );
  const nodes = all(h.render({ delaySec, onDelay: (s: number) => applied.push(s) }));
  return { nodes, applied };
}

test("the open subtitle sync bar follows keyboard offset changes", () => {
  const bar = syncBar(0.2, 0.5);
  const display = bar.nodes.find(
    (n) => typeof n.type === "function" && n.type.name === "DelayDisplay",
  );
  assert.equal(display!.props.value, 0.5, "the live delay, not the value it opened with");
  const discard = bar.nodes.find((n) => n.props["aria-label"] === "Discard changes");
  assert.ok(discard, "a changed offset can be discarded");
  discard!.props.onClick();
  assert.deepEqual(bar.applied, [0.2], "discard restores the offset the bar opened with");
  const step = bar.nodes.find((n) => n.props.label === "+0.1s")!;
  step.props.onClick();
  assert.equal(bar.applied.at(-1), 0.6, "steps start from the live offset");
  assert.equal(
    syncBar(0.5, 0.5).nodes.find((n) => n.props["aria-label"] === "Discard changes"),
    undefined,
  );
});

test("the sync bar opens with the live offset", async () => {
  const opened: number[] = [];
  const h = hookHarness(
    "src/components/player/subtitle-menu/sync-control.tsx",
    "SyncControl",
    {
      "lucide-react": { AudioLines: "a", ChevronDown: "c", Loader2: "l" },
      "@/components/ui-icon": { UiIcon: "UiIcon" },
      "@/components/player/autosync/autosync-store": { useAutoSyncHandle: () => null },
      "@/lib/i18n": { useT: () => t },
      "@/lib/player/sub-sync": { openSyncBar: (s: number) => opened.push(s) },
      "react/jsx-runtime": jsx,
    },
    { window: { addEventListener() {}, removeEventListener() {} } },
  );
  const props = {
    canAutoSync: false,
    canLiveSync: false,
    delaySec: -0.7,
    delayNonZero: true,
    onClose() {},
  };
  all(h.render(props))
    .find((n) => n.props["aria-expanded"] === false)!
    .props.onClick();
  const manual = all(h.render(props)).find(
    (n) => text(n).startsWith("Manual offset") && n.type === "button",
  );
  manual!.props.onClick();
  assert.deepEqual(opened, [-0.7]);

  const store = hookHarness("src/lib/player/sub-sync.ts", "useSyncBarState", {});
  const { openSyncBar, closeSyncBar } = store.exports;
  openSyncBar(0.4);
  openSyncBar(0.9);
  assert.deepEqual(store.render(), { open: true, initialDelaySec: 0.4 }, "reopening keeps it");
  closeSyncBar();
  assert.equal(store.render().open, false);
  openSyncBar(-0.2);
  assert.deepEqual(store.render(), { open: true, initialDelaySec: -0.2 });
});

test("subtitle offset settings sanitize to safe position and size choices", async () => {
  assert.equal(sanitizeSubtitleOffsetPosition("top-left"), "top-left");
  assert.equal(sanitizeSubtitleOffsetPosition("right"), "right");
  assert.equal(sanitizeSubtitleOffsetPosition("floating"), "bottom");
  assert.equal(sanitizeSubtitleOffsetSize("large"), "large");
  assert.equal(sanitizeSubtitleOffsetSize("huge"), "medium");

  assert.equal(DEFAULT.subOffsetIndicatorEnabled, true);
  assert.equal(DEFAULT.subOffsetIndicatorPosition, "bottom");
  assert.equal(DEFAULT.subOffsetIndicatorSize, "medium");
  const { loadStoredSettings } = await import("../src/lib/settings/load.ts");
  localStorage.setItem(
    "test.sub-offset",
    JSON.stringify({ subOffsetIndicatorPosition: "floating", subOffsetIndicatorSize: "huge" }),
  );
  const loaded = loadStoredSettings("test.sub-offset");
  assert.deepEqual(
    [loaded.subOffsetIndicatorPosition, loaded.subOffsetIndicatorSize],
    ["bottom", "medium"],
  );
  localStorage.setItem(
    "test.sub-offset",
    JSON.stringify({ subOffsetIndicatorPosition: "top-left", subOffsetIndicatorSize: "large" }),
  );
  const kept = loadStoredSettings("test.sub-offset");
  assert.deepEqual(
    [kept.subOffsetIndicatorPosition, kept.subOffsetIndicatorSize],
    ["top-left", "large"],
  );
});

test("subtitle settings expose a preview, nine positions, and three sizes", () => {
  const patches: unknown[] = [];
  const render = (enabled: boolean) =>
    all(
      hookHarness(
        "src/views/settings/player-panel/subtitle-offset-settings.tsx",
        "SubtitleOffsetSettings",
        {
          "../icons": { Captions: "Captions" },
          "@/components/player/subtitle-offset-indicator": { SubtitleOffsetIndicator: "Indicator" },
          "@/lib/i18n": { useT: () => t },
          "@/lib/player/subtitle-offset": {},
          "@/lib/settings": {
            useSettings: () => ({
              settings: {
                subOffsetIndicatorEnabled: enabled,
                subOffsetIndicatorPosition: "top",
                subOffsetIndicatorSize: "medium",
              },
              update: (p: unknown) => patches.push(p),
            }),
          },
          "../shared": { Segmented: "Segmented", ToggleRow: "ToggleRow" },
          "../kit": { SettingGroup: "SettingGroup" },
          "react/jsx-runtime": jsx,
        },
      ).render(),
    );
  assert.equal(
    render(false).find((n) => n.type === "Indicator"),
    undefined,
  );
  const nodes = render(true);
  assert.deepEqual(
    nodes.filter((n) => n.type === "Indicator").map((n) => [n.props.delaySec, n.props.preview]),
    [[0.3, true]],
  );
  const positions = nodes.filter((n) => n.type === "button" && "aria-pressed" in n.props);
  assert.equal(positions.length, 9);
  assert.deepEqual(positions.filter((n) => n.props["aria-pressed"]).map(text), ["Top"]);
  for (const p of positions) p.props.onClick();
  const sizes = nodes.find((n) => n.type === "Segmented")!;
  assert.deepEqual(
    sizes.props.options.map((o: { value: string }) => o.value),
    ["small", "medium", "large"],
  );
  sizes.props.onChange("large");
  nodes.find((n) => n.type === "ToggleRow")!.props.onChange(false);
  assert.deepEqual(patches, [
    ...[
      "top-left",
      "top",
      "top-right",
      "left",
      "center",
      "right",
      "bottom-left",
      "bottom",
      "bottom-right",
    ].map((v) => ({ subOffsetIndicatorPosition: v })),
    { subOffsetIndicatorSize: "large" },
    { subOffsetIndicatorEnabled: false },
  ]);
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

type Node = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
const element = (type: unknown, props: Node["props"]) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const find = (node: unknown, type: unknown): Node[] => {
  if (Array.isArray(node)) return node.flatMap((n) => find(n, type));
  if (!node || typeof node !== "object") return [];
  const n = node as Node;
  return [...(n.type === type ? [n] : []), ...find(n.props?.children, type)];
};

test("the layout panel's screen-lock toggle reads and writes the setting", () => {
  const patches: unknown[] = [];
  const noop = () => {};
  const ToggleRow = "ToggleRow";
  const render = (enabled: boolean) =>
    hookHarness("src/views/settings/player-layout-panel/index.tsx", "PlayerLayoutPanel", {
      "@/lib/dialog": { confirmDialog: async () => true },
      "@/lib/player-chrome": {},
      "@/lib/settings": {
        useSettings: () => ({
          settings: { playerScreenLockEnabled: enabled },
          update: (patch: unknown) => patches.push(patch),
        }),
      },
      "@/lib/theme": { resolveChromeTheme: () => "harbor" },
      "./config-helpers": { sameConfig: () => true },
      "./editor-overlay": { EditorOverlay: "EditorOverlay" },
      "./options-section": { OptionsSection: "OptionsSection" },
      "./panel-bars": {
        EditLayoutCard: "EditLayoutCard",
        ThemeTabs: "ThemeTabs",
        usePlayerLayoutPageActions: noop,
      },
      "./use-layout-editor": {
        editorOverlayProps: () => ({}),
        useLayoutEditor: () => ({
          draft: { controls: [] },
          setDraft: noop,
          saved: {},
          dirty: false,
          justSaved: false,
          profiles: [],
          activeProfileId: null,
          onSave: noop,
          discard: noop,
          resetAll: noop,
        }),
      },
      "./advisory-preview": { AdvisoryPreview: "AdvisoryPreview" },
      "./advisory-ignore-row": { AdvisoryIgnoreRow: "AdvisoryIgnoreRow" },
      "../player-panel": { SeekBarPanel: "SeekBarPanel" },
      "../theme-panel/fullscreen-clock-settings": { FullscreenClockSettings: "Clock" },
      "../shared": { Section: "Section", Segmented: "Segmented", ToggleRow },
      "@/lib/discord/activity-hint": { pushActivityHint: () => noop },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/onboarding": { CONTENT_ADVISORY_NUDGE: "n", useOnboarding: () => ({ dismiss: noop }) },
      "react/jsx-runtime": jsx,
    }).render();
  const lockRow = (enabled: boolean) =>
    find(render(enabled), ToggleRow).find((row) => row.props.label === "Player screen lock")!;
  assert.equal(lockRow(true).props.value, true);
  assert.equal(lockRow(false).props.value, false);
  (lockRow(false).props.onChange as (v: boolean) => void)(true);
  assert.deepEqual(patches, [{ playerScreenLockEnabled: true }]);
});

test("the HDR overlay blocks input and shows lock controls from the main window's state", async () => {
  const blocker: unknown[] = [];
  const actions: string[] = [];
  let pushPayload: (p: unknown) => void = () => {};
  const noop = () => {};
  const Controls = "PlayerInteractionLockControls";
  const h = hookHarness(
    "src/views/hdr-overlay-app.tsx",
    "HdrOverlayChrome",
    {
      "@/lib/auth": { AuthProvider: "AuthProvider" },
      "@/lib/profiles": { CompanionProfilesProvider: "Profiles" },
      "@/lib/settings": { SettingsProvider: "SettingsProvider" },
      "./player/shell-layer": { ShellLayer: "ShellLayer" },
      "./player/drag-click-stage": { DragClickStage: "DragClickStage" },
      "@/lib/player/bridge": { emptySnapshot },
      "@/lib/player/mpv-forward": {
        createForwardingMpvBridge: () => ({ pushSnapshot: noop }),
      },
      "@/lib/player/subtitle-fps": { buildSubtitleTimingMediaKey: () => "" },
      "@/lib/hdr-overlay": {
        hdrOverlayEmitAction: async (name: string) => actions.push(name),
        onHdrStageProps: async (fn: (p: unknown) => void) => {
          pushPayload = fn;
          return noop;
        },
      },
      "@/lib/view": { PlayerNavigationProvider: "Nav" },
      "@/components/player/player-interaction-lock": { PlayerInteractionLockControls: Controls },
      "./player/hooks/use-player-interaction-lock": {
        usePlayerInteractionBlocker: (args: unknown) => blocker.push(args),
      },
      "react/jsx-runtime": jsx,
    },
    {
      window: {
        location: { search: "?stageId=s1" },
        addEventListener: noop,
        removeEventListener: noop,
        setInterval: () => 1,
        clearInterval: noop,
      },
      document: {
        documentElement: { style: {} },
        body: { style: {} },
        getElementById: () => null,
      },
      performance: { now: () => 0 },
    },
    ["HdrOverlayChrome"],
  );
  assert.equal(
    find(h.render(), Controls).length,
    0,
    "no lock controls before the main window's state",
  );
  await flushPromises();
  const payload = (locked: boolean, controls: boolean) => ({
    stageId: "s1",
    snap: emptySnapshot,
    src: { url: "a.mkv", meta: { id: "tt1" } },
    visible: true,
    screenLockEnabled: true,
    screenLocked: locked,
    screenLockControlsVisible: controls,
    screenLockBinding: "F8",
  });
  pushPayload(payload(true, false));
  const tree = h.render();
  const args = blocker.at(-1) as {
    enabled: boolean;
    locked: boolean;
    binding: string;
    onToggle: () => void;
    onLockedActivity: () => void;
  };
  assert.deepEqual([args.enabled, args.locked, args.binding], [true, true, "F8"]);
  args.onToggle();
  args.onLockedActivity();
  await flushPromises();
  assert.deepEqual(actions.slice(-2), ["hdr-stage://unlock", "hdr-stage://activity"]);

  const controls = find(tree, Controls)[0].props;
  assert.equal(controls.locked, true);
  assert.equal(controls.visible, false, "a locked overlay follows the lock's own idle timer");
  pushPayload(payload(false, false));
  assert.equal(find(h.render(), Controls)[0].props.visible, true, "unlocked follows the chrome");
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as panelSize from "../src/components/player/subtitle-menu/panel-size.ts";
import {
  DEFAULT_SUBTITLE_PANEL_SIZE,
  clampSubtitlePanelSize,
} from "../src/components/player/subtitle-menu/panel-size.ts";
import { marqueeDurationMs } from "../src/components/player/subtitle-menu/marquee-motion.ts";
import { hookHarness } from "./helpers/hook-harness.ts";
import { all, subtitleMenuHarness } from "./helpers/subtitle-addon-harness.ts";

const element = (type: unknown, props: Record<string, any>) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const t = (key: string) => key;
const noop = () => {};

test("subtitle panel keeps its normal size when the viewport has enough room", () => {
  assert.deepEqual(
    clampSubtitlePanelSize(DEFAULT_SUBTITLE_PANEL_SIZE, { width: 1_920, height: 1_080 }),
    DEFAULT_SUBTITLE_PANEL_SIZE,
  );
});

test("subtitle panel is bounded by the player viewport", () => {
  assert.deepEqual(
    clampSubtitlePanelSize({ width: 2_000, height: 2_000 }, { width: 800, height: 600 }),
    { width: 752, height: 480 },
  );
});

test("subtitle panel can still fit on a viewport smaller than its normal minimum", () => {
  assert.deepEqual(
    clampSubtitlePanelSize({ width: 100, height: 100 }, { width: 360, height: 360 }),
    { width: 312, height: 240 },
  );
});

test("subtitle title marquee stays readable at short and long overflow distances", () => {
  assert.equal(marqueeDurationMs(10), 1_200);
  assert.equal(marqueeDurationMs(1_000), 6_000);
});

const classes = (node: { props: Record<string, any> }) =>
  String(node.props.className ?? "").split(/\s+/);

test("the caller positioning stays separate from the panel's relative surface", () => {
  const h = hookHarness(
    "src/components/player/subtitle-menu/resizable-panel.tsx",
    "ResizableSubtitlePanel",
    {
      "lucide-react": { MoveDiagonal2: "MoveDiagonal2" },
      "@/lib/i18n": { useT: () => t },
      "./panel-size": panelSize,
      "react/jsx-runtime": jsx,
    },
    {
      window: {
        innerWidth: 1_920,
        innerHeight: 1_080,
        addEventListener: noop,
        removeEventListener: noop,
      },
      localStorage: { getItem: () => null, setItem: noop },
    },
  );
  const outer = h.render({ className: "fixed end-14", children: "body" });
  const surface = outer.props.children;
  assert.equal(outer.props.className, "fixed end-14");
  assert.deepEqual(outer.props.style, { width: "560px", height: "460px" });
  assert.ok(classes(surface).includes("relative"));
  assert.ok(!classes(surface).includes("fixed"), "the caller's position stays on the outer box");
  assert.ok(all(surface).some((node) => node.type === "button" && node.props.onPointerDown));
});

test("the subtitle header reserves space for the top-left resize handle", () => {
  const h = hookHarness("src/components/player/subtitle-menu/menu-header.tsx", "MenuHeader", {
    "lucide-react": { X: "X" },
    "@/components/ui-icon": { UiIcon: "UiIcon" },
    "@/lib/i18n": { useT: () => t },
    "@/components/player/autosync/autosync-store": { useAutoSyncHandle: () => null },
    "@/components/hover-tooltip": { HoverTooltip: "HoverTooltip" },
    "./subtitle-fps-control": { SubtitleFpsControl: "SubtitleFpsControl" },
    "./sync-control": { SyncControl: "SyncControl" },
    "react/jsx-runtime": jsx,
  });
  const header = h.render({
    engine: "mpv",
    count: 0,
    selectedTrack: null,
    hasSecondary: false,
    delaySec: 0,
    delayNonZero: false,
    onClose: noop,
  });
  assert.equal(header.type, "header");
  assert.ok(classes(header).includes("ps-10"));
});

test("the inline subtitle menu keeps the resize handle instead of using a fixed panel", () => {
  const menu = subtitleMenuHarness([], []);
  const button = all(menu.render({})).find(
    (node) => node.type === "button" && node.props["data-player-subtitles"],
  )!;
  button.props.onClick();
  const panel = all(menu.render({})).find((node) => node.type === "Panel")!;
  assert.deepEqual(classes(panel), ["fixed", "end-14", "bottom-[150px]", "animate-menu-pop"]);
  assert.equal(panel.props.children.type, "MenuBody");
});

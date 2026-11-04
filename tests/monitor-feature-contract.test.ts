// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { AUTO_DISPLAY } from "../src/lib/monitors.ts";
import { mpvStartArgs } from "../src/lib/player/mpv-config.ts";
import { DEFAULT } from "../src/lib/settings/defaults.ts";
import { hookHarness } from "./helpers/hook-harness.ts";
import { playerMediaHarness } from "./helpers/player-media-harness.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const monitorsRs = read("src-tauri/src/monitors.rs");
const mpvRs = read("src-tauri/src/mpv.rs");

// The friendly name must come from DisplayConfig (the EDID string Windows Settings shows), not "Generic PnP Monitor".
test("monitor name resolves via DisplayConfig first, EnumDisplayDevicesW as fallback", () => {
  assert.match(monitorsRs, /DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME/);
  assert.match(monitorsRs, /monitorFriendlyDeviceName/);
  assert.match(
    monitorsRs,
    /let \(dc_name, dc_path\) = display_config_for\(device_name\);[\s\S]*let name = \[dc_name, enum_name\]/,
  );
});

test("generic monitor names are rejected so unnamed displays stay distinguishable", () => {
  assert.match(monitorsRs, /fn is_generic_monitor_name/);
  assert.match(monitorsRs, /generic pnp monitor/);
  assert.match(monitorsRs, /generic non-pnp monitor/);
});

test("monitor resolution captures both the full monitor and the work-area rects", () => {
  assert.match(monitorsRs, /rcMonitor/);
  assert.match(monitorsRs, /rcWork/);
  assert.match(monitorsRs, /pub work_width: u32/);
  assert.match(monitorsRs, /pub work_x: i32/);
});

test("separate mpv window is sized directly and honours the cover-taskbar choice", () => {
  assert.match(mpvRs, /fn size_separate_mpv_window/);
  assert.match(mpvRs, /SWP_FRAMECHANGED/);
  assert.match(mpvRs, /args\.separate_cover_taskbar\.unwrap_or\(true\)/);
  assert.match(mpvRs, /m\.work_width, m\.work_height/);
});

test("HDR display flip is keyed to the session's target monitor, not always main", () => {
  assert.match(mpvRs, /monitor_hdr_active\(m\.hmon\)/);
  assert.match(mpvRs, /fn set_monitor_advanced_color\(\s*hmon:/);
});

test("subtitle surface follows the real embed state, including True HDR separate window", () => {
  const surface = (windows: boolean, settings: Record<string, unknown>) => {
    const h = playerMediaHarness({ windows, settings, bridgeReady: true });
    return { htmlSuppressed: h.result.subAssNative, mpvRenders: h.subVisible.at(-1) };
  };
  assert.deepEqual(surface(true, { playerMpvEmbed: true }), {
    htmlSuppressed: false,
    mpvRenders: false,
  });
  assert.deepEqual(
    surface(true, { playerMpvEmbed: true, playerHdrOpaqueWindow: true }),
    { htmlSuppressed: true, mpvRenders: true },
    "True HDR separate window plays in its own window, so mpv draws the subtitles",
  );
  assert.deepEqual(
    surface(false, { playerMpvEmbed: true, playerHdrOpaqueWindow: true }),
    { htmlSuppressed: false, mpvRenders: false },
    "that mode only exists on Windows",
  );
  assert.deepEqual(surface(false, { playerMpvEmbed: false }), {
    htmlSuppressed: true,
    mpvRenders: true,
  });
  assert.equal(
    playerMediaHarness({ engine: "html5", settings: { playerMpvEmbed: false } }).result.subAssNative,
    false,
  );
});

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

function enginePanel(settings: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  const tree = hookHarness("src/views/settings/player-panel/engine-section.tsx", "PlayerEnginePanel", {
    "../icons": { AlertTriangle: "AlertTriangle" },
    "@/lib/platform": { isMacDesktop: () => false, isWindowsDesktop: () => true },
    "@/lib/player/mpv": { probeMpv: async () => ({ available: true }) },
    "@/lib/settings": {
      useSettings: () => ({ settings, update: (p: Record<string, unknown>) => updates.push(p) }),
    },
    "@/lib/i18n": { useT: () => (s: string) => s },
    "../kit": { ROW_DESC: "", SettingGroup: "SettingGroup", SettingRow: "SettingRow" },
    "../shared": { ToggleRow: "ToggleRow" },
    "./bandwidth-section": { BandwidthInput: "BandwidthInput" },
    "./choice": { ChoiceBlock: "ChoiceBlock", Tag: "Tag" },
    "./internals": { DesktopOnlyBlock: "DesktopOnlyBlock", isTauri: false },
    "./hdr-mode": { HdrModePicker: "HdrModePicker" },
    "./display-panel-selector": { DisplayPanelSelector: "DisplayPanelSelector" },
    "./display-picker": { DisplayPickerRow: "DisplayPickerRow" },
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
  }).render();
  const row = (label: string) => all(tree).find((n) => n.props.label === label);
  return { row, updates };
}

test("embed toggle locks with an explanation when True HDR separate window is on", () => {
  const embed = "Embed mpv inside Harbor window";
  assert.equal(enginePanel({ playerMpvEmbed: true }).row(embed)!.props.lockReason, undefined);
  const locked = enginePanel({ playerMpvEmbed: true, playerHdrOpaqueWindow: true });
  assert.equal(typeof locked.row(embed)!.props.lockReason, "string");
  locked.row(embed)!.props.onChange(false);
  assert.deepEqual(locked.updates, [{ playerMpvEmbed: false }]);
});

test("cover-taskbar toggle and separate-window picker appear only for a separate window", () => {
  const cover = "Cover the taskbar";
  const picker = "Separate window display";
  const embedded = enginePanel({ playerMpvEmbed: true });
  assert.equal(embedded.row(cover), undefined);
  assert.equal(embedded.row(picker), undefined);
  for (const settings of [
    { playerMpvEmbed: false, playerSeparateCoverTaskbar: false },
    { playerMpvEmbed: true, playerHdrOpaqueWindow: true, playerSeparateCoverTaskbar: false },
  ]) {
    const panel = enginePanel(settings);
    assert.equal(panel.row(cover)!.props.value, false);
    assert.equal(panel.row(picker)!.type, "DisplayPickerRow");
    panel.row(cover)!.props.onChange(true);
    assert.deepEqual(panel.updates, [{ playerSeparateCoverTaskbar: true }]);
  }
});

test("display settings default to auto with taskbar covered", () => {
  assert.deepEqual(DEFAULT.bigPictureDisplay, AUTO_DISPLAY);
  assert.deepEqual(DEFAULT.playerSeparateDisplay, AUTO_DISPLAY);
  assert.equal(DEFAULT.playerSeparateCoverTaskbar, true);
});

test("separate display and cover-taskbar flow through to the mpv start args", () => {
  const display = { id: "2" } as never;
  const src = { url: "file:///a.mkv", isLive: false } as never;
  const opts = { anime4k: false, hdrToSdr: false, separateDisplay: display };
  const args = mpvStartArgs({ ...opts, separateCoverTaskbar: false }, src, false, "standard");
  assert.equal(args.separateDisplay, display);
  assert.equal(args.separateCoverTaskbar, false);
  assert.equal(mpvStartArgs(opts, src, false, "standard").separateCoverTaskbar, true);
});

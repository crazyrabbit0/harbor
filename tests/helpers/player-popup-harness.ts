import * as language from "../../src/lib/subtitles/language.ts";
import { componentHarness, elements } from "./component-harness.ts";

const noop = () => {};
const t = (key: string) => key;
const icons = new Proxy({}, { get: (_target, name) => String(name) });
const shared = {
  "lucide-react": icons,
  "@/lib/i18n": { useT: () => t },
  "@/lib/player/overlay-dismiss": { watchOutsideMouseDown: () => noop },
};
const menuSide = { useMenuSide: () => ({ side: "end", measure: noop }) };
const tooltip = { Tooltip: "Tooltip" };
const hotkeys = { KeyChips: "KeyChips", withHotkey: (label: string) => label };
const selected = (settings: Record<string, unknown>) => ({
  useSettingsSelector: (pick: (s: unknown) => unknown) => pick(settings),
  useSettingsUpdate: () => noop,
});
const transport = { ...shared, "../menu-side": menuSide, "./tooltip": tooltip };

type Popup = { file: string; name: string; mocks: Record<string, unknown>; props: object };

const POPUPS: Record<string, Popup> = {
  speed: {
    file: "src/components/player/transport/speed-menu.tsx",
    name: "SpeedMenu",
    mocks: {
      ...transport,
      "./hotkey-label": hotkeys,
      "@/views/player/hooks/use-sleep-timer": { SLEEP_PRESETS: [] },
      "@/lib/settings": selected({
        customPlaybackSpeeds: [],
        customSleepMinutes: [],
        defaultPlaybackSpeed: 1,
        playerSpeedWheel: false,
      }),
      "../speed-indicator": { SPEED_MAX: 4, SPEED_MIN: 0.25 },
    },
    props: { rate: 1, onRate: noop },
  },
  "auto-skip": {
    file: "src/components/player/transport/skip-toggle-btn.tsx",
    name: "AutoSkipMenu",
    mocks: {
      ...transport,
      "@/lib/settings": { useSettings: () => ({ settings: {}, update: noop }) },
    },
    props: {},
  },
  shaders: {
    file: "src/components/player/transport/shader-menu.tsx",
    name: "ShaderMenu",
    mocks: {
      ...transport,
      "./hotkey-label": hotkeys,
      "@/lib/player/anime4k-modes": { ANIME4K_MODES: [] },
      "@/lib/player/shader-catalog": { SHADER_CATALOG: [] },
      "@/lib/settings": selected({ playerShaders: {} }),
    },
    props: { mode: "auto", onMode: noop, anime4kAvailable: true },
  },
  picture: {
    file: "src/components/player/transport/aspect-menu.tsx",
    name: "AspectMenu",
    mocks: {
      ...transport,
      "./hotkey-label": hotkeys,
      "@/views/player/hooks/use-video-fill": { CROP_PRESETS: [] },
      "@/views/settings/mpv-panel/dials": {
        PICTURE_KEYS: [],
        PICTURE_TEMPLATES: [],
        TweakSlider: "TweakSlider",
        useTweaks: () => ({ tweaks: {}, setTweak: noop, applyPatch: noop, applyPreset: noop }),
      },
    },
    props: { mode: "fit", onMode: noop },
  },
  anime4k: {
    file: "src/components/player/transport/anime4k-menu.tsx",
    name: "Anime4kMenu",
    mocks: {
      ...transport,
      "./hotkey-label": hotkeys,
      "@/lib/player/anime4k-modes": { ANIME4K_MODES: [] },
    },
    props: { mode: "auto", onMode: noop },
  },
  audio: {
    file: "src/components/player/audio-menu.tsx",
    name: "AudioMenu",
    mocks: {
      ...shared,
      "@tauri-apps/api/event": { listen: async () => noop },
      "@/components/flag": { Flag: "Flag" },
      "@/lib/modal-overlay": {
        modalOverlayClose: async () => {},
        modalOverlayEmitState: async () => {},
        modalOverlayOpen: async () => {},
      },
      "@/lib/subtitles/language": language,
      "./menu-side": menuSide,
      "./transport/tooltip": tooltip,
      "./transport/hotkey-label": hotkeys,
    },
    props: { tracks: [], selectedId: null, delaySec: 0, engine: "mpv", onSelect: noop },
  },
};

/** Every inline player popup that opens from a transport button. */
export const ANCHORED_POPUPS = Object.keys(POPUPS);

/** Clicks one popup's trigger and returns the className of the panel it opens, if any. */
export function openedPopupClass(id: string): string | undefined {
  const popup = POPUPS[id];
  const menu = componentHarness(popup.file, popup.name, popup.mocks, {
    window: { innerWidth: 1280, addEventListener: noop, removeEventListener: noop },
  });
  const trigger = [...elements(menu.render(popup.props))].find(
    (el) => el.type === "button" && typeof el.props.onClick === "function",
  );
  trigger?.props.onClick();
  const panel = [...elements(menu.render(popup.props))].find(
    (el) => typeof el.props.className === "string" && el.props.className.startsWith("fixed "),
  );
  return panel?.props.className;
}

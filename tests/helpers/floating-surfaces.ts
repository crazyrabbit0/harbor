import { componentHarness, elements, reactDomInPlace, stubModule } from "./component-harness";

const noop = () => {};
const t = (key: string) => key;
const i18n = { useT: () => t };
const raf = (run: () => void) => (run(), 1);
const windowStub = {
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: noop,
  setTimeout: () => 1,
  clearTimeout: noop,
  requestAnimationFrame: raf,
  cancelAnimationFrame: noop,
  scrollY: 0,
  innerWidth: 1200,
};
const browser = {
  window: windowStub,
  document: { body: {}, documentElement: {} },
  requestAnimationFrame: raf,
  cancelAnimationFrame: noop,
  getComputedStyle: () => ({ overflowY: "visible" }),
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
};

/** Pixel value of a `calc(a + b + var(--x, 0px))` offset, with `vars` filling the custom properties. */
export function resolveOffset(offset: string, vars: Record<string, number> = {}): number {
  const body = offset.trim().replace(/^calc\((.*)\)$/, "$1");
  let total = 0;
  for (const raw of body.split(/\s\+\s/)) {
    const term = raw.trim();
    const variable = /^var\((--[\w-]+),\s*([\d.]+)px\)$/.exec(term);
    if (variable) total += vars[variable[1]] ?? Number(variable[2]);
    else if (term.endsWith("rem")) total += Number(term.slice(0, -3)) * 16;
    else if (term.endsWith("px")) total += Number(term.slice(0, -2));
    else throw new Error(`Unsupported offset term ${term}`);
  }
  return total;
}

const styled = (tree: unknown, key: "bottom" | "paddingBottom" = "bottom") => {
  for (const el of elements(tree)) {
    const value = el.props.style?.[key];
    if (typeof value === "string") return value;
  }
  throw new Error(`No ${key} style rendered`);
};

function backToTop() {
  const h = componentHarness(
    "src/components/back-to-top.tsx",
    "BackToTop",
    { "lucide-react": stubModule(), "@/lib/i18n": i18n },
    browser,
  );
  return h.render({ scrollRef: { current: null } });
}

function scrollTopButton() {
  const h = componentHarness(
    "src/components/scroll-top-button.tsx",
    "ScrollTopButton",
    { "lucide-react": stubModule(), "react-dom": reactDomInPlace },
    browser,
  );
  return h.render();
}

function floatingPageActions() {
  const h = componentHarness(
    "src/components/floating-page-actions.tsx",
    "FloatingPageActions",
    {},
    browser,
  );
  return h.render({ children: null });
}

function controllerToast() {
  let pads: { id: number; name: string }[] = [];
  const h = componentHarness(
    "src/components/controller-connected-toast.tsx",
    "ControllerConnectedToast",
    {
      "react-dom": reactDomInPlace,
      "@/lib/gamepad/store": { useGamepads: () => pads },
      "@/lib/i18n": i18n,
      "@/lib/settings": {
        useSettingsSelector: (select: (s: unknown) => unknown) =>
          select({ controllerSupportEnabled: true }),
      },
    },
    browser,
  );
  h.render();
  pads = [{ id: 1, name: "Pad" }];
  h.render();
  return h.render();
}

function listToast() {
  const h = componentHarness(
    "src/components/lists/list-toast.tsx",
    "ListToastHost",
    { "lucide-react": stubModule(), "react-dom": reactDomInPlace },
    browser,
  );
  h.render();
  h.exports.emitListToast("Added");
  return h.render();
}

function episodeJumper() {
  const h = componentHarness(
    "src/components/episode-jumper.tsx",
    "EpisodeJumper",
    {
      "lucide-react": stubModule(),
      "react-dom": reactDomInPlace,
      "@/lib/episode-scroll": { scrollToDataEp: noop },
      "@/lib/i18n": i18n,
    },
    browser,
  );
  return h.render({ scrollRef: { current: null }, totalEpisodes: 24 });
}

function updateCard() {
  const h = componentHarness(
    "src/components/update/update-card.tsx",
    "UpdateCard",
    {
      "lucide-react": stubModule(),
      "@/lib/updater/use-update": {
        ...stubModule(),
        useUpdate: () => ({ status: "available", progress: 0, totalBytes: 0 }),
      },
      "@/lib/updater/release-notes": stubModule(),
      "@/lib/i18n": i18n,
      "./rich-notes": stubModule(),
      "@/lib/updater/experimental-notes": stubModule(),
    },
    browser,
  );
  return h.render();
}

function musicSourceStatus() {
  const h = componentHarness(
    "src/components/music/music-source-picker.tsx",
    "MusicSourcePickerRoot",
    {
      "@/lib/music/source-request": { beginMusicSourceRequest: () => noop },
      "@/lib/music/queue-automation": { cancelMusicQueueAutomation: noop },
      "./music-source-search-motion": stubModule(),
      "@/components/icons/music-icons": stubModule(),
      "@/components/modal-shell": stubModule(),
      "@/components/music/music-source-row": stubModule(),
      "@/lib/i18n": i18n,
      "@/lib/music/queue-source": stubModule(),
      "@/lib/music/player": stubModule(),
      "@/lib/music/play-track": { resolveAndPlayMusicTrack: () => new Promise(() => {}) },
      "@/lib/music/sources": stubModule(),
      "@/lib/music/recovery": stubModule(),
      "@/lib/window": stubModule(),
      "@/lib/music/preferences": stubModule(),
      "./music-service-logo": stubModule(),
      "@/lib/back-intercept": stubModule(),
      "@/lib/music/navigation": stubModule(),
      "./music-source-popover": stubModule(),
      "./music-source-possible": stubModule(),
    },
    browser,
    ["MusicSourcePickerRoot"],
  );
  const tree = h.render({ active: true, children: null });
  tree.props.value.openSourcePicker({ id: "t", connectorId: "youtube", title: "Song" });
  return h.render({ active: true, children: null });
}

function minuiDock() {
  const h = componentHarness(
    "src/chrome/minui-dock.tsx",
    "MinUIDock",
    {
      "@/lib/theme-preview": { usePreviewNavCustomization: (value: unknown) => value },
      "@/lib/context-menu": { useContextMenu: () => ({ open: noop }) },
      "@/components/parental-pin-modal": stubModule(),
      "@/lib/i18n": i18n,
      "@/lib/parental": { useParental: () => ({ locked: false, unlock: noop, hiddenTabs: {} }) },
      "@/lib/settings": {
        useSettingsSelector: (select: (s: unknown) => unknown) =>
          select({ hideContent: {}, navCustomization: null, showPlaylistsTab: true }),
      },
      "@/lib/view": {
        useViewActions: () => ({ setView: noop }),
        useViewSelector: (select: (v: unknown) => unknown) =>
          select({ view: "home", chromeHidden: false }),
      },
      "@/chrome/nav-items": {
        useAvailableNavItems: () => [],
        applyNavCustomization: (items: unknown) => items,
      },
      "@/chrome/nav-edit": stubModule(),
      "@/chrome/nav-edit-mode": { useNavEditMode: () => false },
      "./minui-dock/dock-button": stubModule(),
      "./minui-dock/floating-top": stubModule(),
    },
    browser,
  );
  return h.render();
}

/** Each floating bottom surface, rendered, with the CSS offset that keeps it off the screen edge. */
export function floatingBottomOffsets(): Record<string, string> {
  return {
    "back-to-top": styled(backToTop()),
    "scroll-top-button": styled(scrollTopButton()),
    "floating-page-actions": styled(floatingPageActions()),
    "controller-connected-toast": styled(controllerToast()),
    "list-toast": styled(listToast()),
    "episode-jumper": styled(episodeJumper()),
    "update-card": styled(updateCard()),
    "music-source-picker": styled(musicSourceStatus()),
    "minui-dock": styled(minuiDock(), "paddingBottom"),
  };
}

/** The shared back-to-top button as rendered. */
export const renderBackToTop = backToTop;

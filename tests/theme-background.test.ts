// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as themeBackground from "../src/lib/theme-background.ts";
import { hookHarness } from "./helpers/hook-harness.ts";

const { isThemeOwnedBackground, nextBackgroundImage } = themeBackground;

const NOIR = { background: { image: "linear-gradient(180deg, #000 0%, #000 100%)", dim: 0.6 } };
const AURORA = { background: { image: "radial-gradient(ellipse 90% 70% at 20% 0%, #123 0%)" } };
const PLAIN = { background: undefined };
const USER = "data:image/png;base64,USERWALLPAPER";

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"], key?: unknown) => ({ type, props, key });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const icons = new Proxy({}, { get: (_t, name) => String(name) });
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];
const text = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text((n as N).props?.children)
        : "";

// Each preset id maps to its built-in theme; removing a custom theme drops it from the registry.
function registry() {
  const themes: Record<string, unknown> = {
    noir: NOIR,
    aurora: AURORA,
    plain: PLAIN,
    "cool-grey": PLAIN,
  };
  return { themes, getThemeById: (id: string) => themes[id] ?? null };
}

function section(preset: string, backgroundImage: string | null) {
  const { themes, getThemeById } = registry();
  const updates: any[] = [];
  const settings = { theme: { preset, backgroundImage, backgroundDim: 0.3 } };
  const h = hookHarness(
    "src/views/settings/theme-panel/custom-themes-section.tsx",
    "CustomThemesSection",
    {
      "../icons": icons,
      "@/lib/theme-js-consent": {
        grantThemeJsConsent: () => {},
        hasThemeJsConsent: () => false,
        needsThemeJsConsent: () => false,
        revokeThemeJsConsent: () => {},
        subscribeThemeJsConsent: () => () => {},
      },
      "./custom-themes-section/active-banner": { ActiveBanner: "ActiveBanner" },
      "./custom-themes-section/export-block": { ExportBlock: "ExportBlock" },
      "./custom-themes-section/hero-cards": { HeroCards: "HeroCards" },
      "./custom-themes-section/library-browser": { LibraryBrowser: "LibraryBrowser" },
      "./theme-studio": { ThemeStudio: "ThemeStudio" },
      "@/lib/custom-themes": {
        getCustomThemes: () => [],
        parseThemeJson: () => ({ ok: false, error: "" }),
        removeCustomTheme: (id: string) => delete themes[id],
        saveCustomTheme: () => {},
        subscribeCustomThemes: () => () => {},
        themeNavPatch: () => ({}),
      },
      "@/lib/download-text": { downloadText: async () => {} },
      "@/lib/theme-background": themeBackground,
      "./library-open-store": {
        consumeThemeLibraryRequest: () => null,
        setThemeLibraryOpen: () => {},
        subscribeThemeLibraryRequest: () => () => {},
      },
      "@/lib/theme-import": { importForeignTheme: () => ({ ok: false }) },
      "@/lib/harborstyle": {
        isHarborStyleName: () => false,
        parseHarborStyle: () => ({ ok: false, error: "" }),
        serializeHarborStyle: () => "",
      },
      "@/lib/settings": {
        useSettings: () => ({ settings, update: (p: unknown) => updates.push(p) }),
      },
      "@/lib/discord/activity-hint": { pushActivityHint: () => () => {} },
      "@/lib/theme": {
        FEATURED_CUSTOM_THEMES: [],
        TEMPLATE_THEMES: [],
        THEME_PRESETS: {},
        getThemeById,
      },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/read-at-version": { readAtVersion: (_v: number, read: () => unknown) => read() },
      "react/jsx-runtime": jsx,
    },
    { window: { addEventListener() {}, removeEventListener() {} } },
  );
  const browser = all(h.render({ startOpenTab: "library" })).find(
    (n) => n.type === "LibraryBrowser",
  )!;
  return { browser, updates };
}

function studio(preset: string, backgroundImage: string | null) {
  const { getThemeById } = registry();
  const updates: any[] = [];
  const saved: any[] = [];
  const settings = {
    navCustomization: { order: [], hidden: [], renamed: {} },
    theme: { preset, backgroundImage, backgroundDim: 0.3, customFontId: null },
  };
  const draft = {
    name: "Mine",
    blurb: "",
    colors: { canvas: "#000", surface: "#111", accent: "#fff" },
    layout: "sidebar",
    cardStyle: "flat",
    buttonStyle: "solid",
    fontPair: "default",
    bokeh: false,
    customFontId: null,
    chrome: { items: [] },
    navCustomization: { order: [], hidden: [], renamed: {} },
    css: "",
    js: "",
    html: "",
    chromeDirty: false,
  };
  const node = () => ({
    style: {},
    dataset: {},
    setAttribute() {},
    appendChild() {},
    remove() {},
  });
  const doc = {
    ...node(),
    documentElement: node(),
    head: node(),
    body: node(),
    getElementById: () => null,
    createElement: node,
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  const h = hookHarness(
    "src/views/settings/theme-panel/theme-studio.tsx",
    "ThemeStudio",
    {
      "../icons": icons,
      "react-dom": { createPortal: (tree: unknown) => tree },
      "./theme-studio/inspector": { Inspector: "Inspector" },
      "./theme-studio/studio-header": { StudioHeader: "StudioHeader" },
      "./theme-studio/code-popout": { CodePopout: "CodePopout" },
      "./theme-studio/chrome-config": { buildChrome: () => ({ html: "", css: "" }) },
      "@/lib/theme-background": themeBackground,
      "./theme-studio/suite-theme": { SUITE_CHROME_LIGHT: {} },
      "./theme-studio/hooks/use-studio-preview": {
        useStudioPreview: () => ({ inspectorHidden: false, setInspectorHidden: () => {} }),
      },
      "./theme-studio/hooks/use-draft-history": {
        useDraftHistory: (init: () => unknown) => ({
          draft: init(),
          setDraft: () => {},
          undo: () => {},
          redo: () => {},
          canUndo: false,
          canRedo: false,
        }),
      },
      "./theme-studio/hooks/use-panel-drag": {
        usePanelDrag: () => ({ ref: {}, position: {}, dragging: false, handleProps: {} }),
      },
      "./theme-studio/studio-shell": { StudioShell: "StudioShell" },
      "./theme-studio/studio-draft": { emptyDraft: () => draft },
      "@/lib/custom-themes": { saveCustomTheme: (t: unknown) => saved.push(t) },
      "@/lib/download-text": { downloadText: async () => {} },
      "@/lib/harborstyle": { serializeHarborStyle: () => "" },
      "@/lib/theme-js-consent": { studioThemeOrigin: () => "studio" },
      "@/lib/theme": { applyTheme: () => {}, customColorsToTokens: () => ({}), getThemeById },
      "@/lib/settings": {
        useSettings: () => ({ settings, update: (p: unknown) => updates.push(p) }),
      },
      "@/lib/keyboard-navigation": { captureFocusReturn: () => () => {}, tvFocus: () => {} },
      "@/lib/keyboard-navigation/geometry": { isBackKey: () => false },
      "@/lib/overlay-pin": { pushOverlayPin: () => () => {} },
      "@/lib/discord/activity-hint": { pushActivityHint: () => () => {} },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "react/jsx-runtime": jsx,
    },
    { document: doc },
  );
  const tree = h.render({ onClose: () => {} });
  const save = all(tree).find((n) => n.type === "button" && text(n) === "Save theme")!;
  return { save, updates, saved };
}

test("switching to a theme with no wallpaper clears the previous theme's", () => {
  assert.equal(nextBackgroundImage(NOIR.background.image, NOIR, PLAIN), null);
});

test("switching between two themes adopts the incoming wallpaper", () => {
  assert.equal(nextBackgroundImage(NOIR.background.image, NOIR, AURORA), AURORA.background.image);
});

test("a wallpaper the user chose survives switching themes", () => {
  assert.equal(nextBackgroundImage(USER, PLAIN, PLAIN), USER);
  assert.equal(nextBackgroundImage(USER, PLAIN, NOIR), USER, "the user's choice still wins");
  assert.equal(nextBackgroundImage(USER, AURORA, PLAIN), USER, "a mismatched preset is not ours");
});

test("an empty slot takes the incoming theme's wallpaper and nothing else", () => {
  assert.equal(nextBackgroundImage(null, PLAIN, PLAIN), null);
  assert.equal(nextBackgroundImage(null, PLAIN, NOIR), NOIR.background.image);
});

test("deleting the active theme does not orphan its wallpaper", () => {
  assert.equal(nextBackgroundImage(NOIR.background.image, NOIR, null), null);
});

test("ownership is decided by value, and nothing owns an empty slot", () => {
  assert.equal(isThemeOwnedBackground(null, NOIR), false);
  assert.equal(isThemeOwnedBackground("", NOIR), false);
  assert.equal(isThemeOwnedBackground(NOIR.background.image, NOIR), true);
  assert.equal(isThemeOwnedBackground(NOIR.background.image, AURORA), false);
  assert.equal(isThemeOwnedBackground(USER, undefined), false);
});

test("activating a theme in the library resolves the wallpaper", () => {
  const cleared = section("noir", NOIR.background.image);
  cleared.browser.props.onActivate("plain");
  assert.equal(cleared.updates[0].theme.preset, "plain");
  assert.equal(cleared.updates[0].theme.backgroundImage, null);

  const adopted = section("noir", NOIR.background.image);
  adopted.browser.props.onActivate("aurora");
  assert.equal(adopted.updates[0].theme.backgroundImage, AURORA.background.image);

  const kept = section("noir", USER);
  kept.browser.props.onActivate("aurora");
  assert.equal(kept.updates[0].theme.backgroundImage, USER, "the user's wallpaper survives");
});

test("removing the active theme clears its wallpaper along with the theme", () => {
  const removed = section("noir", NOIR.background.image);
  removed.browser.props.onRemove("noir");
  assert.equal(removed.updates.length, 1);
  assert.equal(removed.updates[0].theme.preset, "cool-grey");
  assert.equal(removed.updates[0].theme.backgroundImage, null, "not orphaned after removal");

  const userWallpaper = section("noir", USER);
  userWallpaper.browser.props.onRemove("noir");
  assert.equal(userWallpaper.updates[0].theme.backgroundImage, USER);

  const inactive = section("aurora", AURORA.background.image);
  inactive.browser.props.onRemove("noir");
  assert.deepEqual(inactive.updates, [], "removing another theme changes nothing");
});

test("saving a studio theme resolves the wallpaper against the preset it replaces", () => {
  for (const current of [NOIR.background.image, USER, null]) {
    const s = studio("noir", current);
    s.save.props.onClick();
    assert.equal(s.saved.length, 1);
    assert.equal(s.updates[0].theme.preset, s.saved[0].id);
    assert.equal(s.updates[0].theme.backgroundImage, current);
  }
});

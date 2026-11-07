// Renders one navigation layout from src/chrome/ with the real nav-edit drag/menu hooks and stubbed stores.
import { all, treeHarness, type El } from "./tree-render.ts";

export const LAYOUTS: Record<string, string> = {
  sidebar: "Sidebar",
  siderail: "SideRail",
  "nord-sidebar": "NordSidebar",
  "dracula-sidebar": "DraculaSidebar",
  "forest-sidebar": "ForestSidebar",
  "stremio-rail": "StremioRail",
  topdock: "TopDock",
  "royal-topbar": "RoyalTopbar",
  "cinematic-overlay": "CinematicOverlay",
  "minui-dock": "MinUIDock",
};

type Options = { ids: string[]; editing?: boolean; locked?: boolean };

export function navChromeHarness(name: string, options: Options) {
  const views: string[] = [];
  const menus: any[] = [];
  const dispatched: { type: string }[] = [];
  const editing = options.editing ?? false;
  const navCustomization = { order: [], hidden: [], renamed: {} };
  const settings = {
    hideContent: {},
    navCustomization,
    showPlaylistsTab: true,
    sidebarCollapsed: false,
    theme: { preset: "harbor" },
    hybridTitleBar: false,
    useNativeTitleBar: true,
    hotkeys: {},
  };
  const settingsStore = {
    useSettingsSelector: (pick: (s: object) => unknown) => pick(settings),
    useSettingsUpdate: () => () => {},
  };
  const t = (key: string) => key;
  const i18n = { useT: () => t, isRtl: () => false, useUiLanguage: () => "en" };
  const editMode = { useNavEditMode: () => editing, setNavEditMode() {} };
  const window = {
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    setTimeout: () => 0,
    matchMedia: () => ({ matches: false }),
  };
  const globals = {
    window,
    document: { body: { style: {} } },
    MouseEvent: class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    getComputedStyle: () => ({ direction: "ltr" }),
  };
  let h: ReturnType<typeof treeHarness>;
  const mocks: Record<string, any> = {
    "@/chrome/nav-items": new Proxy(
      {},
      {
        get: (_t, key) =>
          key === "useAvailableNavItems"
            ? () => options.ids.map((id) => navItems().NAV_ITEMS.find((it: any) => it.id === id))
            : navItems()[key as string],
      },
    ),
    "@/chrome/nav-edit": new Proxy({}, { get: (_t, key) => navEdit()[key as string] }),
    "@/chrome/nav-edit-mode": editMode,
    "@/chrome/nav-overflow": {
      OverflowNav: ({ entries }: { entries: { node: unknown }[] }) => entries.map((e) => e.node),
    },
    "./minui-dock/dock-button": new Proxy({}, { get: (_t, key) => dockButton()[key as string] }),
    "@/lib/context-menu": {
      useContextMenu: () => ({ open: (_e: unknown, m: unknown) => menus.push(m) }),
    },
    "@/lib/theme-preview": { usePreviewNavCustomization: (cfg: unknown) => cfg },
    "@/lib/settings": settingsStore,
    "@/lib/view": {
      useViewActions: () => ({ setView: (v: string) => views.push(v) }),
      useViewSelector: (pick: (v: object) => unknown) =>
        pick({ view: "home", chromeHidden: false }),
    },
    "@/lib/parental": {
      useParental: () => ({ locked: options.locked ?? false, unlock() {}, hiddenTabs: {} }),
    },
    "@/lib/i18n": i18n,
    "@/lib/profiles": { useActiveKid: () => null },
    "@/lib/harbor-logo": { useHarborLogo: () => ({}) },
    "@/lib/search-context": { useSearch: () => ({ setOpen() {} }) },
    "@/lib/window": { useMaximized: () => false, minimize() {}, toggleMaximize() {}, close() {} },
    "@/chrome/use-big-picture-entry": { useBigPictureEntry: () => ({ offer: false }) },
    "@/lib/theme": { getThemeById: () => null },
    "@/lib/hotkeys": {
      effectiveBinding: () => "ctrl+k",
      eventToBinding: () => "",
      formatBindingForDisplay: (b: string) => b,
      shouldHandleGlobalKeyboardEvent: () => true,
    },
  };
  let navItemsApi: Record<string, any> | null = null;
  let navEditApi: Record<string, any> | null = null;
  let dockApi: Record<string, any> | null = null;
  const navItems = () =>
    (navItemsApi ??= h.load("src/chrome/nav-items.tsx", {
      "@/lib/sports/enabled": { useSportsEnabled: () => true },
      "@/lib/streams/plugins/available": { usePluginCataloguesAvailable: () => true },
      "@/lib/app-features": { appFeatures: () => ({ games: true, music: true }) },
      "@/lib/reminders": { useUnseenReminderCount: () => 0 },
    }));
  const navEdit = () =>
    (navEditApi ??= h.load("src/chrome/nav-edit.tsx", {
      "@/lib/i18n": i18n,
      "@/lib/settings": settingsStore,
      "./nav-items": navItems(),
      "./nav-edit-mode": editMode,
    }));
  const dockButton = () => (dockApi ??= h.load("src/chrome/minui-dock/dock-button.tsx", {}));
  h = treeHarness(`src/chrome/${name}.tsx`, mocks, { lenient: true, globals });
  const tree = h.render({ type: h.exports[LAYOUTS[name]], props: {} });

  /** Every nav entry the layout drew: the element carrying data-nav-drop-id. */
  const entries = all(tree).filter((el) => el.props["data-nav-drop-id"] != null);
  /** What clicking an entry does: its own onClick, or the button drawn inside it. */
  const click = (entry: El) => {
    const target = entry.props.onClick
      ? entry
      : all(entry).find((el) => el.type === "button" && el.props.onClick);
    target!.props.onClick({ preventDefault() {}, stopPropagation() {} });
  };
  const menuFor = (entry: El) => {
    entry.props.onContextMenu({ preventDefault() {} });
    return menus.at(-1);
  };
  const pressKey = (entry: El, key: string, shiftKey = false) => {
    entry.props.onKeyDown?.({
      key,
      shiftKey,
      preventDefault() {},
      stopPropagation() {},
      currentTarget: {
        getBoundingClientRect: () => ({ left: 0, width: 10, bottom: 10 }),
        dispatchEvent: (e: { type: string }) => dispatched.push(e),
      },
    });
  };
  return { tree, entries, views, dispatched, click, menuFor, pressKey, navEdit, navItems };
}

/** Names of buttons and hide badges that sit inside a host button anywhere in the tree. */
export function nestedInButton(tree: unknown, badge: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown, inButton: boolean): void => {
    if (Array.isArray(node)) return node.forEach((n) => visit(n, inButton));
    if (!node || typeof node !== "object" || !("props" in node)) return;
    const el = node as El;
    if (inButton && (el.type === "button" || el.type === badge))
      found.push(String(el.type?.name ?? el.type));
    const next = inButton || el.type === "button";
    visit("rendered" in el ? el.rendered : el.props.children, next);
  };
  visit(tree, false);
  return found;
}

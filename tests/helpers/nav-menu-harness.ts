// Renders the real ContextMenu (components/context-menu.tsx) open on a nav target, with stores stubbed.
import { all, treeHarness } from "./tree-render.ts";

export function navMenuHarness(navItems: Record<string, any>, target: Record<string, unknown>) {
  const views: string[] = [];
  let closes = 0;
  const frames: { id: number; cancelled: boolean }[] = [];
  const observers: { target: unknown; disconnected: boolean; measure: () => void }[] = [];
  const focus: string[] = [];
  const state = { target: { kind: "nav", ...target }, pos: { x: 20, y: 700 } };
  const editTarget = { kind: "edit", element: null, selection: "text" };
  if (target.kind === "edit") state.target = editTarget as typeof state.target;
  const menuNode = { offsetHeight: 300, querySelectorAll: () => [] };
  const h = treeHarness(
    "src/components/context-menu.tsx",
    {
      "@/lib/context-menu": {
        useContextMenu: () => ({ state, close: () => (closes += 1), open() {} }),
      },
      "@/lib/view": {
        useViewActions: () => ({ setView: (v: string) => views.push(v) }),
        useViewSelector: (pick: (v: object) => unknown) => pick({ topKind: "home" }),
      },
      "@/lib/together/provider": { useTogether: () => ({ snapshot: { state: "idle" } }) },
      "@/lib/player-actions": { usePlayerActions: () => ({}) },
      "@/lib/i18n": { t: (key: string) => key, useT: () => (key: string) => key },
      "@/lib/active-addon": { useActiveAddon: () => null },
      "@/lib/providers/tmdb": { useTmdbImdbId: () => undefined },
      "@/lib/watched-flag": { useMetaWatched: () => false },
      "@/lib/watchlist": { useInWatchlist: () => false },
      "@/lib/media-favorites": {
        useMediaFavorites: () => ({ toggle() {} }),
        useIsFavorite: () => false,
      },
      "@/lib/auto-download": { useIsAutoDownloaded: () => false },
      "@/lib/settings": {
        useSettings: () => ({
          settings: { navCustomization: { order: [], hidden: [], renamed: {} } },
          update() {},
        }),
      },
      "@/chrome/nav-items": navItems,
      "@/chrome/nav-edit-mode": { useNavEditMode: () => false, setNavEditMode() {} },
      "@/lib/profiles": { useProfiles: () => ({ activeId: "p1" }) },
      "@/lib/manga-favorites": {
        useMangaFavorites: () => ({ toggle() {} }),
        useIsMangaFavorite: () => false,
      },
      "@/lib/manga-progress": {
        useMangaProgressEntry: () => null,
        useReadMangaChapterIds: () => new Set(),
      },
      "@/lib/manga-bookmarks": { useMangaBookmarks: () => [] },
      "@/components/tv-modal-close": { TvModalClose: "TvModalClose" },
    },
    {
      lenient: true,
      hostNode: (_tag, props) => (props.role === "menu" ? menuNode : null),
      globals: {
        window: { innerHeight: 800, innerWidth: 1200 },
        document: {
          addEventListener() {},
          removeEventListener() {},
          activeElement: { isConnected: true, focus: () => focus.push("trigger") },
        },
        HTMLElement: Object,
        requestAnimationFrame: () => {
          frames.push({ id: frames.length + 1, cancelled: false });
          return frames.length;
        },
        cancelAnimationFrame: (id: number) => {
          const frame = frames.find((f) => f.id === id);
          if (frame) frame.cancelled = true;
        },
        ResizeObserver: class {
          constructor(measure: () => void) {
            observers.push({ target: null, disconnected: false, measure });
          }
          observe(target: unknown) {
            observers.at(-1)!.target = target;
          }
          disconnect() {
            for (const o of observers) o.disconnected = true;
          }
        },
      },
    },
  );
  const tree = h.render({ type: h.exports.ContextMenu, props: {} });
  const menu = () =>
    all(h.render({ type: h.exports.ContextMenu, props: {} })).find(
      (el) => el.props.role === "menu",
    )!;
  const item = (key: string) => all(tree).find((el) => el.key === key);
  return {
    tree,
    item,
    menu,
    views,
    frames,
    observers,
    focus,
    menuNode,
    closes: () => closes,
    unmount: () => h.unmount(),
  };
}

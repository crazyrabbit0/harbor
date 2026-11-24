// Renders the real SearchOverlay (`components/search/search-overlay.tsx`) open on an empty query; child components stay named stubs.
import * as tabCycle from "../../src/lib/tab-cycle.ts";
import { all, treeHarness } from "./tree-render.ts";

class FakeNode {}

type Stop = FakeNode & { id: string; tabIndex: number; getClientRects(): unknown[]; focus(): void };

export function searchOverlayHarness(options: { closing?: boolean } = {}) {
  const calls = { setOpen: [] as boolean[] };
  const document = {
    activeElement: null as unknown,
    body: { style: {} as Record<string, string>, contains: () => false },
  };
  const stop = (id: string): Stop =>
    Object.assign(new FakeNode(), {
      id,
      tabIndex: 0,
      getClientRects: () => [{}],
      focus() {
        document.activeElement = this;
      },
    });
  const stops = [stop("input"), stop("action"), stop("result")];
  const listeners = new Set<(e: unknown) => void>();
  const panel = {
    addEventListener: (_type: string, fn: (e: unknown) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (e: unknown) => void) => listeners.delete(fn),
    contains: (node: unknown) => stops.includes(node as Stop),
    querySelectorAll: () => stops,
  };
  const search = {
    open: true,
    setOpen: (value: boolean) => calls.setOpen.push(value),
    query: "",
    setQuery() {},
    results: null,
    status: "idle",
    clear() {},
    closeForNavigation() {},
    recordRecent() {},
    setAiHold() {},
  };
  const settings = {
    aiGroqKey: "",
    aiSearchKey: "",
    aiSearchModel: "",
    dragAnywhere: false,
    steamSearchShortcut: "",
    tmdbKey: "",
  };
  const h = treeHarness(
    "src/components/search/search-overlay.tsx",
    {
      "@tauri-apps/api/core": { isTauri: () => false },
      "react-dom": { createPortal: (node: unknown) => node },
      "@/lib/app-features": { appFeatures: () => ({ music: true }) },
      "@/lib/keyboard-navigation": { tvFocus() {} },
      "@/lib/tab-cycle": tabCycle,
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/search-context": { useSearch: () => search },
      "@/lib/view": { useViewActions: () => ({}) },
      "@/lib/anime-detect": { metaLooksAnime: () => false },
      "@/lib/search-display-state": {
        getSearchDisplayState: () => ({
          currentResults: null,
          hasResults: false,
          noResults: false,
          tmdbUnavailable: false,
        }),
      },
      "@/lib/settings": {
        useSettingsSelector: (pick: (s: object) => unknown) => pick(settings),
        useSettingsUpdate: () => () => {},
      },
      "@/lib/use-exit-presence": {
        useExitPresence: () => ({ mounted: true, closing: options.closing ?? false }),
      },
      "@/lib/use-window-fullscreen": { useWindowFullscreen: () => false },
      "@/lib/torrent/magnet": { isMagnetInput: () => false, isDirectVideoUrl: () => false },
      "@/lib/profiles": { useProfiles: () => ({ activeProfile: null }) },
      "@/lib/games/steam-store-search": { steamStoreQuery: () => null },
      "./person-top-match": { matchPersonForQuery: () => null, PersonTopMatch: "PersonTopMatch" },
      "./use-collection-hits": { useCollectionHits: () => [], collectionForTitle: () => null },
    },
    {
      lenient: true,
      deferLazy: true,
      hostNode: (tag) => (tag === "div" ? panel : { focus() {} }),
      globals: {
        window: {
          setTimeout: () => 0,
          clearTimeout() {},
          addEventListener() {},
          removeEventListener() {},
        },
        document,
        HTMLElement: FakeNode,
        Node: FakeNode,
      },
    },
  );
  const tree = h.render({ type: h.exports.SearchOverlay, props: {} });
  /** Sends a keydown to the overlay panel's own listeners; returns whether it was prevented. */
  const keydown = (key: string, target: unknown, shiftKey = false) => {
    let prevented = false;
    const event = {
      key,
      target,
      shiftKey,
      defaultPrevented: false,
      preventDefault: () => (prevented = true),
    };
    for (const fn of listeners) fn(event);
    return prevented;
  };
  return {
    tree,
    elements: all(tree),
    calls,
    stops,
    document,
    keydown,
    outside: new FakeNode(),
    listenerCount: () => listeners.size,
    unmount: () => h.unmount(),
  };
}

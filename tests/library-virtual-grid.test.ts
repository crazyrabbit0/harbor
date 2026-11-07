// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { all, icons, jsx, t } from "./helpers/ebook-harness.ts";
import { hookHarness } from "./helpers/hook-harness.ts";

const noop = () => {};
const VirtualGrid = function VirtualGrid() {};
const meta = (id: string) => ({ id, type: "movie", name: id });

function sharedModule() {
  return hookHarness("src/views/library/shared.tsx", "GroupedGrid", {
    "lucide-react": icons,
    "@/lib/cinemeta": {},
    "@/lib/settings": { useSettings: () => ({ settings: { posterScale: 1 }, update: noop }) },
    "@/lib/i18n": { useT: () => t },
    "@/components/virtual-grid": { VirtualGrid },
    "./watchlist-card": { WatchlistCard: "WatchlistCard" },
    "@/lib/library/hydrate-meta": {},
    "react/jsx-runtime": jsx,
  });
}

test("grouped library grids virtualize per group when given a scroll ref", () => {
  const shared = sharedModule();
  const scrollRef = { current: null };
  const groups = [
    { label: "Today", items: [{ key: "a", meta: meta("a"), date: 1 }] },
    { label: "2020", items: [{ key: "b", meta: meta("b"), date: 2 }] },
  ];
  const grids = all(shared.render({ groups, scrollRef })).filter((n) => n.type === VirtualGrid);
  assert.equal(grids.length, 2, "one VirtualGrid per group");
  assert.ok(grids.every((grid) => grid.props.scrollRef === scrollRef));
  const plain = all(shared.render({ groups })).filter((n) => n.type === VirtualGrid);
  assert.equal(plain.length, 0, "without a scroll ref the plain grid renders");
});

test("WatchlistTab forwards its scroll ref to every grouping", () => {
  const shared = sharedModule().exports;
  const scrollRef = { current: null };
  for (const [sort, flat] of [
    ["title", "0"],
    ["recent", "1"],
    ["recent", "0"],
  ]) {
    const tab = hookHarness(
      "src/views/library/watchlist-tab.tsx",
      "WatchlistTab",
      {
        "@/lib/auth": { useAuth: () => ({ authKey: null }) },
        "@/lib/settings": {
          useSettingsSelector: (pick: any) =>
            pick({ libraryBookmarkedOnly: true, librarySort: sort }),
        },
        "@/lib/cinemeta": {},
        "@/lib/stremio": { library: async () => [], libraryMetaType: (type: string) => type },
        "@/lib/trakt/watchlist": { fetchWatchlist: async () => [] },
        "@/lib/trakt/provider": { useTrakt: () => ({ isConnected: false }) },
        "@/lib/trakt/to-meta": { traktItemToMeta: () => null },
        "@/lib/trakt/ids": {},
        "@/lib/simkl/ids": {},
        "@/lib/simkl/watchlist": {},
        "@/lib/simkl/session": { isAuthenticated: () => false },
        "@/lib/watchlist": {
          readLocalEntries: () => [{ id: "tt1", type: "movie", name: "One", addedAt: 1 }],
          subscribeWatchlist: () => noop,
        },
        "@/lib/watchlist-sync": {},
        "@/lib/i18n": { useT: () => t },
        "./shared": shared,
        "./featured-context": { useReportFeatured: noop },
        "react/jsx-runtime": jsx,
      },
      {
        localStorage: { getItem: () => flat, setItem: noop },
        window: { addEventListener: noop, removeEventListener: noop },
      },
    );
    const grids = all(tab.render({ mode: "library", scrollRef })).filter(
      (n) => n.type === shared.GroupedGrid,
    );
    assert.equal(grids.length, 1, `${sort}/${flat} renders one grouped grid`);
    assert.equal(grids[0].props.scrollRef, scrollRef, `${sort}/${flat} forwards scrollRef`);
    tab.unmount();
  }
});

test("library view wires the scroll ref into watchlist tabs", () => {
  const WatchlistTab = function WatchlistTab() {};
  const component = (name: string) => ({ [name]: name });
  for (const mode of ["library", "watchlist"]) {
    const view = hookHarness(
      "src/views/library.tsx",
      "LibraryView",
      {
        "lucide-react": icons,
        "@/components/ui-icon": component("UiIcon"),
        "@/assets/trakt.svg": { default: "trakt.svg" },
        "@/assets/anilist.png": { default: "anilist.png" },
        "@/assets/simkl.png": { default: "simkl.png" },
        "@/assets/addon-logos/letterboxd.png": { default: "letterboxd.png" },
        "@/components/icons/mal-logo": component("MalLogo"),
        "@/lib/anilist/provider": { useAnilist: () => ({ isConnected: false }) },
        "@/lib/mal/provider": { useMal: () => ({ isConnected: false }) },
        "@/lib/simkl/provider": { useSimkl: () => ({ isConnected: false }) },
        "@/lib/trakt/provider": { useTrakt: () => ({ isConnected: false }) },
        "@/lib/view": { useScrollMemory: noop, useViewActions: () => ({ setView: noop }) },
        "@/lib/settings": { useSettings: () => ({ settings: { libraryHero: false } }) },
        "@/lib/window-drag": { useContentDrag: () => ({}) },
        "@/lib/i18n": { useT: () => t },
        "@/lib/watchlist": { watchlistHas: noop },
        "@/lib/stremboxd/provider": { useLetterboxd: () => ({ isActive: false }) },
        "./library/anilist-tab": component("AnilistTab"),
        "./library/history-tab": component("HistoryTab"),
        "./library/local-tab": component("LocalTab"),
        "./library/mal-tab": component("MalTab"),
        "./library/my-lists-tab": component("MyListsTab"),
        "./library/favorites-tab": component("FavoritesTab"),
        "./library/shared": component("TabBtn"),
        "./library/simkl-tab": component("SimklTab"),
        "./library/trakt-tab": component("TraktTab"),
        "./library/watchlist-tab": { WatchlistTab },
        "./library/letterboxd-tab": component("LetterboxdTab"),
        "./library/media-servers-tab": component("MediaServersTab"),
        "@/lib/discord/activity-hint": { pushActivityHint: () => noop },
        "@/components/hero-carousel": component("HeroCarousel"),
        "./library/featured-context": {
          LibraryFeaturedProvider: "LibraryFeaturedProvider",
          useLibraryFeatured: () => [],
        },
        "./library/featured-picks": { pickFeatured: () => [] },
        "react/jsx-runtime": jsx,
      },
      { localStorage: { getItem: () => mode, setItem: noop } },
    );
    const tree = view.render({ active: false });
    const tabs = all(tree).filter((n) => n.type === WatchlistTab);
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].props.mode, mode);
    assert.ok(tree.props.ref, "the scroll element carries the ref");
    assert.equal(tabs[0].props.scrollRef, tree.props.ref, `${mode} tab must pass scrollRef`);
  }
});

/** Renders VirtualGrid with a recording virtualizer; the grid sits 400px below its scroller's top. */
function gridHarness() {
  const virtualizer: any[] = [];
  const container = {
    clientWidth: 1000,
    parentElement: null,
    getBoundingClientRect: () => ({ top: 500, height: 280 }),
    addEventListener: noop,
    removeEventListener: noop,
  };
  const scroller = { scrollTop: 250, getBoundingClientRect: () => ({ top: 100 }) };
  const withRef = (type: unknown, props: Record<string, any>) => {
    if (props.ref && typeof props.ref === "object" && props.ref.current == null)
      props.ref.current = container;
    return jsx.jsx(type, props);
  };
  const h = hookHarness(
    "src/components/virtual-grid.tsx",
    "VirtualGrid",
    {
      "@tanstack/react-virtual": {
        defaultRangeExtractor: (range: any) => [range.startIndex],
        useVirtualizer: (options: any) => {
          virtualizer.push(options);
          const margin = options.scrollMargin ?? 0;
          // A virtualizer reports each row's start including the margin it was given.
          const items = Array.from({ length: options.count }, (_, index) => ({
            index,
            key: index,
            start: margin + index * 300,
          }));
          return {
            getTotalSize: () => options.count * 300,
            getVirtualItems: () => items,
            measureElement: noop,
          };
        },
      },
      "react/jsx-runtime": { ...jsx, jsx: withRef, jsxs: withRef },
    },
    {
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: noop,
      document: { scrollingElement: null },
    },
  );
  const props = {
    items: Array.from({ length: 12 }, (_, i) => i),
    scrollRef: { current: scroller },
    renderItem: (item: number) => item,
  };
  return { virtualizer, render: () => h.render(props) };
}

test("a grid measures its own distance down the shared scroller", () => {
  // Grids stack in one scroller; one that assumes scrollTop 0 renders rows off-screen.
  const g = gridHarness();
  g.render();
  g.render();
  assert.equal(g.virtualizer.at(-1).scrollMargin, 500 - 100 + 250);
});

test("rows subtract the offset they were positioned with", () => {
  // Row starts include scrollMargin while the total size does not, so rows must subtract it.
  const g = gridHarness();
  g.render();
  const rows = all(g.render()).filter((n) => n.props["data-vgrid-row"] !== undefined);
  assert.ok(rows.length >= 2);
  assert.deepEqual(
    rows.map((row) => row.props.style.transform),
    rows.map((_, i) => `translateY(${i * 300}px)`),
  );
});

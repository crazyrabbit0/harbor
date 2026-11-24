import type { EBook } from "../../src/lib/ebook/api.ts";
import * as browseFilters from "../../src/lib/ebook/browse-filters.ts";
import * as universes from "../../src/lib/ebook/universes.ts";
import { icons, loadEBookApi, t } from "./ebook-harness.ts";
import { flushPromises, loadModule } from "./hook-harness.ts";
import { all, treeHarness, type El } from "./tree-render.ts";

const FILE = "src/views/ebook.tsx";
const EXPOSE = [
  "EBookCard",
  "EBookDetailDropdown",
  "EBookDetails",
  "EBookGrid",
  "EBookRail",
  "EBookReadMark",
];
const noop = () => {};

type Resume = Record<string, unknown> & { chapterId: string; updatedAt?: number };
type Chapter = Record<string, unknown> & { id: string; title: string };

export type EBookViewOptions = {
  ebookId?: string;
  providers?: { id: string; name: string }[];
  sourceItems?: EBook[];
  recommendationItems?: EBook[];
  catalogPage?: { items: EBook[]; cursor: object; hasMore: boolean };
  catalogSearch?: (query: string, providerId: string) => EBook[];
  popular?: EBook[];
  saved?: EBook[];
  resumes?: Record<string, Resume>;
  tracking?: Record<string, { status: string; progress: number }>;
  progress?: Record<string, number>;
  detail?: (route: string) => EBook | null;
  chapters?: Record<string, Chapter[]>;
};

/** A DOM element stand-in for `instanceof Element` checks; `inside` answers `closest`. */
class FakeElement {
  inside: boolean;
  constructor(inside: boolean) {
    this.inside = inside;
  }
  closest() {
    return this.inside ? this : null;
  }
}

/** Runs views/ebook.tsx with recording mocks; each component renders on its own harness instance. */
export function ebookViewHarness(o: EBookViewOptions = {}) {
  const calls = {
    sourcePages: [] as unknown[][],
    catalogPages: [] as unknown[][],
    catalogSearches: [] as unknown[][],
    reverseSearches: [] as unknown[][],
    popular: 0,
    detail: [] as string[],
    chapters: [] as string[],
    resumeSaves: [] as unknown[][],
    opened: [] as (string | undefined)[],
  };
  const store = new Map<string, string>();
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const resumes = new Map(Object.entries(o.resumes ?? {}));
  const saved = [...(o.saved ?? [])];
  const view = {
    ebookId: o.ebookId,
    topKind: "ebook",
    openEBook: (id?: string) => void calls.opened.push(id),
  };
  const listeners: { target: string; type: string; fn: (event: any) => void; options: unknown }[] =
    [];
  const listen = (target: string) => ({
    addEventListener: (type: string, fn: (event: any) => void, options?: unknown) =>
      void listeners.push({ target, type, fn, options }),
    removeEventListener: (type: string, fn: (event: any) => void) => {
      const at = listeners.findIndex((l) => l.target === target && l.type === type && l.fn === fn);
      if (at >= 0) listeners.splice(at, 1);
    },
  });
  const timers: (() => void)[] = [];
  const api = loadEBookApi();
  const collections = loadModule(
    "src/lib/ebook/collections.ts",
    {
      "@/lib/i18n": { t },
      "@/lib/storage-recovery": {
        setItemWithRecovery: (key: string, value: string) => (store.set(key, value), true),
      },
    },
    { localStorage },
  );
  const page = (items: EBook[]) => ({
    items,
    cursor: {},
    hasMore: false,
    enriched: Promise.resolve(items),
  });
  const mocks: Record<string, unknown> = {
    "lucide-react": icons,
    "react-dom": { createPortal: (node: unknown) => node },
    "./ebook-hero.css": {},
    "./ebook-showcase.css": {},
    "@/components/nav-arrow": { NavArrow: "NavArrow" },
    "@/components/cover-img": { CoverImg: "CoverImg" },
    "@/components/poster": { Poster: "Poster" },
    "./ebook/ebook-book3d": { EBookBook3D: "EBookBook3D" },
    "@/components/row": { Row: "Row" },
    "@/components/lists/list-toast": { emitListToast: noop },
    "@/components/icons/nyt-mark": { NytMark: "NytMark" },
    "@/lib/ebook/nyt": { NYT_ATTRIBUTION: "NYT" },
    "@/lib/ebook/nyt-rail": {
      isNytPlaceholder: () => false,
      nytRailItems: () => null,
      nytRankFor: () => null,
    },
    "@/lib/ebook/nyt-match": { nytBestsellerFor: () => null },
    "@/lib/ebook/use-nyt": {
      useNytAvailability: noop,
      useNytList: () => null,
      useNytSnapshot: () => null,
      useResolveNytBooks: noop,
    },
    "@/lib/anilist/provider": { useAnilist: () => ({ isConnected: false, session: null }) },
    "@/lib/i18n": { useT: () => t, useUiLanguage: () => "en" },
    "@/lib/ebook/api": {
      ...api,
      browsePopularEBooks: async () => (calls.popular++, o.popular ?? []),
      ebookCollections: async (...args: unknown[]) => (calls.reverseSearches.push(args), []),
      ebookDetail: async () => null,
      ebookAdaptations: async () => ({}),
      searchEBooks: async () => [],
    },
    "@/lib/ebook/browse-filters": browseFilters,
    "@/lib/ebook/collections": collections,
    "@/lib/ebook/universes": universes,
    "@/lib/ebook/library": {
      ebookLibrary: () => [...saved],
      favoriteEBooks: () => [],
      ebookInLibrary: (id: string) => saved.some((book) => book.id === id),
      ebookIsFavorite: () => false,
      toggleEBookLibrary: () => true,
      toggleEBookFavorite: () => true,
    },
    "@/lib/ebook/reader-state": {
      loadEBookResume: (profile: string, id: string) => resumes.get(`${profile}|${id}`) ?? null,
      saveEBookResume: (...args: unknown[]) => void calls.resumeSaves.push(args),
      loadEBookProgress: (profile: string, id: string, key: string) =>
        o.progress?.[`${profile}|${id}|${key}`] ?? 0,
    },
    "@/lib/ebook/providers": {
      listEBookProviders: async () => o.providers ?? [{ id: "plugin:p", name: "Plugin" }],
      loadSourceEBookPage: async (
        query: string | undefined,
        providerId: string,
        _cursor: unknown,
        handlers?: { onSource?: (items: EBook[]) => void },
      ) => {
        calls.sourcePages.push([query, providerId]);
        const items = providerId === "all" ? (o.recommendationItems ?? []) : (o.sourceItems ?? []);
        handlers?.onSource?.(items);
        return page(items);
      },
      loadSourceEBookCatalogPage: async (...args: unknown[]) => (
        calls.catalogPages.push(args),
        o.catalogPage ?? { items: [], cursor: {}, hasMore: false }
      ),
      searchSourceEBookCatalog: async (query: string, providerId: string) => (
        calls.catalogSearches.push([query, providerId]),
        o.catalogSearch?.(query, providerId) ?? []
      ),
      searchSourceEBooks: async (...args: unknown[]) => (calls.reverseSearches.push(args), []),
      sourceEBookDetail: async (route: string) => (calls.detail.push(route), o.detail?.(route)),
      sourceEBookChapters: async (route: string) => (
        calls.chapters.push(route),
        o.chapters?.[route] ?? []
      ),
      restoreSourceEBookChapters: async () => [],
      sourceEBookContent: async () => ({ text: "" }),
      prefetchSourceEBookContent: async () => {},
      ebookProviderIcon: () => undefined,
    },
    "@/lib/ebook/extensions": { subscribeEBookExtensions: () => noop },
    "@/lib/ebook/sources": { subscribeEBookSources: () => noop },
    "@/lib/ebook/tracking": {
      fetchEBookListCollection: async () => [],
      flushPendingEBookTracking: async () => {},
      getEBookTracking: (id: string) => o.tracking?.[id] ?? { status: "PLANNING", progress: 0 },
    },
    "@/lib/view": {
      useScrollMemory: noop,
      useView: () => view,
      useViewActions: () => ({ openManga: noop, openMeta: noop }),
    },
    "@/lib/profiles": { useProfiles: () => ({ activeId: "alice" }) },
    "@/lib/visibility": { usePageVisible: () => true },
    "@/lib/window": { openUrl: noop },
    "./ebook/ebook-sources-panel": { EBookSourcesView: "EBookSourcesView" },
    "./ebook/ebook-setup": { EBookSetup: "EBookSetup" },
    "./ebook/ebook-reader": { EBookReader: "EBookReader" },
    "./ebook/ebook-wheel-menu": { EBookWheelMenu: "EBookWheelMenu" },
    "./manga/manga-rail": { MangaRail: "MangaRail" },
    "@/lib/read-at-version": { readAtVersion: (_version: unknown, read: () => unknown) => read() },
    "@/lib/search": {},
    "@/lib/manga/api": {},
  };
  const globals = {
    window: {
      ...listen("window"),
      setTimeout: (fn: () => void) => timers.push(fn),
      clearTimeout: noop,
      setInterval: () => 0,
      clearInterval: noop,
    },
    document: { ...listen("document"), body: {} },
    localStorage,
    Element: FakeElement,
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  const instance = () => treeHarness(FILE, mocks, { globals, expose: EXPOSE });
  const top = instance();
  return {
    calls,
    view,
    resumes,
    saved,
    listeners,
    exports: top.exports,
    /** One render pass of EBookView itself; child components stay unexpanded elements. */
    render: (): El => top.run(() => top.exports.EBookView()),
    /** Renders EBookView with its own child components expanded (cards, hero, grids). */
    renderTree: (): El => top.render({ type: top.exports.EBookView, props: {} }),
    /** Renders `name` (EBookDetails, EBookCard, ...) as the root of its own fresh instance. */
    component(name: string) {
      const own = instance();
      return {
        exports: own.exports,
        render: (props: Record<string, unknown>): El => own.run(() => own.exports[name](props)),
        tree: (node: unknown) => own.render(node),
      };
    },
    fire(target: "window" | "document", type: string, event: unknown = {}) {
      for (const l of listeners.filter((entry) => entry.target === target && entry.type === type))
        l.fn(event);
    },
    element: (inside: boolean) => new FakeElement(inside),
    runTimers: () => timers.splice(0).forEach((fn) => fn()),
    async settle(render: () => unknown, passes = 4) {
      for (let pass = 0; pass < passes; pass++) {
        render();
        await flushPromises();
      }
      return render();
    },
  };
}

/** EBookDetails props with recording callbacks. */
export function detailsProps(ebook: EBook, extra: Record<string, unknown> = {}) {
  const log = { consumed: 0, resolved: [] as EBook[][] };
  const props = {
    ebook,
    sourceCandidates: [],
    onSourcesResolved: (books: EBook[]) => void log.resolved.push(books),
    profile: "alice",
    autoRead: false,
    onAutoReadConsumed: () => void log.consumed++,
    onBack: () => {},
    onOpen: () => {},
    ...extra,
  };
  return { props, log };
}

/** A context menu event that records preventDefault. */
export function menuEvent(x = 40, y = 60) {
  const event = {
    clientX: x,
    clientY: y,
    prevented: false,
    preventDefault: () => void (event.prevented = true),
    stopPropagation: () => {},
  };
  return event;
}

/** Every element of type `type` in a rendered tree. */
export const ofKind = (tree: unknown, type: unknown) => all(tree).filter((el) => el.type === type);

/** The text of a rendered element, translation keys included. */
export const textOf = (node: unknown): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join("")
      : node && typeof node === "object" && "props" in node
        ? textOf((node as El).props.children)
        : "";

/** Clicks the home button whose label key is `label` (Collections, Shelf). */
export function clickScreen(view: { render: () => El }, label: string) {
  const button = all(view.render()).find(
    (el) =>
      el.type === "button" &&
      all(el.props.children).some((child) => child.type === "span" && textOf(child) === label),
  );
  if (!button) throw new Error(`no ${label} button`);
  button.props.onClick();
}

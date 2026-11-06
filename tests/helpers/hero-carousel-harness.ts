import { hookHarness } from "./hook-harness.ts";

export type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
export const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
export const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

/** A DOM element stand-in: `closest` matches a tag name or a `[role='x']` selector from the list. */
export class FakeElement {
  tag: string;
  role: string | undefined;
  constructor(tag: string, role?: string) {
    this.tag = tag;
    this.role = role;
  }
  closest(selector: string) {
    const hit = selector
      .split(",")
      .map((s) => s.trim())
      .some((s) => s === this.tag || (this.role != null && s === `[role='${this.role}']`));
    return hit ? this : null;
  }
}

export function Hero() {
  return null;
}

export const slideOf = (id: string) => ({ meta: { id, type: "movie", name: id } });
export const slidesOf = (n: number) => Array.from({ length: n }, (_, i) => slideOf(`m${i}`));

/** Runs the real `HeroCarousel` with `Hero` stubbed; call `render` again after each handler. */
export function heroCarouselHarness() {
  const h = hookHarness(
    "src/components/hero-carousel.tsx",
    "HeroCarousel",
    {
      "@/lib/visibility": { observe: () => () => {}, usePageVisible: () => true },
      "@/lib/use-reduced-motion": { useReducedMotion: () => false },
      "@/lib/i18n": {
        isRtl: () => false,
        useT: () => (s: string, vars?: Record<string, unknown>) =>
          s.replace(/\{(\w+)\}/g, (_m, k) => String(vars?.[k])),
        useUiLanguage: () => "en",
      },
      "@/lib/settings": {
        useSettingsSelector: (pick: (s: unknown) => unknown) => pick({ heroTrailerAudio: true }),
      },
      "./hero": { Hero },
      "@/components/nav-arrow": { NavChevron: () => null },
      "react/jsx-runtime": jsx,
    },
    { Element: FakeElement, setTimeout: () => 0 },
  );
  return {
    render: (props: Record<string, unknown>) => h.render(props),
    buttons: (tree: unknown) => all(tree).filter((n) => n.type === "button"),
    viewport: (tree: unknown) => all(tree).find((n) => n.props.onPointerDown)!,
    track: (tree: unknown) => all(tree).find((n) => n.props.style?.transform),
    heroes: (tree: unknown) => all(tree).filter((n) => n.type === Hero),
  };
}

type HeroFeeds = { tmdbImages?: string[]; fetchedBackground?: string };

/** Runs the real `Hero` with every data hook stubbed; `backdrop` reads the background image src. */
export function heroHarness(feeds: HeroFeeds = {}) {
  const none = () => undefined;
  const h = hookHarness(
    "src/components/hero.tsx",
    "Hero",
    {
      "lucide-react": new Proxy({}, { get: (_t, name) => String(name) }),
      "@/components/icons/play-filled": { Play: "Play" },
      "@/components/icons/imdb-icon": { ImdbIcon: "ImdbIcon" },
      "@/assets/addon-logos/tmdb.png": "tmdb.png",
      "@/assets/trakt.svg": "trakt.svg",
      "@/assets/simkl.png": "simkl.png",
      "@/assets/stremio.png": "stremio.png",
      "@/components/meta-awards-corner": { MetaAwardsCorner: "MetaAwardsCorner" },
      "@/components/rt-badge": { RtBadge: "RtBadge" },
      "@/lib/cinemeta": {
        meta: async () => ({ background: feeds.fetchedBackground }),
        narrowMediaType: (t: string) => t,
      },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/providers/omdb": { omdbPrefetch: none, useOmdbScores: () => null },
      "@/lib/imdb-rating": { useImdbRating: none },
      "@/lib/providers/tmdb": {
        tmdbImdbId: async () => null,
        tmdbMovieImages: async () => feeds.tmdbImages ?? [],
        tmdbTrailerList: async () => [],
        useTmdbImdbId: () => null,
      },
      "@/lib/logo": { peekCachedLogo: none, resolveLogo: async () => undefined },
      "@/lib/settings": {
        useSettingsSelector: (pick: (s: unknown) => unknown) =>
          pick({ tmdbKey: "k", heroShadow: 50, showImdbBadge: false, showRtBadge: false }),
      },
      "@/lib/title-logo": { useTitleLogo: none },
      "@/lib/use-localized-overview": { useLocalizedOverview: none },
      "@/lib/trailer": { fetchTrailer: async () => null, prefetchTrailer: none, trailerSrc: none },
      "@/lib/view": {
        useView: () => ({ openMeta: none, meta: null, player: null, picker: null, view: "home" }),
      },
      "@/lib/profiles": { useProfiles: () => ({ pickerOpen: false }) },
      "@/lib/hero-mute": {
        getHeroMuted: () => true,
        setHeroMuted: none,
        subscribeHeroMuted: none,
        syncHeroMutedFromSetting: none,
      },
      "@/lib/hero-ended": { getHeroEnded: () => false, setHeroEnded: none },
      "@/lib/visibility": { usePageVisible: () => true },
      "@/lib/use-trailer-video": {
        useTrailerVideo: () => ({
          slot: { current: null },
          video: { current: null },
          ready: false,
        }),
      },
      "@/lib/watchlist": { toggleWatchlist: none, useInWatchlist: () => false },
      "react/jsx-runtime": jsx,
    },
    { window: { setTimeout: () => 0, clearTimeout: none }, IntersectionObserver: class {} },
  );
  return {
    render: (meta: Record<string, unknown>) => h.render({ meta }),
    backdrop: (tree: unknown): string | undefined =>
      all(tree).find((n) => n.type === "img" && n.props.fetchPriority)?.props.src,
  };
}

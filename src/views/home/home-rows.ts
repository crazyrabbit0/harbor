import {
  createAddonCatalogFetcher,
  isCollectionCatalog,
  normalizeName,
  type AddonRow,
} from "@/lib/addons";
import { topMovies, topSeries, type Meta } from "@/lib/cinemeta";
import {
  jikanNewReleases,
  jikanTopAiring,
  jikanTopPopular,
  jikanUpcoming,
  stripFranchiseSuffix,
} from "@/lib/providers/jikan";
import { tmdbMovieRow, tmdbSeriesRow, tmdbTrending } from "@/lib/providers/tmdb";
import { withTmdbDeadline } from "@/lib/providers/tmdb/tmdb-client";
import { type Settings } from "@/lib/settings";
import type { HomeRow, RowSpec } from "./home-types";

export const MAX_PER_ROW = 30;

export function buildTmdbSpecs(settings: Settings): RowSpec[] {
  const key = settings.tmdbKey;
  const region = settings.region;
  return [
    {
      key: "tmdb-trending-movies",
      type: "movie",
      name: "Trending This Week",
      fetcher: (p) => tmdbTrending(key, "movie", "week", p),
    },
    {
      key: "tmdb-now-playing",
      type: "movie",
      name: "In Theaters Now",
      noDedup: true,
      fetcher: (p) => tmdbMovieRow(key, "now_playing", region, p),
    },
    {
      key: "tmdb-popular-movies",
      type: "movie",
      name: "Popular Movies",
      fetcher: (p) => tmdbMovieRow(key, "popular", region, p),
    },
    {
      key: "tmdb-trending-tv",
      type: "series",
      name: "Trending Series",
      fetcher: (p) => tmdbTrending(key, "tv", "week", p),
    },
    {
      key: "tmdb-on-the-air",
      type: "series",
      name: "On The Air",
      noDedup: true,
      fetcher: (p) => tmdbSeriesRow(key, "on_the_air", p),
    },
    {
      key: "tmdb-popular-tv",
      type: "series",
      name: "Popular Series",
      fetcher: (p) => tmdbSeriesRow(key, "popular", p),
    },
    {
      key: "tmdb-top-rated-tv",
      type: "series",
      name: "Top Rated Series",
      fetcher: (p) => tmdbSeriesRow(key, "top_rated", p),
    },
    {
      key: "tmdb-top-rated-movies",
      type: "movie",
      name: "Top Rated Movies",
      fetcher: (p) => tmdbMovieRow(key, "top_rated", region, p),
    },
  ];
}

// First pages give up early so an unreachable TMDB reaches the Cinemeta fallback quickly; pagination keeps the full deadline.
export const TMDB_FIRST_PAGE_TIMEOUT_MS = 5000;

export async function buildTmdbRows(settings: Settings) {
  const specs = buildTmdbSpecs(settings);
  let failed = 0;
  const firstPages = await Promise.all(
    specs.map((s) =>
      withTmdbDeadline(TMDB_FIRST_PAGE_TIMEOUT_MS, () => s.fetcher(1)).catch(() => {
        failed += 1;
        return [] as Meta[];
      }),
    ),
  );
  const all: HomeRow[] = specs.map((spec, i) => ({
    key: spec.key,
    type: spec.type,
    name: spec.name,
    metas: firstPages[i],
    page: 1,
    hasMore: firstPages[i].length > 0,
    noDedup: spec.noDedup,
    fetcher: spec.fetcher,
  }));
  const rows = all.filter((r) => r.metas.length > 0);
  // Rows that came back empty may only have missed the first-page deadline; Home retries them without it.
  const pending = all.filter((r) => r.metas.length === 0);

  const byKey = (k: string) => rows.find((r) => r.key === k)?.metas ?? [];
  const hero = [
    byKey("tmdb-trending-movies")[0],
    byKey("tmdb-trending-tv")[0],
    byKey("tmdb-now-playing")[0],
    byKey("tmdb-on-the-air")[0],
  ].filter(Boolean) as Meta[];
  return { rows, hero, failed, pending, order: all.map((r) => r.key) };
}

// Fetches page 1 of rows that missed the first-page deadline; it joins their running requests or reads the cache.
export async function resolvePendingTmdbRows(pending: HomeRow[]): Promise<HomeRow[]> {
  const pages = await Promise.all(
    pending.map((r) => (r.fetcher ? r.fetcher(1).catch(() => [] as Meta[]) : [])),
  );
  return pending
    .map((r, i) => ({ ...r, metas: pages[i], hasMore: pages[i].length > 0 }))
    .filter((r) => r.metas.length > 0);
}

// Inserts late rows at their spec position among the rows already built.
export function insertLateRows(rows: HomeRow[], late: HomeRow[], order: string[]): HomeRow[] {
  if (late.length === 0) return rows;
  const rank = new Map(order.map((key, i) => [key, i]));
  const have = new Set(rows.map((r) => r.key));
  const merged = [...rows, ...late.filter((r) => !have.has(r.key))];
  return merged.sort((a, b) => (rank.get(a.key) ?? 1e9) - (rank.get(b.key) ?? 1e9));
}

export async function buildCinemetaRows() {
  let failed = 0;
  const guard = (p: Promise<Meta[]>): Promise<Meta[]> =>
    p.catch(() => {
      failed += 1;
      return [] as Meta[];
    });
  const [
    movies,
    series,
    mDrama,
    mComedy,
    mAction,
    mScifi,
    mThriller,
    mAnimation,
    mHorror,
    mRomance,
    mAdventure,
    mDocumentary,
    mMystery,
    mFantasy,
    sDrama,
    sComedy,
    sCrime,
  ] = await Promise.all([
    guard(topMovies()),
    guard(topSeries()),
    guard(topMovies("Drama")),
    guard(topMovies("Comedy")),
    guard(topMovies("Action")),
    guard(topMovies("Sci-Fi")),
    guard(topMovies("Thriller")),
    guard(topMovies("Animation")),
    guard(topMovies("Horror")),
    guard(topMovies("Romance")),
    guard(topMovies("Adventure")),
    guard(topMovies("Documentary")),
    guard(topMovies("Mystery")),
    guard(topMovies("Fantasy")),
    guard(topSeries("Drama")),
    guard(topSeries("Comedy")),
    guard(topSeries("Crime")),
  ]);
  const make = (key: string, type: "movie" | "series", name: string, metas: Meta[]): HomeRow => ({
    key,
    type,
    name,
    metas,
    page: 1,
    hasMore: false,
  });
  const rows: HomeRow[] = [
    make("cm-top-movies", "movie", "Top 10 on Stremio", movies.slice(0, 10)),
    make("cm-popular", "movie", "Popular Movies", movies.slice(10, 40)),
    make("cm-drama", "movie", "Top 10 Drama", mDrama.slice(0, 10)),
    make("cm-trending-tv", "series", "Trending Series", series.slice(0, 30)),
    make("cm-comedy", "movie", "Top 10 Comedy", mComedy.slice(0, 10)),
    make("cm-action", "movie", "Action Hits", mAction.slice(0, 30)),
    make("cm-scifi", "movie", "Sci-Fi & Fantasy", mScifi.slice(0, 30)),
    make("cm-thriller", "movie", "Thrillers", mThriller.slice(0, 30)),
    make("cm-animation", "movie", "Animated Movies", mAnimation.slice(0, 30)),
    make("cm-horror", "movie", "Horror", mHorror.slice(0, 30)),
    make("cm-romance", "movie", "Romance", mRomance.slice(0, 30)),
    make("cm-adventure", "movie", "Adventure", mAdventure.slice(0, 30)),
    make("cm-documentary", "movie", "Documentaries", mDocumentary.slice(0, 30)),
    make("cm-mystery", "movie", "Mystery", mMystery.slice(0, 30)),
    make("cm-fantasy", "movie", "Fantasy", mFantasy.slice(0, 30)),
    make("cm-drama-tv", "series", "Drama Series", sDrama.slice(0, 30)),
    make("cm-comedy-tv", "series", "Comedy Series", sComedy.slice(0, 30)),
    make("cm-crime-tv", "series", "Crime Series", sCrime.slice(0, 30)),
  ].filter((r) => r.metas.length > 0);
  const hero = [movies[0], series[0], mDrama[0], mComedy[0], mAction[0], mScifi[0]].filter(
    Boolean,
  ) as Meta[];
  return { rows, hero, failed };
}

// Each anime row holds up to three Jikan pages; only the first loads up front, the rest on scroll.
const ANIME_ROW_PAGES = 3;
const ANIME_ROW_MAX = 60;

// `eagerPages` loads that many pages up front, for surfaces without row pagination (Big Picture).
export async function buildAnimeHomeRows(eagerPages = 1): Promise<HomeRow[]> {
  const cleanMetas = (list: Meta[]): Meta[] =>
    list.map((m) => {
      const cleaned = stripFranchiseSuffix(m.name);
      return cleaned === m.name ? m : { ...m, name: cleaned };
    });
  const pagedFetcher =
    (fn: (page: number) => Promise<Meta[]>) =>
    async (page: number): Promise<Meta[]> =>
      page > ANIME_ROW_PAGES ? [] : cleanMetas(await fn(page));
  const specs = [
    { key: "anime-airing", name: "Trending Anime", fn: jikanTopAiring },
    { key: "anime-new", name: "New Anime Releases", fn: jikanNewReleases },
    { key: "anime-popular", name: "Popular Anime", fn: jikanTopPopular },
    { key: "anime-upcoming", name: "Upcoming Anime", fn: jikanUpcoming },
  ];
  try {
    const rows = await Promise.all(
      specs.map(async (spec): Promise<HomeRow | null> => {
        const fetcher = pagedFetcher(spec.fn);
        const pages = Math.max(1, Math.min(eagerPages, ANIME_ROW_PAGES));
        const lists = await Promise.all(
          Array.from({ length: pages }, (_, i) => fetcher(i + 1).catch(() => [] as Meta[])),
        );
        const seen = new Set<string>();
        const first = lists.flat().filter((m) => !seen.has(m.id) && (seen.add(m.id), true));
        if (first.length < 6) return null;
        return {
          key: spec.key,
          type: "series",
          name: spec.name,
          metas: first.slice(0, ANIME_ROW_MAX),
          page: pages,
          hasMore: pages < ANIME_ROW_PAGES,
          noDedup: true,
          fetcher,
          maxItems: ANIME_ROW_MAX,
        };
      }),
    );
    return rows.filter((r): r is HomeRow => r !== null);
  } catch {
    return [];
  }
}

const STREAMING_SERVICE_PATTERNS = [
  /\bnetflix\b/,
  /\bdisney\s*\+?\b/,
  /\bdisney\s*plus\b/,
  /\bhulu\b/,
  /\bprime\s*video\b/,
  /\bamazon\s*prime\b/,
  /\bapple\s*tv\s*\+?\b/,
  /\bappletv\b/,
  /\bhbo\s*max\b/,
  /\bmax\b/,
  /\bparamount\s*\+?\b/,
  /\bpeacock\b/,
  /\bstarz\b/,
  /\bshowtime\b/,
  /\bcrunchyroll\b/,
];

export function isStreamingServiceRow(name: string): boolean {
  const n = (name ?? "").toLowerCase();
  return STREAMING_SERVICE_PATTERNS.some((rx) => rx.test(n));
}

export function mergeRows(
  built: HomeRow[],
  addons: AddonRow[],
  opts: { dedup?: boolean } = {},
): HomeRow[] {
  const dedup = opts.dedup ?? true;
  const addonTypesByName = new Map<string, Set<string>>();
  for (const addon of addons) {
    const key = addon.name.trim().toLowerCase();
    const types = addonTypesByName.get(key) ?? new Set<string>();
    types.add(addon.type);
    addonTypesByName.set(key, types);
  }
  const seen = new Set<string>();
  const out: HomeRow[] = [];
  for (const r of built) {
    if (dedup) seen.add(normalizeName(r.name, r.type));
    out.push(r);
  }
  for (const a of addons) {
    if (dedup) {
      const key = normalizeName(a.name, a.type);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const step = a.metas.length;
    const more = a.more;
    const origin = a.metas[0]?.addonOrigin;
    const collection = isCollectionCatalog({ type: a.type, id: more?.id, name: a.name });
    const canPage = !!more && step > 0;
    const sameNameTypes = addonTypesByName.get(a.name.trim().toLowerCase());
    const name =
      sameNameTypes && sameNameTypes.size > 1
        ? `${a.name}: ${a.type === "movie" ? "Movies" : a.type === "series" ? "Series" : a.type}`
        : a.name;
    out.push({
      key: a.key,
      type: a.type as "movie" | "series",
      name,
      metas: a.metas,
      page: 1,
      hasMore: canPage,
      fetcher:
        canPage && more
          ? createAddonCatalogFetcher(more, {
              initialPageSize: step,
              mapMeta:
                origin || collection
                  ? (m) => ({
                      ...m,
                      ...(origin ? { addonOrigin: origin } : null),
                      ...(collection ? { isCollection: true } : null),
                    })
                  : undefined,
            })
          : undefined,
    });
  }
  return out;
}

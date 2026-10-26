import { lruSet } from "@/lib/cache";
import { idbCacheGetFresh, idbCacheSet } from "@/lib/idb-cache";
import { registerEvictable } from "@/lib/maintenance";
import { safeFetch } from "@/lib/safe-fetch";
import { fetchCsmAdvisory } from "@/lib/providers/csm";

// IMDb's public GraphQL endpoint: keyless, CORS-enabled for the app's origins, and the source imdb.com itself reads.
const IMDB_GRAPHQL = "https://caching.graphql.imdb.com/";
const EPISODE_PAGE = 250;
const MAX_EPISODE_PAGES = 12;

export type ParentalCategory = { category: string; severity: string };

async function imdbQuery<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const res = await safeFetch(IMDB_GRAPHQL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-imdb-client-name": "imdb-web-next-localized",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { data?: T };
  return j.data ?? null;
}

const TITLE_RATING = `query($id: ID!) { title(id: $id) { ratingsSummary { aggregateRating } } }`;

const EPISODE_RATINGS = `query($id: ID!, $first: Int!, $after: ID) { title(id: $id) { episodes { episodes(first: $first, after: $after) {
  pageInfo { hasNextPage endCursor }
  edges { node { series { displayableEpisodeNumber { episodeNumber { text } displayableSeason { text } } } ratingsSummary { aggregateRating } } }
} } } }`;

const PARENTS_GUIDE = `query($id: ID!) { title(id: $id) { certificate { rating } parentsGuide { categories { category { text } severity { text } } } } }`;

type EpisodeList = {
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  edges?: Array<{
    node?: {
      series?: {
        displayableEpisodeNumber?: {
          episodeNumber?: { text?: string };
          displayableSeason?: { text?: string };
        };
      };
      ratingsSummary?: { aggregateRating?: number | null };
    };
  }>;
};

type EpisodePage = { title?: { episodes?: { episodes?: EpisodeList } } };

// Keys are "season:episode", e.g. "1:3"; callers look ratings up that way.
export async function fetchImdbEpisodeRatings(seriesTt: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let after: string | null = null;
  for (let page = 0; page < MAX_EPISODE_PAGES; page++) {
    const data: EpisodePage | null = await imdbQuery<EpisodePage>(EPISODE_RATINGS, {
      id: seriesTt,
      first: EPISODE_PAGE,
      after,
    });
    const list: EpisodeList | undefined = data?.title?.episodes?.episodes;
    if (!list) break;
    for (const edge of list.edges ?? []) {
      const num = edge.node?.series?.displayableEpisodeNumber;
      const season = Number(num?.displayableSeason?.text);
      const episode = Number(num?.episodeNumber?.text);
      const rating = Number(edge.node?.ratingsSummary?.aggregateRating);
      if (Number.isInteger(season) && Number.isInteger(episode) && rating > 0) {
        map.set(`${season}:${episode}`, rating);
      }
    }
    after = list.pageInfo?.hasNextPage ? (list.pageInfo.endCursor ?? null) : null;
    if (!after) break;
  }
  return map;
}

const titleCache = new Map<string, number | null>();
const parentalCache = new Map<string, ParentalCategory[]>();
const parentalInflight = new Map<string, Promise<ParentalCategory[]>>();
const EPISODE_RATINGS_TTL_MS = 60 * 60_000;
const EMPTY_EPISODE_RATINGS_TTL_MS = 60_000;
const episodeCache = new Map<string, { ratings: Map<string, number>; expiresAt: number }>();
const episodeInflight = new Map<string, Promise<Map<string, number>>>();

registerEvictable("harbor-imdb-episodes", (aggressive) => {
  if (aggressive) episodeCache.clear();
});

registerEvictable("harbor-imdb-parental", (aggressive) => {
  if (aggressive) parentalCache.clear();
});

export async function harborImdbEpisodes(seriesTt: string): Promise<Map<string, number>> {
  if (!seriesTt.startsWith("tt")) return new Map();
  const cached = harborImdbEpisodesCached(seriesTt);
  if (cached) return cached;
  const pending = episodeInflight.get(seriesTt);
  if (pending) return pending;
  const p = (async () => {
    let map = new Map<string, number>();
    try {
      map = await fetchImdbEpisodeRatings(seriesTt);
    } catch {
      // A temporary outage must not pin missing ratings for the entire session.
    } finally {
      episodeInflight.delete(seriesTt);
    }
    lruSet(
      episodeCache,
      seriesTt,
      {
        ratings: map,
        expiresAt:
          Date.now() + (map.size > 0 ? EPISODE_RATINGS_TTL_MS : EMPTY_EPISODE_RATINGS_TTL_MS),
      },
      200,
    );
    return map;
  })();
  episodeInflight.set(seriesTt, p);
  return p;
}

export function harborImdbEpisodesCached(seriesTt: string): Map<string, number> | undefined {
  const cached = episodeCache.get(seriesTt);
  if (!cached) return undefined;
  if (Date.now() >= cached.expiresAt) {
    episodeCache.delete(seriesTt);
    return undefined;
  }
  return cached.ratings;
}

// Title ratings move slowly, so a day-old value is kept on disk and saves one GraphQL call per card per launch.
const TITLE_DISK_PREFIX = "imdb.rating.v1:";
const TITLE_DISK_TTL_MS = 24 * 60 * 60 * 1000;
const titleInflight = new Map<string, Promise<number | null>>();

export function harborImdbTitle(tt: string): Promise<number | null> {
  if (!tt.startsWith("tt")) return Promise.resolve(null);
  if (titleCache.has(tt)) return Promise.resolve(titleCache.get(tt) ?? null);
  const pending = titleInflight.get(tt);
  if (pending) return pending;
  const p = (async () => {
    const stored = await idbCacheGetFresh(TITLE_DISK_PREFIX + tt, TITLE_DISK_TTL_MS).catch(
      () => null,
    );
    if (stored) {
      const out = typeof stored.data === "number" ? stored.data : null;
      lruSet(titleCache, tt, out, 2000);
      return out;
    }
    try {
      const data = await imdbQuery<{
        title?: { ratingsSummary?: { aggregateRating?: number | null } } | null;
      }>(TITLE_RATING, { id: tt });
      if (!data) return null;
      const v = Number(data.title?.ratingsSummary?.aggregateRating);
      const out = Number.isFinite(v) && v > 0 ? v : null;
      lruSet(titleCache, tt, out, 2000);
      void idbCacheSet(TITLE_DISK_PREFIX + tt, { at: Date.now(), data: out }).catch(() => {});
      return out;
    } catch {
      return null;
    }
  })().finally(() => {
    titleInflight.delete(tt);
  });
  titleInflight.set(tt, p);
  return p;
}

export function harborImdbTitleCached(tt: string): number | null | undefined {
  return titleCache.get(tt);
}

async function resolveTitleForParental(
  tt: string,
): Promise<{ name: string; year?: string | number; isMovie: boolean } | null> {
  for (const type of ["series", "movie"] as const) {
    try {
      const res = await safeFetch(`https://v3-cinemeta.strem.io/meta/${type}/${tt}.json`);
      if (res.ok) {
        const j = (await res.json()) as {
          meta?: { name?: string; type?: string; releaseInfo?: string; releaseDate?: string };
        };
        if (j.meta?.name) {
          return {
            name: j.meta.name,
            year: j.meta.releaseInfo ?? j.meta.releaseDate,
            isMovie: type === "movie",
          };
        }
      }
    } catch {}
  }
  return null;
}

const mpaRatingCache = new Map<string, string | null>();

export function harborImdbMpaRating(rawTt: string): string | null {
  const match = rawTt.match(/tt\d+/);
  const tt = match ? match[0] : rawTt;
  return mpaRatingCache.get(tt) ?? null;
}

export async function harborImdbParental(rawTt: string): Promise<ParentalCategory[]> {
  const match = rawTt.match(/tt\d+/);
  const tt = match ? match[0] : rawTt;
  if (!tt.startsWith("tt")) return [];
  const cached = parentalCache.get(tt);
  if (cached) return cached;
  const pending = parentalInflight.get(tt);
  if (pending) return pending;
  const p = (async () => {
    try {
      const data = await imdbQuery<{
        title?: {
          certificate?: { rating?: string | null } | null;
          parentsGuide?: {
            categories?: Array<{
              category?: { text?: string };
              severity?: { text?: string };
            }> | null;
          } | null;
        } | null;
      }>(PARENTS_GUIDE, { id: tt });
      const certificate = data?.title?.certificate?.rating;
      if (certificate && certificate !== "Not Rated") mpaRatingCache.set(tt, certificate);
      const out: ParentalCategory[] = [];
      for (const c of data?.title?.parentsGuide?.categories ?? []) {
        const category = c.category?.text;
        const severity = c.severity?.text;
        if (category && severity && severity !== "None") out.push({ category, severity });
      }
      if (out.length > 0) {
        lruSet(parentalCache, tt, out, 200);
        return out;
      }
    } catch {
      // IMDb unavailable; fall back to Common Sense Media.
    }

    try {
      const titleInfo = await resolveTitleForParental(tt);
      if (titleInfo?.name) {
        const csm = await fetchCsmAdvisory(titleInfo.name, titleInfo.year, titleInfo.isMovie);
        if (csm) {
          if (csm.badgeRating) mpaRatingCache.set(tt, csm.badgeRating);
          if (csm.categories.length > 0) {
            const out = csm.categories.filter((c) => c.severity !== "None");
            if (out.length > 0) {
              lruSet(parentalCache, tt, out, 200);
              return out;
            }
          }
        }
      }
    } catch {
      // Fallback failed.
    }

    lruSet(parentalCache, tt, [], 200);
    return [];
  })().finally(() => {
    parentalInflight.delete(tt);
  });
  parentalInflight.set(tt, p);
  return p;
}

export function harborImdbParentalCached(tt: string): ParentalCategory[] | undefined {
  return parentalCache.get(tt);
}

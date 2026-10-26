import { meta as cinemetaMeta } from "./cinemeta";
import {
  fetchAnticipatedMovies,
  fetchAnticipatedShows,
  fetchUpcomingEpisodes,
  fetchUpcomingMovies,
} from "./trakt/calendar";
import type { CalendarItem } from "./calendar";
import { localDateTimeFromIso } from "./calendar-time";
import {
  mapLimit,
  progressReporter,
  resolveSavedCalendar,
  type CountReporter,
  type SavedCandidate,
} from "./calendar-library";
import { fetchWatchlist as fetchSimklWatchlist, fetchWatchingItems } from "./simkl/watchlist";
import { fetchSimklCdnCalendar } from "./simkl/calendar";
import { isAuthenticated as simklConnected } from "./simkl/session";
import { fetchAniListAiringCalendar as fetchAniListAiring } from "./anilist/airing";
import { fetchDubSchedule } from "./providers/anime-dub-sub";

export { fetchLibraryCalendar } from "./calendar-library";

interface CacheEntry {
  items: CalendarItem[];
  timestamp: number;
}

const calendarCache = new Map<string, CacheEntry>();
const calendarInFlight = new Map<string, Promise<CalendarItem[]>>();
const CACHE_STALE_MS = 30 * 60 * 1000;

function withCalendarCache(
  cacheKey: string,
  fetcher: () => Promise<CalendarItem[]>,
): Promise<CalendarItem[]> {
  const cached = calendarCache.get(cacheKey);
  const now = Date.now();

  if (cached) {
    if (now - cached.timestamp >= CACHE_STALE_MS) {
      if (!calendarInFlight.has(cacheKey)) {
        const promise = fetcher()
          .then((items) => {
            calendarCache.set(cacheKey, { items, timestamp: Date.now() });
            return items;
          })
          .catch(() => cached.items)
          .finally(() => {
            calendarInFlight.delete(cacheKey);
          });
        calendarInFlight.set(cacheKey, promise);
      }
    }
    return Promise.resolve(cached.items);
  }

  if (calendarInFlight.has(cacheKey)) {
    return calendarInFlight.get(cacheKey)!;
  }

  const promise = fetcher()
    .then((items) => {
      calendarCache.set(cacheKey, { items, timestamp: Date.now() });
      return items;
    })
    .finally(() => {
      calendarInFlight.delete(cacheKey);
    });
  calendarInFlight.set(cacheKey, promise);
  return promise;
}

export function clearCalendarSourceCache() {
  calendarCache.clear();
  calendarInFlight.clear();
}

export async function fetchSimklPremieresCalendar(
  year: number,
  month: number,
): Promise<CalendarItem[]> {
  const cacheKey = `simkl-premieres:${year}-${month}`;
  return withCalendarCache(cacheKey, () => fetchSimklCdnCalendar(year, month).catch(() => []));
}

export async function fetchAniListAiringCalendar(
  year: number,
  month: number,
): Promise<CalendarItem[]> {
  const cacheKey = `anilist-airing:${year}-${month}`;
  return withCalendarCache(cacheKey, () => fetchAniListAiring(year, month).catch(() => []));
}

export async function fetchAnimeDubCalendar(year: number, month: number): Promise<CalendarItem[]> {
  const cacheKey = `anime-dub:${year}-${month}`;
  return withCalendarCache(cacheKey, () => mapDubFeedToCalendar(year, month).catch(() => []));
}

async function mapDubFeedToCalendar(year: number, month: number): Promise<CalendarItem[]> {
  const entries = await fetchDubSchedule();
  const out: CalendarItem[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const media = e?.media?.media;
    if (!media) continue;
    if (media.isAdult) continue;
    if (media.format === "MOVIE" || e.episodeNumber == null) continue;
    const { date: dateISO, time, atMs } = localDateTimeFromIso(e.episodeDate);
    if (!inMonth(dateISO, year, month)) continue;
    const title =
      media.title?.english?.trim() ||
      media.title?.romaji?.trim() ||
      e.english?.trim() ||
      e.romaji?.trim() ||
      "Untitled";
    const baseId = media.idMal != null ? `mal:${media.idMal}` : `anilist:${media.id}`;
    const id = `${baseId}:1:${e.episodeNumber}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      imdbId: null,
      type: "tv",
      name: `${title} S1E${pad(e.episodeNumber)}`,
      poster: media.coverImage?.extraLarge ?? media.coverImage?.medium ?? null,
      background: media.bannerImage ?? null,
      releaseDate: dateISO,
      releaseTime: time,
      releaseAtMs: atMs,
      isAnime: true,
      overview: "",
      voteAverage: 0,
    });
  }
  out.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  return out;
}

export async function fetchSimklCalendar(
  year: number,
  month: number,
  opts: { tmdbKey: string; onProgress?: (items: CalendarItem[]) => void; onCount?: CountReporter },
): Promise<CalendarItem[]> {
  if (!simklConnected()) return [];
  const cacheKey = `simkl-calendar:${year}-${month}`;
  return withCalendarCache(cacheKey, async () => {
    const [watchlist, watching] = await Promise.all([
      fetchSimklWatchlist().catch(() => []),
      fetchWatchingItems().catch(() => []),
    ]);
    const items = [...watchlist, ...watching];
    const candidates: SavedCandidate[] = [];
    const seenIds = new Set<string>();
    for (const it of items) {
      const id =
        it.ids.imdb ??
        (it.ids.tmdb
          ? it.type === "movie"
            ? `tmdb:movie:${it.ids.tmdb}`
            : `tmdb:tv:${it.ids.tmdb}`
          : it.ids.mal
            ? `mal:${it.ids.mal}`
            : null);
      if (!id) continue;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      candidates.push({
        id,
        type: it.type === "show" ? "series" : "movie",
        name: it.title,
        mtime: 0,
        temp: false,
      });
    }
    if (candidates.length === 0) return [];
    return resolveSavedCalendar(candidates, year, month, opts);
  });
}

const TRAKT_MAX_FORWARD_MONTHS = 6;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function inMonth(iso: string, year: number, month: number): boolean {
  if (!iso) return false;
  const [y, m] = iso.split("-").map(Number);
  return y === year && (m ?? 0) - 1 === month;
}

function isAnimationGenre(genres: string[] | undefined): boolean {
  if (!genres) return false;
  const wanted = ["animation", "anime"];
  return genres.some((g) => wanted.includes(g.toLowerCase()));
}

type ProgressOpts = { onProgress?: (items: CalendarItem[]) => void };
type CinemetaMetaResult = Awaited<ReturnType<typeof cinemetaMeta>>;
const META_CONCURRENCY = 6;

// The calendar is drawn from the source's own fields first; Cinemeta posters and ratings fill in a few lookups at a time.
async function enrichWithCinemeta(
  wanted: Array<{ type: "series" | "movie"; id: string }>,
  build: (meta: Map<string, CinemetaMetaResult>) => CalendarItem[],
  opts: ProgressOpts,
): Promise<CalendarItem[]> {
  const metas = new Map<string, CinemetaMetaResult>();
  const { report, cancel } = progressReporter(() => build(metas), opts.onProgress);
  report();
  await mapLimit(wanted, META_CONCURRENCY, async ({ type, id }) => {
    metas.set(`${type}:${id}`, await cinemetaMeta(type, id).catch(() => null));
    report();
  });
  cancel();
  return build(metas);
}

export async function fetchTraktCalendar(
  year: number,
  month: number,
  opts: ProgressOpts = {},
): Promise<CalendarItem[]> {
  const today = new Date();
  const cur = new Date(year, month, 1);
  const fwdMonths =
    (cur.getFullYear() - today.getFullYear()) * 12 + (cur.getMonth() - today.getMonth());
  if (fwdMonths < 0 || fwdMonths > TRAKT_MAX_FORWARD_MONTHS) return [];
  const days = Math.max(31, (fwdMonths + 1) * 31);
  const [eps, mvs] = await Promise.all([fetchUpcomingEpisodes(days), fetchUpcomingMovies(days)]);

  const epsInMonth = eps
    .map((ep) => ({ ep, ...localDateTimeFromIso(ep.airDate) }))
    .filter((x) => inMonth(x.date, year, month));
  const mvsInMonth = mvs
    .map((m) => ({ m, ...localDateTimeFromIso(m.contextDate) }))
    .filter((x) => inMonth(x.date, year, month));

  const showIds = [
    ...new Set(epsInMonth.map((x) => x.ep.ids.imdb).filter((x): x is string => !!x)),
  ];
  const movieIds = [
    ...new Set(mvsInMonth.map((x) => x.m.ids.imdb).filter((x): x is string => !!x)),
  ];
  const wanted = [
    ...showIds.map((id) => ({ type: "series" as const, id })),
    ...movieIds.map((id) => ({ type: "movie" as const, id })),
  ];
  return enrichWithCinemeta(
    wanted,
    (metas) => buildTraktItems(epsInMonth, mvsInMonth, metas),
    opts,
  );
}

function buildTraktItems(
  epsInMonth: Array<{
    ep: Awaited<ReturnType<typeof fetchUpcomingEpisodes>>[number];
    date: string;
    time?: string;
    atMs?: number;
  }>,
  mvsInMonth: Array<{
    m: Awaited<ReturnType<typeof fetchUpcomingMovies>>[number];
    date: string;
    time?: string;
    atMs?: number;
  }>,
  metas: Map<string, CinemetaMetaResult>,
): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const { ep, date, time, atMs } of epsInMonth) {
    const imdb = ep.ids.imdb ?? null;
    const meta = imdb ? (metas.get(`series:${imdb}`) ?? null) : null;
    const baseId = imdb ?? `trakt:${ep.ids.tmdb ?? ep.ids.tvdb ?? ep.title}`;
    const epLabel = `S${pad(ep.season)}E${pad(ep.number)}`;
    const vid = meta?.videos?.find(
      (v) => (v.season ?? 0) === ep.season && (v.episode ?? v.number ?? 0) === ep.number,
    );
    out.push({
      id: `${baseId}:${ep.season}:${ep.number}`,
      imdbId: imdb,
      type: "tv",
      name: ep.episodeTitle
        ? `${ep.title} ${epLabel}: ${ep.episodeTitle}`
        : `${ep.title} ${epLabel}`,
      poster: meta?.poster ?? vid?.thumbnail ?? null,
      background: meta?.background ?? null,
      releaseDate: date,
      releaseTime: time,
      releaseAtMs: atMs,
      isAnime: isAnimationGenre(meta?.genres),
      overview: meta?.description ?? "",
      voteAverage: parseFloat(meta?.imdbRating ?? "0") || 0,
    });
  }
  for (const { m, date, time, atMs } of mvsInMonth) {
    const imdb = m.ids.imdb ?? null;
    const meta = imdb ? (metas.get(`movie:${imdb}`) ?? null) : null;
    const id = imdb ?? `trakt:${m.ids.tmdb ?? m.title}`;
    out.push({
      id,
      imdbId: imdb,
      type: "movie",
      name: m.title,
      poster: meta?.poster ?? null,
      background: meta?.background ?? null,
      releaseDate: date,
      releaseTime: time,
      releaseAtMs: atMs,
      isAnime: isAnimationGenre(meta?.genres),
      overview: meta?.description ?? "",
      voteAverage: parseFloat(meta?.imdbRating ?? "0") || 0,
    });
  }
  out.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  return out;
}

export async function fetchAnticipatedCalendar(
  year: number,
  month: number,
  opts: ProgressOpts = {},
): Promise<CalendarItem[]> {
  const [shows, mvs] = await Promise.all([fetchAnticipatedShows(), fetchAnticipatedMovies()]);
  const inMonthShows = shows.filter((s) => inMonth(s.firstAired, year, month));
  const inMonthMovies = mvs.filter((m) => inMonth(m.released, year, month));
  const wanted = [
    ...inMonthShows.flatMap((s) =>
      s.ids.imdb ? [{ type: "series" as const, id: s.ids.imdb }] : [],
    ),
    ...inMonthMovies.flatMap((m) =>
      m.ids.imdb ? [{ type: "movie" as const, id: m.ids.imdb }] : [],
    ),
  ];
  return enrichWithCinemeta(
    wanted,
    (metas) => buildAnticipatedItems(inMonthShows, inMonthMovies, metas),
    opts,
  );
}

function buildAnticipatedItems(
  inMonthShows: Awaited<ReturnType<typeof fetchAnticipatedShows>>,
  inMonthMovies: Awaited<ReturnType<typeof fetchAnticipatedMovies>>,
  metas: Map<string, CinemetaMetaResult>,
): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (let i = 0; i < inMonthShows.length; i++) {
    const s = inMonthShows[i];
    const meta = s.ids.imdb ? (metas.get(`series:${s.ids.imdb}`) ?? null) : null;
    const id = s.ids.imdb ?? `trakt:${s.ids.tmdb ?? s.ids.tvdb ?? s.title}`;
    out.push({
      id: `${id}:premiere`,
      imdbId: s.ids.imdb ?? null,
      type: "tv",
      name: `${s.title} (premiere)`,
      poster: meta?.poster ?? s.poster,
      background: meta?.background ?? null,
      releaseDate: s.firstAired,
      isAnime: false,
      overview: meta?.description ?? s.overview,
      voteAverage: parseFloat(meta?.imdbRating ?? "0") || 0,
    });
  }
  for (let i = 0; i < inMonthMovies.length; i++) {
    const m = inMonthMovies[i];
    const meta = m.ids.imdb ? (metas.get(`movie:${m.ids.imdb}`) ?? null) : null;
    const id = m.ids.imdb ?? `trakt:${m.ids.tmdb ?? m.title}`;
    out.push({
      id,
      imdbId: m.ids.imdb ?? null,
      type: "movie",
      name: m.title,
      poster: meta?.poster ?? m.poster,
      background: meta?.background ?? null,
      releaseDate: m.released,
      isAnime: false,
      overview: meta?.description ?? m.overview,
      voteAverage: parseFloat(meta?.imdbRating ?? "0") || 0,
    });
  }
  out.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  return out;
}

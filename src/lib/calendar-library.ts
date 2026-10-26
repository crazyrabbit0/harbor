import { meta as cinemetaMeta } from "./cinemeta";
import { libraryIfChanged, type LibraryItem } from "./stremio";
import { readLocalEntries } from "./watchlist";
import { fetchWatchlist as fetchTraktWatchlist } from "./trakt/watchlist";
import { tvmazeUpcoming } from "./providers/tvmaze";
import {
  tmdbFindByImdb,
  tmdbMovieRelease,
  tmdbTvPoster,
  tmdbTvUpcoming,
} from "./providers/tmdb/tmdb-calendar";
import { aniZipByAnilist, aniZipByKitsu, aniZipByMal, pickEpisodeTitle } from "./providers/anizip";
import type { CalendarItem } from "./calendar";
import { localDateTimeFromIso } from "./calendar-time";
import { setItemWithRecovery } from "./storage-recovery";

const SERIES_LIMIT = 80;
const MOVIE_LIMIT = 80;
const TMDB_CONCURRENCY = 6;
const TVMAZE_CONCURRENCY = 3;

export type SavedCandidate = {
  id: string;
  type: "movie" | "series";
  name: string;
  mtime: number;
  temp: boolean;
};

type Candidate = SavedCandidate;

type ResolvedEpisode = {
  season: number;
  number: number;
  name: string;
  airDate: string;
  releaseTime?: string;
  releaseAtMs?: number;
  image: string | null;
  overview: string;
  voteAverage: number;
};

type ResolvedSeries = {
  name: string;
  poster: string | null;
  isAnime: boolean;
  episodes: ResolvedEpisode[];
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MISS_TTL_MS = 30 * 60 * 1000;
const DISK_KEY = "harbor.calendar.resolved.v1";
const DISK_MAX = 400;
type Resolved = { at: number; series?: ResolvedSeries | null; movie?: CalendarItem | null };
let resolved: Map<string, Resolved> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Resolved shows and movies outlive the session, so reopening the calendar skips Cinemeta/TMDB until the TTL runs out.
function resolvedCache(): Map<string, Resolved> {
  if (resolved) return resolved;
  resolved = new Map();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISK_KEY) ?? "{}");
    const now = Date.now();
    for (const [k, v] of Object.entries((parsed ?? {}) as Record<string, Resolved>)) {
      if (v && typeof v.at === "number" && now - v.at < CACHE_TTL_MS) resolved.set(k, v);
    }
  } catch {
    resolved.clear();
  }
  return resolved;
}

// A miss can be a network failure, so it is retried sooner than a found show.
function fresh(entry: Resolved, value: unknown): boolean {
  return Date.now() - entry.at < (value ? CACHE_TTL_MS : MISS_TTL_MS);
}

function remember(key: string, entry: Resolved): void {
  const map = resolvedCache();
  map.delete(key);
  map.set(key, entry);
  for (const k of map.keys()) {
    if (map.size <= DISK_MAX) break;
    map.delete(k);
  }
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      setItemWithRecovery(DISK_KEY, JSON.stringify(Object.fromEntries(resolvedCache())));
    } catch {
      return;
    }
  }, 2000);
}

function wideWindow(): (iso: string) => boolean {
  const lo = Date.now() - 31 * 864e5;
  const hi = Date.now() + 400 * 864e5;
  return (iso) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= lo && t <= hi;
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function inMonthFactory(year: number, month: number): (iso: string) => boolean {
  return (iso) => {
    if (!iso) return false;
    const [y, m] = iso.split("-").map(Number);
    return y === year && (m ?? 0) - 1 === month;
  };
}

function isAnimationGenre(genres: string[] | undefined): boolean {
  if (!genres) return false;
  return genres.some((g) => {
    const l = g.toLowerCase();
    return l === "animation" || l === "anime";
  });
}

// A sliding window: each worker takes the next item as soon as its last one settles.
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function isAnimeId(id: string): boolean {
  return id.startsWith("kitsu:") || id.startsWith("mal:") || id.startsWith("anilist:");
}

function animeNumericId(id: string): number | null {
  const n = Number(id.split(":")[1]);
  return Number.isFinite(n) ? n : null;
}

async function animeUpcoming(
  id: string,
  inWindow: (date: string) => boolean,
  tmdbKey: string,
): Promise<ResolvedSeries | null> {
  const numId = animeNumericId(id);
  if (numId == null) return null;
  const mapping = id.startsWith("kitsu:")
    ? await aniZipByKitsu(numId)
    : id.startsWith("mal:")
      ? await aniZipByMal(numId)
      : await aniZipByAnilist(numId);
  if (!mapping?.episodes) return null;
  const episodes: ResolvedEpisode[] = [];
  for (const [k, ep] of Object.entries(mapping.episodes)) {
    const { date, time, atMs } = localDateTimeFromIso(ep.airDateUtc ?? ep.airDate);
    if (!date || !inWindow(date)) continue;
    episodes.push({
      season: ep.seasonNumber ?? 1,
      number: ep.episodeNumber ?? (Number(k) || 0),
      name: pickEpisodeTitle(ep) ?? "",
      airDate: date,
      releaseTime: time,
      releaseAtMs: atMs,
      image: ep.image ?? null,
      overview: ep.overview ?? "",
      voteAverage: 0,
    });
  }
  // AniZip has no series-poster field, only small per-episode stills, so the
  // per-episode images are frequently low-resolution. Resolve a proper poster
  // via the TMDB cross-reference AniZip already supplies, when available.
  let poster: string | null = null;
  const tmdbId = mapping.mappings?.themoviedb_id;
  const numTmdbId = typeof tmdbId === "string" ? Number(tmdbId) : tmdbId;
  if (tmdbKey && numTmdbId != null && Number.isFinite(numTmdbId)) {
    poster = await tmdbTvPoster(tmdbKey, numTmdbId).catch(() => null);
  }
  return {
    name: mapping.titles?.en ?? mapping.titles?.["x-jat"] ?? "",
    poster,
    isAnime: true,
    episodes,
  };
}

async function tmdbSeries(
  id: string,
  inWindow: (date: string) => boolean,
  tmdbKey: string,
): Promise<ResolvedSeries | null> {
  let tvId: number | null = null;
  if (id.startsWith("tmdb:tv:")) tvId = Number(id.split(":")[2]);
  else if (id.startsWith("tt"))
    tvId = (await tmdbFindByImdb(tmdbKey, id.split(":")[0], "series")).tvId;
  if (tvId == null || !Number.isFinite(tvId)) return null;
  return tmdbTvUpcoming(tmdbKey, tvId, inWindow);
}

// `ended` means Cinemeta dates the run as closed ("2008–2013"), so no other source is asked.
async function cinemetaSeriesUpcoming(
  id: string,
  inWindow: (date: string) => boolean,
): Promise<ResolvedSeries | "ended" | null> {
  const imdb = id.startsWith("tt") ? id.split(":")[0] : null;
  if (!imdb) return null;
  const m = await cinemetaMeta("series", imdb).catch(() => null);
  if (!m?.videos) return null;
  if (/\d{4}\s*[–-]\s*\d{4}/.test(m.releaseInfo ?? "") && m.videos.length > 0) {
    const last = m.videos.reduce((a, v) => Math.max(a, Date.parse(v.released ?? "") || 0), 0);
    if (last > 0 && last < Date.now() - 31 * 864e5) return "ended";
  }
  const episodes: ResolvedEpisode[] = [];
  for (const v of m.videos) {
    const { date, time, atMs } = localDateTimeFromIso(v.released ?? v.firstAired);
    if (!date || !inWindow(date)) continue;
    const number = v.episode ?? v.number;
    if (number == null) continue;
    episodes.push({
      season: v.season ?? 0,
      number,
      name: v.name ?? v.title ?? "",
      airDate: date,
      releaseTime: time,
      releaseAtMs: atMs,
      image: v.thumbnail ?? null,
      overview: "",
      voteAverage: 0,
    });
  }
  if (episodes.length === 0) return null;
  return { name: m.name, poster: m.poster ?? null, isAnime: isAnimationGenre(m.genres), episodes };
}

async function seriesUpcoming(
  c: Candidate,
  inWindow: (date: string) => boolean,
  tmdbKey: string,
): Promise<ResolvedSeries | null> {
  if (isAnimeId(c.id)) return animeUpcoming(c.id, inWindow, tmdbKey);
  // One Cinemeta request covers most shows; TMDB costs 3-4 (find, details, seasons), so it runs only on a miss.
  if (c.id.startsWith("tt")) {
    const cm = await cinemetaSeriesUpcoming(c.id, inWindow);
    if (cm === "ended") return null;
    if (cm) return cm;
  }
  if (tmdbKey) {
    const t = await tmdbSeries(c.id, inWindow, tmdbKey).catch(() => null);
    if (t) return t;
  } else if (c.id.startsWith("tt")) {
    const up = await tvmazeUpcoming(c.id.split(":")[0], inWindow).catch(() => null);
    if (up) {
      return {
        name: up.show.name,
        poster: up.show.image,
        isAnime: up.show.isAnime,
        episodes: up.episodes.map((e) => ({
          season: e.season,
          number: e.number,
          name: e.name,
          airDate: e.airdate,
          image: e.image,
          overview: e.summary,
          voteAverage: 0,
        })),
      };
    }
  }
  return null;
}

async function movieRelease(
  c: Candidate,
  inWindow: (date: string) => boolean,
  tmdbKey: string,
): Promise<CalendarItem | null> {
  const imdb = c.id.startsWith("tt") ? c.id.split(":")[0] : null;
  let movieId: number | null = null;
  if (imdb && tmdbKey) {
    // Cinemeta is one request and usually cached; a movie from two or more years back has no upcoming release to find.
    const cm = await cinemetaMeta("movie", imdb).catch(() => null);
    const year = Number((cm?.releaseInfo ?? "").slice(0, 4));
    if (year > 0 && year < new Date().getFullYear() - 1) return null;
  }
  if (c.id.startsWith("tmdb:movie:")) movieId = Number(c.id.split(":")[2]);
  else if (imdb && tmdbKey) movieId = (await tmdbFindByImdb(tmdbKey, imdb, "movie")).movieId;

  if (movieId != null && Number.isFinite(movieId) && tmdbKey) {
    const m = await tmdbMovieRelease(tmdbKey, movieId);
    if (!m || !inWindow(m.releaseDate)) return null;
    return {
      id: c.id,
      imdbId: imdb,
      type: "movie",
      name: m.name || c.name,
      poster: m.poster,
      background: m.background,
      releaseDate: m.releaseDate,
      isAnime: m.isAnime,
      overview: m.overview,
      voteAverage: m.voteAverage,
    };
  }
  if (imdb) {
    const m = await cinemetaMeta("movie", imdb);
    if (!m) return null;
    const date = (m.releaseDate ?? "").slice(0, 10);
    if (!inWindow(date)) return null;
    return {
      id: m.id,
      imdbId: imdb,
      type: "movie",
      name: m.name,
      poster: m.poster ?? null,
      background: m.background ?? null,
      releaseDate: date,
      isAnime: isAnimationGenre(m.genres),
      overview: m.description ?? "",
      voteAverage: parseFloat(m.imdbRating ?? "0") || 0,
    };
  }
  return null;
}

function gatherCandidates(
  stremio: LibraryItem[],
  local: ReturnType<typeof readLocalEntries>,
  trakt: Awaited<ReturnType<typeof fetchTraktWatchlist>>,
): Candidate[] {
  const byId = new Map<string, Candidate>();
  const add = (c: Candidate) => {
    const prev = byId.get(c.id);
    if (!prev) byId.set(c.id, c);
    else
      byId.set(c.id, {
        ...prev,
        temp: prev.temp && c.temp,
        mtime: Math.max(prev.mtime, c.mtime),
        name: prev.name || c.name,
      });
  };
  for (const i of stremio) {
    if (i.removed) continue;
    add({
      id: i._id,
      type: i.type === "series" ? "series" : "movie",
      name: i.name ?? "",
      mtime: Date.parse(i._mtime ?? "") || 0,
      temp: !!i.temp,
    });
  }
  for (const e of local) {
    add({ id: e.id, type: e.type, name: e.name ?? "", mtime: e.addedAt || 0, temp: false });
  }
  for (const t of trakt) {
    const id =
      t.ids.imdb ??
      (t.ids.tmdb
        ? t.type === "movie"
          ? `tmdb:movie:${t.ids.tmdb}`
          : `tmdb:tv:${t.ids.tmdb}`
        : null);
    if (!id) continue;
    add({
      id,
      type: t.type === "show" ? "series" : "movie",
      name: t.title ?? "",
      mtime: Date.parse(t.contextDate ?? "") || 0,
      temp: false,
    });
  }
  return Array.from(byId.values());
}

const curatedFirst = (a: Candidate, b: Candidate) =>
  (a.temp ? 1 : 0) - (b.temp ? 1 : 0) || b.mtime - a.mtime;

export async function fetchLibraryCalendar(
  authKey: string,
  year: number,
  month: number,
  opts: {
    tmdbKey: string;
    includeTrakt: boolean;
    onProgress?: (items: CalendarItem[]) => void;
    onCount?: CountReporter;
  },
): Promise<CalendarItem[]> {
  const local = readLocalEntries();
  let stremioFailed = false;
  const [stremio, trakt] = await Promise.all([
    authKey
      ? libraryIfChanged(authKey).catch((): LibraryItem[] => {
          stremioFailed = true;
          return [];
        })
      : Promise.resolve<LibraryItem[]>([]),
    opts.includeTrakt ? fetchTraktWatchlist().catch(() => []) : Promise.resolve([]),
  ]);

  const candidates = gatherCandidates(stremio, local, trakt);
  if (candidates.length === 0) {
    if (stremioFailed) throw new Error("Couldn't load your library");
    return [];
  }
  return resolveSavedCalendar(candidates, year, month, {
    tmdbKey: opts.tmdbKey,
    onProgress: opts.onProgress,
    onCount: opts.onCount,
  });
}

async function resolveSeriesCached(
  c: SavedCandidate,
  tmdbKey: string,
): Promise<ResolvedSeries | null> {
  const key = `series|${tmdbKey ? "t" : ""}|${c.id}`;
  const hit = resolvedCache().get(key);
  if (hit?.series !== undefined && fresh(hit, hit.series)) return hit.series;
  const series = await seriesUpcoming(c, wideWindow(), tmdbKey).catch(() => undefined);
  if (series !== undefined) remember(key, { at: Date.now(), series });
  return series ?? null;
}

async function resolveMovieCached(
  c: SavedCandidate,
  tmdbKey: string,
): Promise<CalendarItem | null> {
  const key = `movie|${tmdbKey ? "t" : ""}|${c.id}`;
  const hit = resolvedCache().get(key);
  if (hit?.movie !== undefined && fresh(hit, hit.movie)) return hit.movie;
  const movie = await movieRelease(c, wideWindow(), tmdbKey).catch(() => undefined);
  if (movie !== undefined) remember(key, { at: Date.now(), movie });
  return movie ?? null;
}

function seriesItems(
  c: SavedCandidate,
  r: ResolvedSeries,
  inMonth: (iso: string) => boolean,
): CalendarItem[] {
  const out: CalendarItem[] = [];
  const showName = r.name || c.name;
  for (const ep of r.episodes) {
    if (ep.season === 0 && ep.number === 0) continue;
    if (!inMonth(ep.airDate)) continue;
    const epLabel = `S${pad(ep.season)}E${pad(ep.number)}`;
    out.push({
      id: `${c.id}:${ep.season}:${ep.number}`,
      imdbId: c.id.startsWith("tt") ? c.id.split(":")[0] : null,
      type: "tv",
      name: ep.name ? `${showName} ${epLabel}: ${ep.name}` : `${showName} ${epLabel}`,
      poster: r.poster ?? ep.image ?? null,
      background: null,
      releaseDate: ep.airDate,
      releaseTime: ep.releaseTime,
      releaseAtMs: ep.releaseAtMs,
      isAnime: r.isAnime,
      overview: ep.overview,
      voteAverage: ep.voteAverage,
    });
  }
  return out;
}

const PROGRESS_MS = 250;

/** Reports how many saved titles have been looked up so far, out of `total`. */
export type CountReporter = (done: number, total: number) => void;

/** Calls `onProgress(collect())` at most every 250 ms; `cancel` drops a pending call once the final result is ready. */
export function progressReporter(
  collect: () => CalendarItem[],
  onProgress: ((items: CalendarItem[]) => void) | undefined,
): { report: () => void; cancel: () => void } {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    timer = null;
    last = Date.now();
    onProgress?.(collect());
  };
  return {
    report: () => {
      if (!onProgress || timer) return;
      const wait = PROGRESS_MS - (Date.now() - last);
      if (wait <= 0) fire();
      else timer = setTimeout(fire, wait);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export async function resolveSavedCalendar(
  candidates: SavedCandidate[],
  year: number,
  month: number,
  opts: { tmdbKey: string; onProgress?: (items: CalendarItem[]) => void; onCount?: CountReporter },
): Promise<CalendarItem[]> {
  const inMonth = inMonthFactory(year, month);
  const series = candidates
    .filter((c) => c.type === "series")
    .sort(curatedFirst)
    .slice(0, SERIES_LIMIT);
  const movies = candidates
    .filter((c) => c.type === "movie")
    .sort(curatedFirst)
    .slice(0, MOVIE_LIMIT);

  const seriesOut: CalendarItem[][] = series.map(() => []);
  const movieOut: Array<CalendarItem | null> = movies.map(() => null);
  const collect = () =>
    dedupeCalendar([...seriesOut.flat(), ...movieOut.filter((m): m is CalendarItem => !!m)]);
  const { report, cancel } = progressReporter(collect, opts.onProgress);
  const total = series.length + movies.length;
  let done = 0;
  const step = () => opts.onCount?.(++done, total);
  opts.onCount?.(0, total);

  const seriesConc = opts.tmdbKey ? TMDB_CONCURRENCY : TVMAZE_CONCURRENCY;
  await Promise.all([
    mapLimit(
      series.map((c, i) => [c, i] as const),
      seriesConc,
      async ([c, i]) => {
        const r = await resolveSeriesCached(c, opts.tmdbKey);
        step();
        if (r) {
          seriesOut[i] = seriesItems(c, r, inMonth);
          if (seriesOut[i].length > 0) report();
        }
      },
    ),
    mapLimit(
      movies.map((c, i) => [c, i] as const),
      TMDB_CONCURRENCY,
      async ([c, i]) => {
        const mi = await resolveMovieCached(c, opts.tmdbKey);
        step();
        if (mi && inMonth(mi.releaseDate)) {
          movieOut[i] = mi;
          report();
        }
      },
    ),
  ]);
  cancel();
  return collect();
}

function dedupeCalendar(out: CalendarItem[]): CalendarItem[] {
  const seen = new Set<string>();
  const deduped: CalendarItem[] = [];
  for (const item of out) {
    const ep = item.name.match(/\sS(\d+)E(\d+)/i);
    const show = ep ? item.name.slice(0, item.name.indexOf(ep[0])) : item.name;
    const norm = show.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const key = ep
      ? `tv|${norm}|s${Number(ep[1])}e${Number(ep[2])}|${item.releaseDate}`
      : `movie|${norm}|${item.releaseDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  deduped.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  return deduped;
}

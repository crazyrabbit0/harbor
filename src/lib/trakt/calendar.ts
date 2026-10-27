import { HISTORY_MARK, WATCHLIST_MARK, withTraktActivityCache } from "./activities";
import { traktRequest } from "./client";

// The personal calendar follows watched and watchlisted shows; airing times change within a day at most.
const CALENDAR_MARK = (a: Parameters<typeof HISTORY_MARK>[0]) => {
  const watched = HISTORY_MARK(a);
  const listed = WATCHLIST_MARK(a);
  return watched && listed ? `${watched}|${listed}` : null;
};
const CALENDAR_MAX_AGE_MS = 6 * 60 * 60 * 1000;
import type { TraktItem } from "./types";

export type CalendarEpisode = TraktItem & {
  type: "show";
  airDate: string;
  season: number;
  number: number;
  episodeTitle?: string;
};

export async function fetchUpcomingEpisodes(days = 14): Promise<CalendarEpisode[]> {
  type Raw = {
    first_aired: string;
    episode: {
      season: number;
      number: number;
      title?: string;
      ids: { imdb?: string; tmdb?: number; tvdb?: number };
    };
    show: {
      title: string;
      year: number | null;
      ids: { imdb?: string; tmdb?: number; tvdb?: number };
    };
  };
  const today = new Date().toISOString().slice(0, 10);
  const path = `/calendars/my/shows/${today}/${days}`;
  const rows = await withTraktActivityCache(path, CALENDAR_MARK, CALENDAR_MAX_AGE_MS, () =>
    traktRequest<Raw[]>(path),
  ).catch(() => [] as Raw[]);
  return rows.map((r) => ({
    type: "show" as const,
    title: r.show.title,
    year: r.show.year,
    ids: r.show.ids,
    airDate: r.first_aired,
    season: r.episode.season,
    number: r.episode.number,
    episodeTitle: r.episode.title,
  }));
}

export async function fetchUpcomingMovies(days = 30): Promise<TraktItem[]> {
  type Raw = {
    released: string;
    movie: { title: string; year: number | null; ids: { imdb?: string; tmdb?: number } };
  };
  const today = new Date().toISOString().slice(0, 10);
  const rows = await traktRequest<Raw[]>(`/calendars/my/movies/${today}/${days}`).catch(
    () => [] as Raw[],
  );
  return rows.map((r) => ({
    type: "movie" as const,
    title: r.movie.title,
    year: r.movie.year,
    ids: r.movie.ids,
    contextDate: r.released,
  }));
}

export type AnticipatedShow = {
  title: string;
  year: number | null;
  ids: { imdb?: string; tmdb?: number; tvdb?: number };
  firstAired: string;
  poster: string | null;
  overview: string;
};

export type AnticipatedMovie = {
  title: string;
  year: number | null;
  ids: { imdb?: string; tmdb?: number };
  released: string;
  poster: string | null;
  overview: string;
};

export async function fetchAnticipatedShows(): Promise<AnticipatedShow[]> {
  type Raw = {
    list_count?: number;
    show: {
      title: string;
      year: number | null;
      first_aired?: string;
      overview?: string;
      ids: { imdb?: string; tmdb?: number; tvdb?: number };
    };
  };
  const rows = await traktRequest<Raw[]>(`/shows/anticipated?extended=full&limit=100`, {
    authed: false,
  }).catch(() => [] as Raw[]);
  return rows
    .filter((r) => r.show.first_aired)
    .map((r) => ({
      title: r.show.title,
      year: r.show.year,
      ids: r.show.ids,
      firstAired: (r.show.first_aired ?? "").slice(0, 10),
      poster: null,
      overview: r.show.overview ?? "",
    }));
}

export async function fetchAnticipatedMovies(): Promise<AnticipatedMovie[]> {
  type Raw = {
    list_count?: number;
    movie: {
      title: string;
      year: number | null;
      released?: string;
      overview?: string;
      ids: { imdb?: string; tmdb?: number };
    };
  };
  const rows = await traktRequest<Raw[]>(`/movies/anticipated?extended=full&limit=100`, {
    authed: false,
  }).catch(() => [] as Raw[]);
  return rows
    .filter((r) => r.movie.released)
    .map((r) => ({
      title: r.movie.title,
      year: r.movie.year,
      ids: r.movie.ids,
      released: (r.movie.released ?? "").slice(0, 10),
      poster: null,
      overview: r.movie.overview ?? "",
    }));
}

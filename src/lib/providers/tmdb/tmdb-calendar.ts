import { get } from "./tmdb-client";
import { cachedTmdbFind, rememberTmdbFind } from "./tmdb-find-cache";
import { tmdbBackdropUrl, tmdbPosterThumbUrl } from "./tmdb-image-rungs";

const poster = (p: string | null | undefined) => tmdbPosterThumbUrl(p) ?? null;
const still = (p: string | null | undefined) => tmdbBackdropUrl(p) ?? null;
const backdrop = (p: string | null | undefined) => tmdbBackdropUrl(p) ?? null;

const ANIMATION_GENRE_ID = 16;

export type TmdbUpcomingEpisode = {
  season: number;
  number: number;
  name: string;
  airDate: string;
  image: string | null;
  overview: string;
  voteAverage: number;
};

export type TmdbTvUpcoming = {
  name: string;
  poster: string | null;
  isAnime: boolean;
  episodes: TmdbUpcomingEpisode[];
};

export type TmdbMovieRelease = {
  name: string;
  poster: string | null;
  background: string | null;
  releaseDate: string;
  isAnime: boolean;
  overview: string;
  voteAverage: number;
};

export async function tmdbFindByImdb(
  key: string,
  ttId: string,
  type: "movie" | "series",
): Promise<{ tvId: number | null; movieId: number | null }> {
  const findKey = `${ttId}:${type}`;
  const cached = cachedTmdbFind(findKey);
  if (cached) {
    const id = Number(cached.slice(cached.indexOf(":") + 1));
    return cached.startsWith("tv:") ? { tvId: id, movieId: null } : { tvId: null, movieId: id };
  }
  const data = await get<{
    tv_results?: Array<{ id: number }>;
    movie_results?: Array<{ id: number }>;
  }>(key, `find/${ttId}`, { external_source: "imdb_id" });
  const tvId = data?.tv_results?.[0]?.id ?? null;
  const movieId = data?.movie_results?.[0]?.id ?? null;
  const hit =
    type === "series"
      ? tvId != null
        ? `tv:${tvId}`
        : null
      : movieId != null
        ? `movie:${movieId}`
        : null;
  if (hit) rememberTmdbFind(findKey, hit);
  return { tvId, movieId };
}

type TvDetail = {
  name?: string;
  poster_path?: string | null;
  genres?: Array<{ id: number }>;
  next_episode_to_air?: { season_number?: number } | null;
  last_episode_to_air?: { season_number?: number } | null;
  seasons?: Array<{ season_number?: number; air_date?: string | null }>;
};

type SeasonDetail = {
  episodes?: Array<{
    season_number?: number;
    episode_number?: number;
    name?: string;
    air_date?: string | null;
    still_path?: string | null;
    overview?: string;
    vote_average?: number;
  }>;
};

export async function tmdbTvPoster(key: string, tvId: number): Promise<string | null> {
  const tv = await get<TvDetail>(key, `tv/${tvId}`);
  return tv ? poster(tv.poster_path) : null;
}

export async function tmdbTvUpcoming(
  key: string,
  tvId: number,
  inWindow: (date: string) => boolean,
): Promise<TmdbTvUpcoming | null> {
  const tv = await get<TvDetail>(key, `tv/${tvId}`);
  if (!tv) return null;
  const isAnime = (tv.genres ?? []).some((g) => g.id === ANIMATION_GENRE_ID);
  const seasons = new Set<number>();
  if (typeof tv.next_episode_to_air?.season_number === "number") {
    seasons.add(tv.next_episode_to_air.season_number);
  }
  if (typeof tv.last_episode_to_air?.season_number === "number") {
    seasons.add(tv.last_episode_to_air.season_number);
  }
  for (const s of tv.seasons ?? []) {
    if (typeof s.season_number === "number" && s.air_date && inWindow(s.air_date.slice(0, 10))) {
      seasons.add(s.season_number);
    }
  }
  const episodes: TmdbUpcomingEpisode[] = [];
  const order = [...seasons];
  const details = await Promise.all(
    order.map((season) => get<SeasonDetail>(key, `tv/${tvId}/season/${season}`)),
  );
  for (const [i, sd] of details.entries()) {
    const season = order[i];
    for (const ep of sd?.episodes ?? []) {
      const date = (ep.air_date ?? "").slice(0, 10);
      if (!date || !inWindow(date) || typeof ep.episode_number !== "number") continue;
      episodes.push({
        season: ep.season_number ?? season,
        number: ep.episode_number,
        name: ep.name ?? "",
        airDate: date,
        image: still(ep.still_path),
        overview: ep.overview ?? "",
        voteAverage: ep.vote_average ?? 0,
      });
    }
  }
  return { name: tv.name ?? "", poster: poster(tv.poster_path), isAnime, episodes };
}

export async function tmdbMovieRelease(
  key: string,
  movieId: number,
): Promise<TmdbMovieRelease | null> {
  const m = await get<{
    title?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    release_date?: string | null;
    genres?: Array<{ id: number }>;
    overview?: string;
    vote_average?: number;
  }>(key, `movie/${movieId}`);
  if (!m) return null;
  return {
    name: m.title ?? "",
    poster: poster(m.poster_path),
    background: backdrop(m.backdrop_path),
    releaseDate: (m.release_date ?? "").slice(0, 10),
    isAnime: (m.genres ?? []).some((g) => g.id === ANIMATION_GENRE_ID),
    overview: m.overview ?? "",
    voteAverage: m.vote_average ?? 0,
  };
}

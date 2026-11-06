import { airedOnly } from "../../src/lib/aired.ts";
import { loadModule } from "./hook-harness.ts";

type Episode = { season: number; episode: number };

/** Runs the real `lib/mark-watched.ts` over recording stubs for every store and tracker it writes. */
export function markWatchedHarness() {
  const marked: Array<[string, Episode[], boolean]> = [];
  const traktEpisodes: Episode[] = [];
  const watchEvents: Array<Record<string, unknown>> = [];
  const mod = loadModule("src/lib/mark-watched.ts", {
    "@/lib/cinemeta": { meta: async () => null, narrowMediaType: (type: string) => type },
    "@/lib/playback-history": { savePlayback() {} },
    "@/lib/trakt/history": { pushWatched: async () => {} },
    "@/lib/trakt/resolve": { markEpisodeWatched: async () => {} },
    "@/lib/trakt/ids": {
      stremioIdToTraktTarget: (_id: string, episode: Episode) => {
        traktEpisodes.push(episode);
        return { ok: false };
      },
    },
    "@/lib/trakt/session": { getSession: () => null },
    "@/lib/active-profile-id": { activeProfileId: () => "p1" },
    "@/lib/simkl/history": { addToHistory: async () => {} },
    "@/lib/movie-watched": { setMovieWatchedLocal() {} },
    "@/lib/manual-watched": {
      recordManualWatchedMeta() {},
      setManualWatchedMany: (id: string, eps: Episode[], on: boolean) => marked.push([id, eps, on]),
    },
    "@/lib/watched-flag": { setWatchedFlag() {} },
    "@/lib/watch-events": { recordWatchEvent: (e: Record<string, unknown>) => watchEvents.push(e) },
    "@/lib/auth": { readActiveStremioAuthKey: () => null },
    "@/lib/stremio": { cloudWriteId: () => null },
    "@/lib/stremio-watched-sync": { markMovieWatchedStremio: async () => {} },
    "@/lib/stremio-episode-watched": { syncSeriesWatchedToStremio: async () => {} },
    "@/lib/providers/tmdb/tmdb-imdb-resolve": { tmdbImdbCached: () => null },
    "@/lib/aired": { airedOnly },
    "@/lib/anime-detect": { isDetectedAnime: () => false },
  });
  return { mod, marked, traktEpisodes, watchEvents };
}

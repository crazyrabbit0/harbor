import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { animeIdentityEligible, resolveAnimeIdentity } from "@/lib/streams/anime-identity";

/** A displayed anime row resolved to its tracker entry and the episode number inside that entry. */
export type AnimeEntryTarget = { kitsuId: number; number: number };

const KITSU_STREAM = /^kitsu:(\d+):(\d+)$/;

/** Display-season rows carry the TVDB/IMDb pair; tracker entries count episodes within themselves. */
export async function animeEntryTarget(
  metaId: string,
  ep: Pick<KitsuEpisode, "number" | "seasonNumber" | "imdbSeason" | "imdbEpisode"> &
    Partial<Pick<KitsuEpisode, "streamId" | "imdbId" | "sourceMetaId">>,
  trackId?: string,
): Promise<AnimeEntryTarget | null> {
  const stream = KITSU_STREAM.exec(ep.streamId ?? "");
  if (stream) return { kitsuId: Number(stream[1]), number: Number(stream[2]) };
  const owner = ep.sourceMetaId ?? metaId;
  const native = /^kitsu:(\d+)$/.exec(
    ep.sourceMetaId ?? (trackId?.startsWith("kitsu:") ? trackId : metaId),
  );
  const playEp = {
    season: ep.seasonNumber ?? 1,
    episode: ep.number,
    imdbSeason: ep.imdbSeason,
    imdbEpisode: ep.imdbEpisode,
  };
  const fallback = native ? { kitsuId: Number(native[1]), number: ep.number } : null;
  if (!animeIdentityEligible(owner, playEp)) return fallback;
  const identity = await resolveAnimeIdentity(owner, ep.imdbId ?? null, {
    season: playEp.season,
    episode: playEp.episode,
    imdbSeason: ep.imdbSeason,
    imdbEpisode: ep.imdbEpisode,
  }).catch(() => null);
  if (identity) return { kitsuId: identity.kitsuId, number: identity.number };
  return fallback;
}

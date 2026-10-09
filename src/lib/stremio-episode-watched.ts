import { meta as fetchCinemetaMeta, narrowMediaType, type Meta } from "@/lib/cinemeta";
import { readActiveStremioAuthKey } from "@/lib/auth";
import { cloudWriteId } from "@/lib/stremio";
import { setEpisodesWatchedStremio } from "@/lib/stremio-watched-sync";
import { manualEpisodeKeys } from "@/lib/manual-watched";

const ANIME_ID = /^(kitsu|mal|anilist|anidb):/;

/** Anime callers pass Cinemeta (IMDb pair) keys, since their manual keys use entry numbering. */
export type StremioEpisodeKeys = { watched: Set<string>; unwatched: Set<string> };

export async function syncSeriesWatchedToStremio(
  meta: Meta,
  imdbId?: string | null,
  animeKeys?: StremioEpisodeKeys,
): Promise<void> {
  const id = meta.id;
  if (ANIME_ID.test(id) || (meta.type === "anime" && !animeKeys)) return;
  const authKey = readActiveStremioAuthKey();
  if (!authKey) return;
  const imdb = imdbId?.startsWith("tt") ? imdbId : id.startsWith("tt") ? id : null;
  const cid = cloudWriteId(id, imdb, !!imdb);
  if (!cid) return;

  let videos = meta.videos;
  const aligned = imdb ? (videos?.[0]?.id?.startsWith(imdb) ?? false) : (videos?.length ?? 0) > 0;
  if (!videos?.length || (imdb && !aligned)) {
    const full = await fetchCinemetaMeta(narrowMediaType(meta.type), imdb ?? id, true).catch(
      () => null,
    );
    if (full?.videos?.length) videos = full.videos;
  }
  if (!videos || videos.length === 0) return;

  const { watched, unwatched } = animeKeys ?? manualEpisodeKeys(id);
  if (watched.size === 0 && unwatched.size === 0) return;
  await setEpisodesWatchedStremio(authKey, meta, cid, videos, watched, unwatched, !!animeKeys);
}

import { kitsuToAnidb, kitsuToAnilist, kitsuToMal } from "@/lib/providers/anime-mapping";
import { syncAnimeProgress } from "@/lib/anilist/sync";
import { syncMalProgress } from "@/lib/mal/sync";
import { getSession as getSimklSession } from "@/lib/simkl/session";
import {
  markAnimeEpisodesWatched,
  markTvdbAnimeEpisodesWatched,
  unmarkAnimeEpisodesWatched,
} from "@/lib/simkl/history";
import type { SimklIds } from "@/lib/simkl/types";
import { animeEntryTarget, type AnimeEntryTarget } from "./anime-entry-target";

type Row = Parameters<typeof animeEntryTarget>[1];

export type AnimeMarkOptions = {
  title: string;
  trackId?: string;
  anilist: boolean;
  mal: boolean;
  simkl: boolean;
};

async function simklAnimeIds(kitsuId: number): Promise<SimklIds | null> {
  const [mal, anilist, anidb] = await Promise.all([
    kitsuToMal(kitsuId).catch(() => null),
    kitsuToAnilist(kitsuId).catch(() => null),
    kitsuToAnidb(kitsuId).catch(() => null),
  ]);
  const ids: SimklIds = { kitsu: kitsuId };
  if (mal != null) ids.mal = mal;
  if (anilist != null) ids.anilist = anilist;
  if (anidb != null) ids.anidb = anidb;
  return mal != null || anilist != null || anidb != null ? ids : null;
}

function groupByEntry(targets: Array<AnimeEntryTarget | null>): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const t of targets) {
    if (!t || !Number.isInteger(t.number) || t.number < 1) continue;
    const list = out.get(t.kitsuId) ?? [];
    if (!list.includes(t.number)) list.push(t.number);
    out.set(t.kitsuId, list);
  }
  return out;
}

function tvdbFallback(metaId: string, rows: Row[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  if (!/^tt\d+$/.test(metaId)) return out;
  for (const r of rows) {
    if (r.imdbSeason == null || r.imdbSeason < 1 || r.imdbEpisode == null) continue;
    const list = out.get(r.imdbSeason) ?? [];
    list.push(r.imdbEpisode);
    out.set(r.imdbSeason, list);
  }
  return out;
}

/** Pushes manual anime marks to every connected tracker in each entry's own numbering. */
export async function pushAnimeMarks(
  metaId: string,
  rows: Row[],
  watched: boolean,
  opts: AnimeMarkOptions,
): Promise<void> {
  if (rows.length === 0) return;
  const simkl = opts.simkl && getSimklSession() != null;
  if (!simkl && (!watched || (!opts.anilist && !opts.mal))) return;
  const targets = await Promise.all(rows.map((r) => animeEntryTarget(metaId, r, opts.trackId)));
  const byEntry = groupByEntry(targets);
  const unresolved = rows.filter((_, i) => targets[i] == null);
  for (const [kitsuId, numbers] of byEntry) {
    const highest = Math.max(...numbers);
    const harborId = `kitsu:${kitsuId}`;
    if (watched && opts.anilist) void syncAnimeProgress(harborId, highest, opts.title);
    if (watched && opts.mal) void syncMalProgress(harborId, highest, opts.title);
    if (!simkl) continue;
    const ids = await simklAnimeIds(kitsuId);
    if (!ids) continue;
    if (watched) void markAnimeEpisodesWatched(ids, numbers);
    else void unmarkAnimeEpisodesWatched(ids, numbers);
  }
  if (!simkl || !watched) return;
  for (const [season, eps] of tvdbFallback(metaId, unresolved)) {
    void markTvdbAnimeEpisodesWatched({ imdb: metaId }, season, eps);
  }
}

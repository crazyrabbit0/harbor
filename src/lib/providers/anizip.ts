import { idbCacheGetFresh, idbCacheSet } from "@/lib/idb-cache";
import { safeFetch } from "@/lib/safe-fetch";

const ENDPOINT = "https://api.ani.zip/mappings";
const GAP_MS = 90;
const NEG_TTL_MS = 120000;
const cache = new Map<string, AniZipMapping | null>();
const negCache = new Map<string, number>();
const inflight = new Map<string, Promise<AniZipMapping | null>>();

let queue: Promise<unknown> = Promise.resolve();
function throttled(url: string, ac: AbortController): Promise<Response> {
  const run = queue.then(async () => {
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      return await safeFetch(url, { signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
  });
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  queue = Promise.race([settled, new Promise((r) => setTimeout(r, 5000))]).then(
    () => new Promise((r) => setTimeout(r, GAP_MS)),
  );
  return run;
}

export type AniZipEpisode = {
  seasonNumber?: number;
  episodeNumber: number;
  absoluteEpisodeNumber?: number;
  tvdbShowId?: number;
  tvdbId?: number;
  anidbEid?: number;
  airDate?: string;
  airDateUtc?: string;
  runtime?: number;
  overview?: string;
  image?: string;
  rating?: string;
  finaleType?: string;
  filler?: boolean;
  titles?: Record<string, string>;
};

export type AniZipMapping = {
  titles?: Record<string, string>;
  episodes?: Record<string, AniZipEpisode>;
  mappings?: {
    anilist_id?: number;
    kitsu_id?: number;
    mal_id?: number;
    anidb_id?: number;
    thetvdb_id?: number;
    themoviedb_id?: number | string;
    imdb_id?: string;
  };
};

export async function aniZipByKitsu(kitsuId: number): Promise<AniZipMapping | null> {
  return get(`kitsu_id=${kitsuId}`);
}

export async function aniZipByAnilist(anilistId: number): Promise<AniZipMapping | null> {
  return get(`anilist_id=${anilistId}`);
}

export async function aniZipByMal(malId: number): Promise<AniZipMapping | null> {
  return get(`mal_id=${malId}`);
}

export async function aniZipByAnidb(anidbId: number): Promise<AniZipMapping | null> {
  return get(`anidb_id=${anidbId}`);
}

export async function aniZipByImdb(imdbId: string): Promise<AniZipMapping | null> {
  return get(`imdb_id=${imdbId}`);
}

export async function aniZipByTmdbTv(tmdbId: number): Promise<AniZipMapping | null> {
  return get(`themoviedb_id=${tmdbId}`);
}

const TIMEOUT_MS = 4000;

// Mappings and episode lists persist across restarts; a 404 is remembered too, for a shorter time.
const DISK_PREFIX = "anizip.v1:";
const DISK_TTL_MS = 12 * 60 * 60 * 1000;
const DISK_MISS_TTL_MS = 3 * 60 * 60 * 1000;
const DISK_MAX_CHARS = 1_000_000;

async function readDisk(query: string): Promise<{ hit: boolean; value: AniZipMapping | null }> {
  try {
    const entry = await idbCacheGetFresh(DISK_PREFIX + query, DISK_TTL_MS);
    if (!entry) return { hit: false, value: null };
    const value = (entry.data ?? null) as AniZipMapping | null;
    if (value === null && Date.now() - entry.at > DISK_MISS_TTL_MS) return { hit: false, value };
    return { hit: true, value };
  } catch {
    return { hit: false, value: null };
  }
}

function writeDisk(query: string, value: AniZipMapping | null, text: string): void {
  if (text.length > DISK_MAX_CHARS) return;
  void idbCacheSet(DISK_PREFIX + query, { at: Date.now(), data: value }).catch(() => {});
}

async function get(query: string): Promise<AniZipMapping | null> {
  if (cache.has(query)) return cache.get(query) ?? null;
  const negAt = negCache.get(query);
  if (negAt != null && Date.now() - negAt < NEG_TTL_MS) return null;
  const existing = inflight.get(query);
  if (existing) return existing;
  const p = (async () => {
    const ac = new AbortController();
    try {
      const stored = await readDisk(query);
      if (stored.hit) {
        cache.set(query, stored.value);
        return stored.value;
      }
      const res = await throttled(`${ENDPOINT}?${query}`, ac);
      if (!res.ok) {
        if (res.status === 404) {
          cache.set(query, null);
          writeDisk(query, null, "");
        } else negCache.set(query, Date.now());
        return null;
      }
      const text = await res.text();
      const json = JSON.parse(text) as AniZipMapping;
      cache.set(query, json);
      negCache.delete(query);
      writeDisk(query, json, text);
      return json;
    } catch {
      negCache.set(query, Date.now());
      return null;
    } finally {
      inflight.delete(query);
    }
  })();
  inflight.set(query, p);
  return p;
}

export function pickEpisodeTitle(ep: AniZipEpisode | undefined): string | null {
  if (!ep?.titles) return null;
  return ep.titles.en ?? ep.titles["x-jat"] ?? ep.titles.ja ?? null;
}

export function pickLocalizedTitle(
  ep: AniZipEpisode | undefined,
  lang: string | null | undefined,
): string | null {
  if (!ep?.titles) return null;
  if (lang) {
    const exact = lang.trim();
    if (ep.titles[exact]) return ep.titles[exact];
    const base = exact.split("-")[0]?.toLowerCase() ?? "";
    if (base && ep.titles[base]) return ep.titles[base];
  }
  return ep.titles.en ?? ep.titles["x-jat"] ?? ep.titles.ja ?? null;
}

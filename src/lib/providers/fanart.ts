import { safeFetch } from "@/lib/safe-fetch";
const FANART = "https://webservice.fanart.tv/v3";

type ArtItem = { id?: string; url?: string; lang?: string; likes?: string };

type FanartMovie = {
  hdmovielogo?: ArtItem[];
  movielogo?: ArtItem[];
  movieposter?: ArtItem[];
  moviebackground?: ArtItem[];
  moviethumb?: ArtItem[];
  movieart?: ArtItem[];
  moviedisc?: ArtItem[];
  moviebanner?: ArtItem[];
};

type FanartTv = {
  hdtvlogo?: ArtItem[];
  clearlogo?: ArtItem[];
  tvthumb?: ArtItem[];
  showbackground?: ArtItem[];
  hdclearart?: ArtItem[];
  clearart?: ArtItem[];
  tvbanner?: ArtItem[];
  tvposter?: ArtItem[];
  characterart?: ArtItem[];
  seasonposter?: ArtItem[];
  seasonbanner?: ArtItem[];
  seasonthumb?: ArtItem[];
};

const cache = new Map<string, { v: unknown; t: number }>();
const TTL = 6 * 60 * 60 * 1000;

async function get<T>(key: string, path: string): Promise<T | null> {
  if (!key) return null;
  const url = `${FANART}${path}?api_key=${encodeURIComponent(key)}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL) return hit.v as T;
  try {
    const r = await safeFetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as T;
    cache.set(url, { v: j, t: Date.now() });
    return j;
  } catch {
    return null;
  }
}

function rankItems(items: ArtItem[] | undefined): ArtItem[] {
  if (!items?.length) return [];
  return [...items].sort((a, b) => {
    const al = a.lang === "en" ? 1 : a.lang === "00" ? 0.5 : 0;
    const bl = b.lang === "en" ? 1 : b.lang === "00" ? 0.5 : 0;
    if (al !== bl) return bl - al;
    return Number(b.likes ?? 0) - Number(a.likes ?? 0);
  });
}

function pickEnglish(items: ArtItem[] | undefined): string | undefined {
  return rankItems(items)[0]?.url;
}

function pickAll(items: ArtItem[] | undefined): string[] {
  return rankItems(items)
    .map((i) => i.url)
    .filter((u): u is string => Boolean(u));
}

export type FanartArt = {
  logo?: string;
  backdrop?: string;
  backdrops: string[];
  poster?: string;
  banner?: string;
  thumb?: string;
};

export async function fanartMovie(key: string, tmdbId: number): Promise<FanartArt | null> {
  const j = await get<FanartMovie>(key, `/movies/${tmdbId}`);
  if (!j) return null;
  const backdrops = pickAll(j.moviebackground);
  return {
    logo: pickEnglish(j.hdmovielogo) ?? pickEnglish(j.movielogo),
    backdrop: backdrops[0],
    backdrops,
    poster: pickEnglish(j.movieposter),
    banner: pickEnglish(j.moviebanner),
    thumb: pickEnglish(j.moviethumb),
  };
}

export async function fanartTv(key: string, tvdbId: number): Promise<FanartArt | null> {
  const j = await get<FanartTv>(key, `/tv/${tvdbId}`);
  if (!j) return null;
  const backdrops = pickAll(j.showbackground);
  return {
    logo: pickEnglish(j.hdtvlogo) ?? pickEnglish(j.clearlogo),
    backdrop: backdrops[0],
    backdrops,
    poster: pickEnglish(j.tvposter),
    banner: pickEnglish(j.tvbanner),
    thumb: pickEnglish(j.tvthumb),
  };
}

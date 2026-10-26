import { meta as fetchCinemetaMeta } from "@/lib/cinemeta";
import type { LibraryItem } from "@/lib/stremio";
import { decodeWatchedEpisodes } from "@/lib/stremio-watched";
import {
  applyRemoteWatched,
  manualWatchedState,
  remoteWatchedKeys,
  unwatchedAt,
  watchedStoreTag,
} from "@/lib/manual-watched";
import { isMovieWatchedLocal, setMovieWatchedLocal } from "@/lib/movie-watched";

const reconciled = new Set<string>();
const lastPullMtime = new Map<string, number>();
const ANIME_ID = /^(kitsu|mal|anilist|anidb):/;
const PULLED_KEY = "harbor.stremio.watched-pulled.v1";
const PULLED_MAX = 3000;
let pulled: Map<string, string> | null = null;

// Series whose remote ticks were applied at a given _mtime; an unchanged item needs no Cinemeta fetch after a restart.
function pulledMap(): Map<string, string> {
  if (pulled) return pulled;
  pulled = new Map();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PULLED_KEY) ?? "{}");
    if (raw && typeof raw === "object") {
      for (const [id, mt] of Object.entries(raw)) if (typeof mt === "string") pulled.set(id, mt);
    }
  } catch {}
  return pulled;
}

let pulledFlush: ReturnType<typeof setTimeout> | null = null;

function markPulled(id: string, mtime: string): void {
  const map = pulledMap();
  map.delete(id);
  map.set(id, mtime);
  for (const oldest of map.keys()) {
    if (map.size <= PULLED_MAX) break;
    map.delete(oldest);
  }
  if (pulledFlush) return;
  pulledFlush = setTimeout(() => {
    pulledFlush = null;
    try {
      localStorage.setItem(PULLED_KEY, JSON.stringify(Object.fromEntries(map)));
    } catch {}
  }, 2000);
}

function isSeries(i: LibraryItem): boolean {
  return i.type === "series" || i.type === "tv" || i.type === "channel";
}

export function reconcileRemoteWatched(items: LibraryItem[]): void {
  for (const i of items) {
    if (i.removed && !i.temp) continue;
    // Anime-native ids have no Cinemeta numbering; tt anime decodes like any show and rows read the IMDb pair.
    if (ANIME_ID.test(i._id)) continue;
    const key = `${i._id}|${String(i._mtime ?? "")}`;
    if (reconciled.has(key)) continue;
    reconciled.add(key);
    if (!isSeries(i)) {
      const remoteWatched = (i.state?.flaggedWatched ?? 0) > 0 || (i.state?.timesWatched ?? 0) > 0;
      if (remoteWatched && !isMovieWatchedLocal(i._id)) {
        setMovieWatchedLocal(i._id, true);
      }
      continue;
    }
    const watched = i.state?.watched;
    if (typeof watched === "string" && watched.length > 0) {
      const mtimeKey = String(i._mtime ?? "");
      const profileTag = `${mtimeKey}|${watchedStoreTag()}`;
      if (mtimeKey && pulledMap().get(i._id) === profileTag && remoteWatchedKeys(i._id).size > 0) {
        continue;
      }
      const rawMt = i._mtime as unknown;
      const mtime = typeof rawMt === "number" ? rawMt : Date.parse(String(rawMt ?? ""));
      const id = i._id;
      enqueue(async () => {
        const applied = await applySeries(id, watched, Number.isFinite(mtime) ? mtime : 0);
        if (applied && mtimeKey) markPulled(id, profileTag);
      });
    }
  }
}

// A library sync reconciles every series; a few at a time keeps their fetches and decodes from landing in one long task.
const MAX_RUNNING = 3;
const queue: Array<() => Promise<void>> = [];
let running = 0;

function enqueue(job: () => Promise<void>): void {
  queue.push(job);
  pump();
}

function pump(): void {
  while (running < MAX_RUNNING && queue.length > 0) {
    const job = queue.shift()!;
    running += 1;
    setTimeout(() => {
      void job().finally(() => {
        running -= 1;
        pump();
      });
    }, 0);
  }
}

// Returns true once the ticks were decoded against a Cinemeta episode list (or there were none to apply).
async function applySeries(id: string, watched: string, remoteMtime: number): Promise<boolean> {
  if (!id.startsWith("tt")) return true;
  // Stremio indexes the watched bitfield against Cinemeta's list, whatever metadata the user prefers.
  const full = await fetchCinemetaMeta("series", id, true).catch(() => null);
  const videos = full?.videos;
  if (!videos?.length) return false;
  const keys = await decodeWatchedEpisodes(watched, videos).catch(() => null);
  if (!keys) return false;
  if (keys.size === 0) return true;
  const add: Array<{ season: number; episode: number }> = [];
  for (const k of keys) {
    const parts = k.split(":");
    const season = Number(parts[0]);
    const episode = Number(parts[1]);
    if (!Number.isInteger(season) || !Number.isInteger(episode)) continue;
    const st = manualWatchedState(id, season, episode);
    if (st === undefined) add.push({ season, episode });
    else if (st === false && remoteMtime > (unwatchedAt(id, season, episode) ?? 0)) {
      add.push({ season, episode });
    }
  }
  const unset: Array<{ season: number; episode: number }> = [];
  const canUnset = remoteMtime > (lastPullMtime.get(id) ?? 0);
  if (canUnset) {
    for (const rk of remoteWatchedKeys(id)) {
      if (keys.has(rk)) continue;
      const parts = rk.split(":");
      const season = Number(parts[0]);
      const episode = Number(parts[1]);
      if (!Number.isInteger(season) || !Number.isInteger(episode)) continue;
      if (manualWatchedState(id, season, episode) === true) unset.push({ season, episode });
    }
  }
  applyRemoteWatched(id, add, unset);
  if (canUnset) lastPullMtime.set(id, remoteMtime);
  return true;
}

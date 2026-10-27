import { activeProfileId } from "@/lib/active-profile-id";
import { idbCacheGetFresh, idbCacheSet } from "@/lib/idb-cache";
import { onTraktWrite, traktRequest } from "./client";
import { getSession, subscribeSession } from "./session";

// Trakt asks clients to compare /sync/last_activities before re-reading synced data; each read names its own watermark.
export const TRAKT_DISK_PREFIX = "trakt.sync.v1:";

type Activities = {
  all?: string;
  movies?: { watched_at?: string; paused_at?: string; watchlisted_at?: string; hidden_at?: string };
  episodes?: { watched_at?: string; paused_at?: string; watchlisted_at?: string };
  shows?: { watchlisted_at?: string; hidden_at?: string; dropped_at?: string };
  seasons?: { watchlisted_at?: string; hidden_at?: string };
  watchlist?: { updated_at?: string };
};

export type TraktWatermark = (a: Activities) => string | null;

const join = (...parts: Array<string | undefined>): string | null =>
  parts.every((p) => typeof p === "string") ? parts.join("|") : null;

export const WATCHLIST_MARK: TraktWatermark = (a) =>
  join(
    a.watchlist?.updated_at ?? a.all,
    a.movies?.watchlisted_at,
    a.shows?.watchlisted_at,
    a.episodes?.watchlisted_at,
  );
export const HISTORY_MARK: TraktWatermark = (a) =>
  join(a.movies?.watched_at, a.episodes?.watched_at);

const GATE_TTL_MS = 20_000;
let cached: { at: number; value: Activities | null } | null = null;
let inflight: Promise<Activities | null> | null = null;
let generation = 0;

function resetTraktActivities(): void {
  generation += 1;
  cached = null;
  inflight = null;
}

subscribeSession(resetTraktActivities);
onTraktWrite(resetTraktActivities);

export function currentTraktActivities(): Promise<Activities | null> {
  if (cached && Date.now() - cached.at < GATE_TTL_MS) return Promise.resolve(cached.value);
  if (inflight) return inflight;
  const started = generation;
  const p = traktRequest<Activities>("/sync/last_activities")
    .then((value) => (value && typeof value === "object" ? value : null))
    .catch(() => null)
    .then((value) => {
      if (started === generation) cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      if (started === generation) inflight = null;
    });
  inflight = p;
  return p;
}

function diskKey(name: string): string | null {
  const user = getSession()?.username;
  return user ? `${TRAKT_DISK_PREFIX}${activeProfileId()}|${user}|${name}` : null;
}

// Serves load() from disk while the watermark (or, with none, the age limit) holds; an unreadable watermark loads fresh.
export async function withTraktActivityCache<T>(
  name: string,
  watermark: TraktWatermark | null,
  maxAgeMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const key = diskKey(name);
  const activities = watermark ? await currentTraktActivities() : null;
  const mark = watermark ? (activities ? watermark(activities) : null) : "ttl";
  if (key && mark !== null) {
    const entry = await idbCacheGetFresh(key, maxAgeMs).catch(() => null);
    const stored = entry?.data as { mark: string; value: T } | undefined;
    if (stored && stored.mark === mark) return stored.value;
  }
  const value = await load();
  if (key && mark !== null)
    void idbCacheSet(key, { at: Date.now(), data: { mark, value } }).catch(() => {});
  return value;
}

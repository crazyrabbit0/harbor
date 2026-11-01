import { stremioDataProfileId, primaryOrStremioProfileId } from "@/lib/profile-roster";
import { durableSetItem, syncDurableStore } from "@/lib/durable-store";
const KEY_PREFIX = "harbor.watchevents.v1.";
const LEGACY_KEY = "harbor.watchevents.v1";
const MAX = 40;
const subs = new Set<() => void>();

export type WatchEvent = {
  id: string;
  type: "movie" | "series";
  name: string;
  poster?: string;
  season?: number;
  episode?: number;
  at: number;
};

function activeProfileId(): string {
  return stremioDataProfileId();
}

function primaryProfileId(): string {
  return primaryOrStremioProfileId();
}

function storeKey(): string {
  const id = activeProfileId();
  return id ? KEY_PREFIX + id : LEGACY_KEY;
}

function migrateLegacy(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;
    const pid = primaryProfileId();
    if (!pid) return;
    const perKey = KEY_PREFIX + pid;
    if (!localStorage.getItem(perKey)) durableSetItem(perKey, legacy);
    localStorage.removeItem(LEGACY_KEY);
    syncDurableStore();
  } catch {
    /* noop */
  }
}

function load(): WatchEvent[] {
  migrateLegacy();
  try {
    const raw = localStorage.getItem(storeKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WatchEvent[]) : [];
  } catch {
    return [];
  }
}

export function listWatchEvents(): WatchEvent[] {
  return load();
}

export function recordWatchEvent(e: WatchEvent): void {
  if (!e.id || !e.name) return;
  const key = `${e.id}|${e.season ?? ""}|${e.episode ?? ""}`;
  const next = [e, ...load().filter((p) => `${p.id}|${p.season ?? ""}|${p.episode ?? ""}` !== key)];
  try {
    durableSetItem(storeKey(), JSON.stringify(next.slice(0, MAX)));
  } catch {
    return;
  }
  subs.forEach((fn) => fn());
}

export function subscribeWatchEvents(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

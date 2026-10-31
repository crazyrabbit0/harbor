import { stremioDataProfileId, primaryOrStremioProfileId } from "@/lib/profile-roster";
import { persistCritical } from "./storage-recovery";

const KEY_PREFIX = "harbor.moviewatched.v1.";
const LEGACY_KEY = "harbor.moviewatched.v1";

const subs = new Set<() => void>();
let version = 0;
let cache: Set<string> | null = null;

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
    if (!localStorage.getItem(perKey)) localStorage.setItem(perKey, legacy);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* noop */
  }
}

function load(): Set<string> {
  if (cache) return cache;
  migrateLegacy();
  try {
    const arr = JSON.parse(localStorage.getItem(storeKey()) ?? "[]");
    cache = new Set(
      Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [],
    );
  } catch {
    cache = new Set();
  }
  return cache;
}

function persist(next: Set<string>): void {
  cache = next;
  version += 1;
  persistCritical(storeKey(), JSON.stringify([...next]));
  for (const fn of subs) fn();
}

export function isMovieWatchedLocal(metaId: string): boolean {
  return load().has(metaId);
}

export function movieWatchedIds(): Set<string> {
  return load();
}

export function setMovieWatchedLocal(metaId: string, watched: boolean): void {
  const cur = load();
  if (cur.has(metaId) === watched) return;
  const next = new Set(cur);
  if (watched) next.add(metaId);
  else next.delete(metaId);
  persist(next);
}

export function subscribeMovieWatched(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function movieWatchedVersion(): number {
  return version;
}

if (typeof window !== "undefined") {
  let lastProfile = activeProfileId();
  const onProfileChange = () => {
    const p = activeProfileId();
    if (p === lastProfile) return;
    lastProfile = p;
    cache = null;
    version += 1;
    for (const fn of subs) fn();
  };
  window.addEventListener("harbor:active-profile-changed", onProfileChange);
  window.addEventListener("harbor:profiles-updated", onProfileChange);
}

import { useSyncExternalStore } from "react";
import { setItemWithRecovery } from "@/lib/storage-recovery";
import {
  IPTV_CREDENTIALS_KEY,
  getSecret,
  getSecretsWriteStatus,
  secretsDurable,
  secretsSettled,
  setSecret,
  subscribeSecretsDurable,
  subscribeSecretsSettled,
  subscribeSecretsWriteStatus,
} from "@/lib/secret-store";
import {
  hasPlaintextCredentials,
  joinCredentials,
  parseCredentials,
  serializeCredentials,
  splitCredentials,
} from "./playlist-credentials";

export type StoredPlaylist = {
  id: string;
  name: string;
  url: string;
  epgUrl?: string;
  kind?: "m3u" | "xtream" | "epg";
  xtream?: { server: string; username: string; password: string };
};

const STORAGE_KEY = "harbor.iptv.playlists.v1";

let migrated = false;
let hydrated = false;
let cache: StoredPlaylist[] = [];
let cacheSignature = "";
let subscribed = false;
const subs = new Set<() => void>();

function notify(): void {
  for (const fn of subs) fn();
}

function ensureMigrated(): void {
  if (!migrated) migrateLegacyPlaylists();
}

// Runs once at startup (main.tsx): merges playlists left in any settings blob into the store, then strips them.
export function migrateLegacyPlaylists(): void {
  if (migrated) return;
  migrated = true;
  let stored: StoredPlaylist[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw == null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    stored = parsed as StoredPlaylist[];
  } catch {
    return;
  }
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const key of ["harbor.settings.shared", "harbor.settings"]) {
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(key);
    }
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("harbor.settings.") && !seen.has(key)) {
        seen.add(key);
        candidates.push(key);
      }
    }
  } catch {
    /* localStorage enumeration is best-effort */
  }
  const merged = new Map<string, StoredPlaylist>();
  for (const entry of stored)
    if (entry && typeof entry.id === "string") merged.set(entry.id, entry);
  const storedCount = merged.size;
  const dirty: Array<{ key: string; obj: Record<string, unknown> }> = [];
  for (const key of candidates) {
    let blob: unknown;
    try {
      blob = JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      continue;
    }
    if (!blob || typeof blob !== "object") continue;
    const obj = blob as Record<string, unknown>;
    // The settings default writes back an empty list, which holds nothing to move.
    if (!Array.isArray(obj.iptvPlaylists) || obj.iptvPlaylists.length === 0) continue;
    for (const entry of obj.iptvPlaylists as StoredPlaylist[]) {
      if (entry && typeof entry.id === "string" && !merged.has(entry.id)) {
        merged.set(entry.id, entry);
      }
    }
    dirty.push({ key, obj });
  }
  if (dirty.length === 0) return;
  if (merged.size > storedCount) {
    const lists = [...merged.values()];
    try {
      if (!setItemWithRecovery(STORAGE_KEY, JSON.stringify(lists))) return;
    } catch {
      return;
    }
  }
  // Strip the legacy field only once the store holds every entry, so a failed write never loses the only copy.
  for (const { key, obj } of dirty) {
    try {
      delete obj.iptvPlaylists;
      localStorage.setItem(key, JSON.stringify(obj));
    } catch {
      /* best-effort */
    }
  }
}

export function readPlaylists(): StoredPlaylist[] {
  hydrated = true;
  ensureMigrated();
  ensureSubscribed();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const credRaw = getSecret(IPTV_CREDENTIALS_KEY);
    const signature = `${credRaw ?? ""}\n${raw}`;
    if (signature !== cacheSignature) {
      cache = joinCredentials(parsed as StoredPlaylist[], parseCredentials(credRaw));
      cacheSignature = signature;
    }
    if (canHoldCredentials() && hasPlaintextCredentials(parsed as StoredPlaylist[])) {
      persistLists(cache);
    }
    return cache;
  } catch {
    return [];
  }
}

// Logins go to the secret store only once it is settled and writing; until then the list keeps them so no write loses the only copy.
function canHoldCredentials(): boolean {
  return secretsSettled() && getSecretsWriteStatus().ok;
}

function persistLists(playlists: StoredPlaylist[]): boolean {
  cache = playlists;
  let json = JSON.stringify(playlists);
  if (canHoldCredentials()) {
    const credRaw = getSecret(IPTV_CREDENTIALS_KEY);
    const { stripped, credentials } = splitCredentials(playlists, parseCredentials(credRaw));
    const nextCredRaw = serializeCredentials(credentials);
    if (nextCredRaw !== credRaw) setSecret(IPTV_CREDENTIALS_KEY, nextCredRaw);
    // The list keeps its plaintext until secrets.json holds the logins; the durable notification re-persists it.
    json = JSON.stringify(secretsDurable() ? stripped : playlists);
    cacheSignature = `${nextCredRaw ?? ""}\n${json}`;
  } else {
    cacheSignature = `${getSecret(IPTV_CREDENTIALS_KEY) ?? ""}\n${json}`;
  }
  try {
    if (localStorage.getItem(STORAGE_KEY) === json) return true;
    return setItemWithRecovery(STORAGE_KEY, json);
  } catch (e) {
    console.warn("[playlists] storage write failed", e);
    return false;
  }
}

// Settling, and every change of secrets.json write health, re-stores the list so logins move in or back out of localStorage.
function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  let writable = canHoldCredentials();
  const resync = () => {
    writable = canHoldCredentials();
    if (!hydrated) return;
    persistLists(readStoredLists());
    notify();
  };
  if (!secretsSettled()) subscribeSecretsSettled(resync);
  subscribeSecretsWriteStatus(() => {
    if (canHoldCredentials() !== writable) resync();
  });
  subscribeSecretsDurable(() => {
    if (!hydrated) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null || !hasPlaintextCredentials(JSON.parse(raw) as StoredPlaylist[])) return;
    } catch {
      return;
    }
    persistLists(readStoredLists());
  });
}

function readStoredLists(): StoredPlaylist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return cache;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cache;
    return joinCredentials(
      parsed as StoredPlaylist[],
      parseCredentials(getSecret(IPTV_CREDENTIALS_KEY)),
    );
  } catch {
    return cache;
  }
}

export function writePlaylists(playlists: StoredPlaylist[]): boolean {
  hydrated = true;
  ensureSubscribed();
  const persisted = persistLists(playlists);
  if (!persisted) {
    console.warn(`[playlists] storage is full; not persisted (${playlists.length} playlists)`);
  }
  notify();
  return persisted;
}

export function subscribePlaylists(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

// The first snapshot hydrates the cache, so usePlaylists() renders the stored playlists at once.
function cachedPlaylists(): StoredPlaylist[] {
  if (!hydrated) readPlaylists();
  return cache;
}

export function usePlaylists(): StoredPlaylist[] {
  return useSyncExternalStore(subscribePlaylists, cachedPlaylists, cachedPlaylists);
}

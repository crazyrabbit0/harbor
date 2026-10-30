import { invoke } from "@tauri-apps/api/core";
import { SETTINGS_SECRETS_PREFIX } from "@/lib/settings/secret-fields";

// Xtream logins by playlist id; global like the playlists list itself, so a restore never retargets it to a profile.
export const IPTV_CREDENTIALS_KEY = "harbor.iptv.credentials.v1";

const SECRET_PREFIXES = [
  "harbor.lastfm.v1",
  "harbor.sports.api-sports.v1",
  "harbor.simkl.session.v1",
  "harbor.trakt.session.v1",
  "harbor.mal.session.v1",
  "harbor.anilist.session.v1",
  "harbor.media-server.token.v1",
  "harbor.plex-auth.device.v1",
  IPTV_CREDENTIALS_KEY,
  SETTINGS_SECRETS_PREFIX,
];

let store: Record<string, string> = {};
let rustAvailable = false;
let loaded = false;
let settled = false;
let persistTimer: number | null = null;
let retryTimer: number | null = null;
let retryIndex = 0;
let writeChain: Promise<void> = Promise.resolve();
// setSecret bumps dirtyVersion; a successful write of a snapshot taken at version v raises writtenVersion to v.
let dirtyVersion = 0;
let writtenVersion = 0;
const durableListeners = new Set<() => void>();

// A failed secrets_write retries after each delay in turn, then every last delay until one succeeds.
const RETRY_DELAYS_MS = [1000, 5000, 30_000];

export type SecretsWriteStatus =
  | { ok: true; at: number }
  | { ok: false; error: string; at: number };

let writeStatus: SecretsWriteStatus = { ok: true, at: 0 };
const writeStatusListeners = new Set<() => void>();

export function getSecretsWriteStatus(): SecretsWriteStatus {
  return writeStatus;
}

export function subscribeSecretsWriteStatus(listener: () => void): () => void {
  writeStatusListeners.add(listener);
  return () => {
    writeStatusListeners.delete(listener);
  };
}

function recordSecretsWrite(error: string | null): void {
  const at = Date.now();
  writeStatus = error == null ? { ok: true, at } : { ok: false, error, at };
  for (const listener of Array.from(writeStatusListeners)) {
    try {
      listener();
    } catch (error) {
      console.error("[secrets] write status listener failed", error);
    }
  }
}

/** True once every secret set so far is in secrets.json (or localStorage off-Tauri), so callers may drop other copies. */
export function secretsDurable(): boolean {
  if (!settled || !writeStatus.ok) return false;
  return !rustAvailable || writtenVersion >= dirtyVersion;
}

/** Runs the listener after each successful secrets_write that leaves every set secret durable. */
export function subscribeSecretsDurable(listener: () => void): () => void {
  durableListeners.add(listener);
  return () => {
    durableListeners.delete(listener);
  };
}

function notifyDurable(): void {
  if (!secretsDurable()) return;
  for (const listener of Array.from(durableListeners)) {
    try {
      listener();
    } catch (error) {
      console.error("[secrets] durable listener failed", error);
    }
  }
}

export function isSecretKey(key: string): boolean {
  return SECRET_PREFIXES.some((p) => key === p || key.startsWith(`${p}.`));
}

/** Rewrites a session key so it targets a specific profile, used when restoring a backup. */
export function secretKeyForProfile(key: string, profileId: string): string {
  // Settings secrets follow the blob's scope (shared or per profile), which the backup retargets itself.
  if (key.startsWith(`${SETTINGS_SECRETS_PREFIX}.`) || key === IPTV_CREDENTIALS_KEY) return key;
  for (const prefix of SECRET_PREFIXES) {
    if (key === prefix || key.startsWith(`${prefix}.`)) return `${prefix}.${profileId}`;
  }
  return key;
}

/** Snapshot of the Rust-persisted secret store, for backup/export use. */
export function getAllSecrets(): Record<string, string> {
  return { ...store };
}

function scheduleRetry(): void {
  if (retryTimer != null) return;
  const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
  retryIndex += 1;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void persist();
  }, delay);
}

function clearRetry(): void {
  if (retryTimer != null) window.clearTimeout(retryTimer);
  retryTimer = null;
}

async function writeOnce(): Promise<void> {
  if (!rustAvailable) return;
  const version = dirtyVersion;
  try {
    await invoke("secrets_write", { content: JSON.stringify(store) });
  } catch (e) {
    console.error("[secrets] secrets_write failed", e);
    recordSecretsWrite(e instanceof Error ? e.message : String(e));
    scheduleRetry();
    return;
  }
  writtenVersion = Math.max(writtenVersion, version);
  retryIndex = 0;
  clearRetry();
  recordSecretsWrite(null);
  notifyDurable();
}

// Writes run one at a time, so an older snapshot can never land after a newer one.
function persist(): Promise<void> {
  writeChain = writeChain.then(writeOnce);
  return writeChain;
}

function schedulePersist(): void {
  if (persistTimer != null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persist();
  }, 200);
}

/** Flushes any pending secret writes immediately, for callers about to leave the page. */
export async function flushSecrets(): Promise<void> {
  if (persistTimer != null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  clearRetry();
  await persist();
}

const settledListeners = new Set<() => void>();

function markSettled(): void {
  if (settled) return;
  settled = true;
  const listeners = Array.from(settledListeners);
  settledListeners.clear();
  for (const fn of listeners) fn();
}

/** True once loadSecrets has finished, so getSecret answers from the persisted store (or its browser fallback). */
export function secretsSettled(): boolean {
  return settled;
}

/** Runs fn once secrets are settled, at once when they already are; returns an unsubscribe. */
export function subscribeSecretsSettled(fn: () => void): () => void {
  if (settled) {
    fn();
    return () => {};
  }
  settledListeners.add(fn);
  return () => settledListeners.delete(fn);
}

export async function loadSecrets(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await invoke<string | null>("secrets_read");
    rustAvailable = true;
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") store = parsed as Record<string, string>;
    }
  } catch {
    rustAvailable = false;
    markSettled();
    return;
  }

  let migrated = false;
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key || !isSecretKey(key)) continue;
      const val = localStorage.getItem(key);
      if (val != null && store[key] == null) {
        store[key] = val;
        dirtyVersion += 1;
        migrated = true;
      }
    }
  } catch {
    void 0;
  }

  // The localStorage copies stay until secrets.json holds the keys, since they are the only durable copy.
  if (migrated) await persist();
  if (migrated && writeStatus.ok) {
    try {
      for (const key of Object.keys(store)) {
        if (isSecretKey(key)) localStorage.removeItem(key);
      }
    } catch {
      void 0;
    }
  }

  markSettled();
  // Readers that mounted before this resolved saw an empty store, and migration has
  // already removed the localStorage copies they would have fallen back to, so every
  // connected account read as signed out until something re-read it. Tell them now.
  try {
    window.dispatchEvent(new Event(SECRETS_READY));
  } catch {
    void 0;
  }
}

/** Fires once the persisted store is in memory, so session readers can re-read. */
export const SECRETS_READY = "harbor:secrets-ready";

export function subscribeSecretsReady(fn: () => void): () => void {
  if (loaded && rustAvailable) fn();
  window.addEventListener(SECRETS_READY, fn);
  return () => window.removeEventListener(SECRETS_READY, fn);
}

export function getSecret(key: string): string | null {
  if (rustAvailable) {
    if (store[key] != null) return store[key];
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setSecret(key: string, value: string | null): void {
  if (rustAvailable) {
    if ((store[key] ?? null) !== value) {
      if (value == null) delete store[key];
      else store[key] = value;
      dirtyVersion += 1;
      schedulePersist();
    }
    try {
      localStorage.removeItem(key);
    } catch {
      void 0;
    }
    return;
  }
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    void 0;
  }
}

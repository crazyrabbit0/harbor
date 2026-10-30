import { loadStoredSettings } from "./load";
import { setItemWithRecovery } from "@/lib/storage-recovery";
import { getSecret, getSecretsWriteStatus, secretsSettled, setSecret } from "@/lib/secret-store";
import {
  SETTINGS_SECRETS_PREFIX,
  TRAKT_LEGACY_MIGRATED_KEY,
  applySecretChanges,
  mergeSecrets,
  missingSecrets,
  parseSecrets,
  pickSecrets,
  serializeSecrets,
  settingsSecretsKey,
  settingsSecretsKeyForBlob,
  stripSecrets,
  type SettingsSecrets,
} from "./secret-fields";
import type { Settings } from "./types";

export const MIRROR_KEY = "harbor.settings";
export const SHARED_KEY = "harbor.settings.shared";

export function profileKey(id: string): string {
  return `harbor.settings.${id}`;
}

export function sourceKeyFor(profileId: string, linked: boolean): string {
  return linked ? SHARED_KEY : profileKey(profileId);
}

function legacyTraktMigrated(): boolean {
  try {
    return localStorage.getItem(TRAKT_LEGACY_MIGRATED_KEY) != null;
  } catch {
    return false;
  }
}

export function serializeSettings(settings: Settings): string {
  const { backgroundImage: _drop, ...themeRest } = settings.theme;
  void _drop;
  return JSON.stringify({ ...stripSecrets(settings, legacyTraktMigrated()), theme: themeRest });
}

// Until secrets settle, and while secrets.json writes fail, the blob keeps its secrets so no write can lose the only copy.
function serializeForBlob(settings: Settings): string {
  if (secretsSettled() && getSecretsWriteStatus().ok) return serializeSettings(settings);
  const { backgroundImage: _drop, ...themeRest } = settings.theme;
  void _drop;
  return JSON.stringify({ ...settings, theme: themeRest });
}

export function isSettingsSecretsKey(key: string): boolean {
  return key.startsWith(`${SETTINGS_SECRETS_PREFIX}.`);
}

function readSecretsAt(secretKey: string): SettingsSecrets {
  return parseSecrets(getSecret(secretKey));
}

function writeSecretsAt(secretKey: string, secrets: SettingsSecrets): void {
  setSecret(secretKey, serializeSecrets(secrets));
}

export function readSettingsSecrets(profileId: string, linked: boolean): SettingsSecrets {
  return readSecretsAt(settingsSecretsKey(profileId, linked));
}

/** Applies explicit secret edits to a scope; an empty value deletes its entry. */
export function writeSettingsSecrets(
  profileId: string,
  linked: boolean,
  changes: SettingsSecrets,
): void {
  if (Object.keys(changes).length === 0) return;
  const key = settingsSecretsKey(profileId, linked);
  writeSecretsAt(key, applySecretChanges(readSecretsAt(key), changes));
}

/** Copies non-empty values the scope lacks into the store; never overwrites or deletes a stored one. */
function fillMissingSecrets(secretKey: string, source: Partial<Settings>): void {
  const stored = readSecretsAt(secretKey);
  const missing = missingSecrets(source, stored);
  if (Object.keys(missing).length > 0) writeSecretsAt(secretKey, { ...stored, ...missing });
}

/** Moves the secrets a stored blob still carries into its scope (blob values win with `overwrite`) and strips the blob. */
export function migrateBlobSecrets(blobKey: string, overwrite = false): void {
  const secretKey = settingsSecretsKeyForBlob(blobKey);
  if (!secretKey || !secretsSettled() || !getSecretsWriteStatus().ok) return;
  try {
    const raw = localStorage.getItem(blobKey);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Settings> | null;
    if (!parsed || typeof parsed !== "object") return;
    const embedded = pickSecrets(parsed);
    if (Object.keys(embedded).length === 0) return;
    if (overwrite) writeSecretsAt(secretKey, { ...readSecretsAt(secretKey), ...embedded });
    else fillMissingSecrets(secretKey, parsed);
    setItemWithRecovery(blobKey, JSON.stringify(stripSecrets(parsed, legacyTraktMigrated())));
  } catch {
    return;
  }
}

export function seedSharedFromLegacy(): void {
  try {
    if (localStorage.getItem(SHARED_KEY)) return;
    const legacy = localStorage.getItem(MIRROR_KEY);
    if (legacy) localStorage.setItem(SHARED_KEY, legacy);
  } catch {
    return;
  }
}

function loadWithSecrets(blobKey: string): Settings {
  const settings = loadStoredSettings(blobKey);
  const secretKey = settingsSecretsKeyForBlob(blobKey);
  return secretKey ? mergeSecrets(settings, readSecretsAt(secretKey)) : settings;
}

export function loadEffective(profileId: string, linked: boolean): Settings {
  const key = sourceKeyFor(profileId, linked);
  if (localStorage.getItem(key) != null) return loadWithSecrets(key);
  if (localStorage.getItem(SHARED_KEY) != null) return loadWithSecrets(SHARED_KEY);
  if (localStorage.getItem(MIRROR_KEY) != null) return loadWithSecrets(MIRROR_KEY);
  return loadWithSecrets(key);
}

export function recoverableLegacyBlob(): string | null {
  return localStorage.getItem(SHARED_KEY) ?? localStorage.getItem(MIRROR_KEY);
}

/** The active profile's settings scope as stored in the roster; for code outside SettingsProvider. */
export function readActiveSettingsSource(): { profileId: string; linked: boolean } {
  try {
    const raw = localStorage.getItem("harbor.profiles.v1");
    if (!raw) return { profileId: "default", linked: true };
    const s = JSON.parse(raw) as {
      profiles?: Array<{ id: string; settingsLinked?: boolean }>;
      activeId?: string | null;
    };
    const id = s.activeId || "default";
    const p = s.profiles?.find((x) => x.id === id);
    return { profileId: id, linked: p?.settingsLinked !== false };
  } catch {
    return { profileId: "default", linked: true };
  }
}

export function applyLegacyToActive(): boolean {
  const blob = recoverableLegacyBlob();
  if (blob == null) return false;
  const { profileId, linked } = readActiveSettingsSource();
  const target = sourceKeyFor(profileId, linked);
  if (!linked) copyScopeSecrets(settingsSecretsKey(profileId, true), profileId);
  const ok = setItemWithRecovery(target, blob);
  setItemWithRecovery(MIRROR_KEY, blob);
  migrateBlobSecrets(target);
  migrateBlobSecrets(MIRROR_KEY);
  return ok;
}

export function persistEffective(settings: Settings, profileId: string, linked: boolean): string {
  if (secretsSettled()) fillMissingSecrets(settingsSecretsKey(profileId, linked), settings);
  const json = serializeForBlob(settings);
  const ok = setItemWithRecovery(sourceKeyFor(profileId, linked), json);
  setItemWithRecovery(MIRROR_KEY, json);
  if (!ok) {
    console.error(
      `[settings] blob of ${json.length} chars did not persist; changes will be lost on restart`,
    );
  }
  return json;
}

/** Gives a profile its own copy of a scope's secrets, filling only what it lacks. */
function copyScopeSecrets(fromSecretKey: string, toProfileId: string): void {
  const from = readSecretsAt(fromSecretKey);
  if (Object.keys(from).length === 0) return;
  const toSecretKey = settingsSecretsKey(toProfileId, false);
  const stored = readSecretsAt(toSecretKey);
  const merged = { ...from, ...stored };
  if (Object.keys(merged).length > Object.keys(stored).length) writeSecretsAt(toSecretKey, merged);
}

/** Copies a settings blob into a profile's own blob, bringing the secrets of its scope along. */
export function copyBlobToProfile(fromBlobKey: string, blob: string, toProfileId: string): void {
  const target = profileKey(toProfileId);
  const fromSecretKey = settingsSecretsKeyForBlob(fromBlobKey);
  const toSecretKey = settingsSecretsKey(toProfileId, false);
  if (fromSecretKey && fromSecretKey !== toSecretKey) {
    writeSecretsAt(toSecretKey, readSecretsAt(fromSecretKey));
  }
  setItemWithRecovery(target, blob);
  migrateBlobSecrets(target);
}

export function forkToProfile(profileId: string): void {
  const fromKey = localStorage.getItem(SHARED_KEY) != null ? SHARED_KEY : MIRROR_KEY;
  const shared = localStorage.getItem(fromKey);
  if (shared != null) copyBlobToProfile(fromKey, shared, profileId);
  else copyScopeSecrets(settingsSecretsKey(profileId, true), profileId);
}

export function dropProfileBlob(profileId: string): void {
  try {
    localStorage.removeItem(profileKey(profileId));
  } catch {
    return;
  }
}

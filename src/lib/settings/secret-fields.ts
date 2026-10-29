import type { Settings } from "./types";

// Credentials kept in the secret store, not the blob; code outside SettingsProvider reads tmdbKey through settings/tmdb-key.ts.
export const SECRET_SETTING_KEYS = [
  "tmdbKey",
  "tvdbKey",
  "tvdbPin",
  "rdKey",
  "tbKey",
  "adKey",
  "pmKey",
  "dlKey",
  "traktClientSecret",
  "igdbClientSecret",
  "omdbKey",
  "rpdbKey",
  "fanartKey",
  "mdblistKey",
  "auddKey",
  "auddApiKey",
  "songIdAiKey",
  "aiSearchKey",
  "aiGroqKey",
  "jinaKey",
  "opensubtitlesApiKey",
  "theIntroDbKey",
  "jimakuToken",
  "subdlApiKey",
  "subsourceApiKey",
  "nytKey",
  "sportsApiKey",
  "togetherCfToken",
] as const satisfies readonly (keyof Settings)[];

export type SecretSettingKey = (typeof SECRET_SETTING_KEYS)[number];
export type SettingsSecrets = Partial<Record<SecretSettingKey, string>>;
type SecretSource = Partial<Record<SecretSettingKey, unknown>>;

// Legacy Trakt tokens leave the blob only after trakt/session.ts has imported them once.
export const LEGACY_TRAKT_KEYS = [
  "traktAccessToken",
  "traktRefreshToken",
  "traktExpiresAt",
] as const;
export const TRAKT_LEGACY_MIGRATED_KEY = "harbor.trakt.legacy-migrated.v1";

export const SETTINGS_SECRETS_PREFIX = "harbor.settings-secrets.v1";
const SETTINGS_BLOB_PREFIX = "harbor.settings.";
const SETTINGS_MIRROR_KEY = "harbor.settings";
const SHARED_SCOPE = "shared";

/** Secret-store key holding one scope's secrets; scoped exactly like the settings blob. */
export function settingsSecretsKey(profileId: string, linked: boolean): string {
  return `${SETTINGS_SECRETS_PREFIX}.${linked ? SHARED_SCOPE : profileId}`;
}

/** The secrets key belonging to a settings blob key, or null for any other key. */
export function settingsSecretsKeyForBlob(blobKey: string): string | null {
  if (blobKey === SETTINGS_MIRROR_KEY) return `${SETTINGS_SECRETS_PREFIX}.${SHARED_SCOPE}`;
  if (!blobKey.startsWith(SETTINGS_BLOB_PREFIX)) return null;
  const scope = blobKey.slice(SETTINGS_BLOB_PREFIX.length);
  return /^[A-Za-z0-9_-]+$/.test(scope) ? `${SETTINGS_SECRETS_PREFIX}.${scope}` : null;
}

/** The non-empty secret values of a settings object or parsed blob. */
export function pickSecrets(source: SecretSource): SettingsSecrets {
  const out: SettingsSecrets = {};
  for (const key of SECRET_SETTING_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

export function parseSecrets(raw: string | null): SettingsSecrets {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? pickSecrets(parsed as SecretSource) : {};
  } catch {
    return {};
  }
}

export function serializeSecrets(secrets: SettingsSecrets): string | null {
  const clean = pickSecrets(secrets);
  return Object.keys(clean).length > 0 ? JSON.stringify(clean) : null;
}

export function stripSecrets<T extends object>(source: T, stripLegacyTrakt: boolean): T {
  const out: T = { ...source };
  const bag = out as Record<string, unknown>;
  for (const key of SECRET_SETTING_KEYS) delete bag[key];
  if (stripLegacyTrakt) for (const key of LEGACY_TRAKT_KEYS) delete bag[key];
  return out;
}

/** Stored values win over the state's when non-empty; returns the same object when nothing changes. */
export function mergeSecrets<T extends SecretSource>(state: T, stored: SettingsSecrets): T {
  const patch: SettingsSecrets = {};
  for (const [key, value] of Object.entries(pickSecrets(stored)) as [SecretSettingKey, string][]) {
    if (state[key] !== value) patch[key] = value;
  }
  return Object.keys(patch).length > 0 ? { ...state, ...patch } : state;
}

/** Non-empty state values the store does not hold yet. */
export function missingSecrets(state: SecretSource, stored: SettingsSecrets): SettingsSecrets {
  const out: SettingsSecrets = {};
  for (const [key, value] of Object.entries(pickSecrets(state)) as [SecretSettingKey, string][]) {
    if (!stored[key]) out[key] = value;
  }
  return out;
}

/** Secret values that differ between two states; a cleared value maps to "". */
export function changedSecrets(prev: SecretSource, next: SecretSource): SettingsSecrets {
  const out: SettingsSecrets = {};
  for (const key of SECRET_SETTING_KEYS) {
    const a = prev[key];
    const b = next[key];
    const before = typeof a === "string" ? a : "";
    const after = typeof b === "string" ? b : "";
    if (before !== after) out[key] = after;
  }
  return out;
}

/** Applies changes to stored secrets; an empty value deletes its entry. */
export function applySecretChanges(
  stored: SettingsSecrets,
  changes: SettingsSecrets,
): SettingsSecrets {
  const out: SettingsSecrets = { ...stored };
  for (const [key, value] of Object.entries(changes) as [SecretSettingKey, string][]) {
    if (value) out[key] = value;
    else delete out[key];
  }
  return out;
}

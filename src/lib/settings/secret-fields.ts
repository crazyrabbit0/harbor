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

// Nested settings that embed a token (webhook URLs); stored flat under their dotted path in the same scope as SECRET_SETTING_KEYS.
export const SECRET_NESTED_PATHS = [
  "webhooks.discordUrl",
  "webhooks.telegramUrl",
] as const satisfies readonly `webhooks.${keyof Settings["webhooks"] & string}`[];

export type SecretSettingKey = (typeof SECRET_SETTING_KEYS)[number];
export type SecretNestedPath = (typeof SECRET_NESTED_PATHS)[number];
export type SecretPath = SecretSettingKey | SecretNestedPath;
export type SettingsSecrets = Partial<Record<SecretPath, string>>;

const SECRET_PATHS: readonly SecretPath[] = [...SECRET_SETTING_KEYS, ...SECRET_NESTED_PATHS];

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

type Bag = Record<string, unknown>;

function isBag(value: unknown): value is Bag {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function splitPath(path: SecretPath): [string, string | null] {
  const dot = path.indexOf(".");
  return dot < 0 ? [path, null] : [path.slice(0, dot), path.slice(dot + 1)];
}

function readPath(source: object, path: SecretPath): unknown {
  const [head, field] = splitPath(path);
  const value = (source as Bag)[head];
  if (field == null) return value;
  return isBag(value) ? value[field] : undefined;
}

function readString(source: object, path: SecretPath): string {
  const value = readPath(source, path);
  return typeof value === "string" ? value : "";
}

/** The non-empty secret values of a settings object or parsed blob. */
export function pickSecrets(source: object): SettingsSecrets {
  const out: SettingsSecrets = {};
  for (const path of SECRET_PATHS) {
    const value = readString(source, path);
    if (value) out[path] = value;
  }
  return out;
}

// Stored scopes are flat maps keyed by path, unlike the nested settings shape pickSecrets reads.
function pickStored(stored: object): SettingsSecrets {
  const out: SettingsSecrets = {};
  const bag = stored as Bag;
  for (const path of SECRET_PATHS) {
    const value = bag[path];
    if (typeof value === "string" && value !== "") out[path] = value;
  }
  return out;
}

export function parseSecrets(raw: string | null): SettingsSecrets {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isBag(parsed) ? pickStored(parsed) : {};
  } catch {
    return {};
  }
}

export function serializeSecrets(secrets: SettingsSecrets): string | null {
  const clean = pickStored(secrets);
  return Object.keys(clean).length > 0 ? JSON.stringify(clean) : null;
}

export function stripSecrets<T extends object>(source: T, stripLegacyTrakt: boolean): T {
  const out: T = { ...source };
  const bag = out as Bag;
  for (const key of SECRET_SETTING_KEYS) delete bag[key];
  for (const path of SECRET_NESTED_PATHS) {
    const [head, field] = splitPath(path);
    const group = bag[head];
    if (field == null || !isBag(group) || !(field in group)) continue;
    const { [field]: _drop, ...rest } = group;
    void _drop;
    bag[head] = rest;
  }
  if (stripLegacyTrakt) for (const key of LEGACY_TRAKT_KEYS) delete bag[key];
  return out;
}

/** Stored values win over the state's when non-empty; returns the same object when nothing changes. */
export function mergeSecrets<T extends object>(state: T, stored: SettingsSecrets): T {
  let out: Bag | null = null;
  for (const [path, value] of Object.entries(pickStored(stored)) as [SecretPath, string][]) {
    if (readPath(state, path) === value) continue;
    out ??= { ...(state as Bag) };
    const [head, field] = splitPath(path);
    if (field == null) out[head] = value;
    else out[head] = { ...(isBag(out[head]) ? out[head] : {}), [field]: value };
  }
  return out ? (out as T) : state;
}

/** Non-empty state values the store does not hold yet. */
export function missingSecrets(state: object, stored: SettingsSecrets): SettingsSecrets {
  const out: SettingsSecrets = {};
  for (const [path, value] of Object.entries(pickSecrets(state)) as [SecretPath, string][]) {
    if (!stored[path]) out[path] = value;
  }
  return out;
}

/** Secret values that differ between two states; a cleared value maps to "". */
export function changedSecrets(prev: object, next: object): SettingsSecrets {
  const out: SettingsSecrets = {};
  for (const path of SECRET_PATHS) {
    const after = readString(next, path);
    if (readString(prev, path) !== after) out[path] = after;
  }
  return out;
}

/** Applies changes to stored secrets; an empty value deletes its entry. */
export function applySecretChanges(
  stored: SettingsSecrets,
  changes: SettingsSecrets,
): SettingsSecrets {
  const out: SettingsSecrets = { ...stored };
  for (const [path, value] of Object.entries(changes) as [SecretPath, string][]) {
    if (value) out[path] = value;
    else delete out[path];
  }
  return out;
}

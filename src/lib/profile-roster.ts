// The one reader of the persisted profile list; ProfilesProvider (profiles.tsx) is its only writer.
export const PROFILES_KEY = "harbor.profiles.v1";

export type StoredProfile = {
  id: string;
  isPrimary?: boolean;
  settingsLinked?: boolean;
  shareStremioWith?: string | null;
  [field: string]: unknown;
};

export type StoredRoster = { profiles: StoredProfile[]; activeId: string | null };

const EMPTY: StoredRoster = { profiles: [], activeId: null };
let cache: { raw: string | null; roster: StoredRoster } | null = null;

function parse(raw: string | null): StoredRoster {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as { profiles?: unknown; activeId?: unknown } | null;
    const profiles = Array.isArray(value?.profiles)
      ? (value.profiles as unknown[]).filter(
          (p): p is StoredProfile =>
            !!p && typeof p === "object" && typeof (p as { id?: unknown }).id === "string",
        )
      : [];
    const activeId = typeof value?.activeId === "string" && value.activeId ? value.activeId : null;
    return { profiles, activeId };
  } catch {
    return EMPTY;
  }
}

/** Parsed once per stored value, so per-call helpers stay cheap. */
export function readRoster(): StoredRoster {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PROFILES_KEY);
  } catch {
    return EMPTY;
  }
  if (cache?.raw === raw) return cache.roster;
  const roster = parse(raw);
  cache = { raw, roster };
  return roster;
}

export function activeStoredProfile(roster = readRoster()): StoredProfile | null {
  return roster.profiles.find((p) => p.id === roster.activeId) ?? null;
}

export function primaryStoredProfile(roster = readRoster()): StoredProfile | null {
  return roster.profiles.find((p) => p.isPrimary === true) ?? null;
}

/** The active id as stored, falling back to "default" like the settings scope. */
export function storedActiveId(): string {
  return readRoster().activeId || "default";
}

/** Settings scope: the active profile and whether it shares the linked settings blob. */
export function activeSettingsSource(): { profileId: string; linked: boolean } {
  const roster = readRoster();
  const profileId = roster.activeId || "default";
  const profile = roster.profiles.find((p) => p.id === profileId);
  return { profileId, linked: profile?.settingsLinked !== false };
}

/** Per-profile data that follows the settings link: `sharedKey` when linked, `<separatePrefix>.<id>` when separate. */
export function separateProfileKey(sharedKey: string, separatePrefix = sharedKey): string {
  const roster = readRoster();
  if (!roster.activeId) return sharedKey;
  const profile = activeStoredProfile(roster);
  if (!profile || profile.settingsLinked !== false) return sharedKey;
  return `${separatePrefix}.${roster.activeId}`;
}

/** Profile whose Stremio data the active profile reads (its own, or the one it shares with); "" before any profile exists. */
export function stremioDataProfileId(): string {
  const roster = readRoster();
  const active = activeStoredProfile(roster);
  const own = active?.id ?? primaryStoredProfile(roster)?.id ?? "";
  if (!own) return "";
  const share = active?.shareStremioWith;
  if (typeof share === "string" && share) {
    const shared = roster.profiles.find((p) => p.id === share);
    if (shared) return shared.id;
  }
  return own;
}

/** The primary profile's id, else the Stremio data profile. */
export function primaryOrStremioProfileId(): string {
  return primaryStoredProfile()?.id || stremioDataProfileId();
}

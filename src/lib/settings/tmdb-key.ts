import { loadEffective, readActiveSettingsSource } from "./profile-store";

let current: string | null = null;

/** Set by SettingsProvider whenever the active TMDB key changes. */
export function setTmdbKey(key: string): void {
  current = key;
}

/** The active TMDB key for code outside SettingsProvider; windows without the provider read the stored settings and secrets. */
export function getTmdbKey(): string {
  if (current != null) return current;
  try {
    const { profileId, linked } = readActiveSettingsSource();
    return loadEffective(profileId, linked).tmdbKey ?? "";
  } catch {
    return "";
  }
}

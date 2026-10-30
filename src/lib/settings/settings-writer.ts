import type { Settings } from "./types";

export type ModuleSync = {
  tmdbLanguage: (lang: string) => void;
  providerKeys: (s: Settings) => void;
};

export const PROVIDER_KEY_FIELDS = [
  "tmdbKey",
  "tvdbKey",
  "traktClientId",
  "traktClientSecret",
  "malClientId",
  "igdbClientId",
  "igdbClientSecret",
] as const satisfies ReadonlyArray<keyof Settings>;

/** Holds the latest settings and pushes module-level values when they change, before React re-renders. */
export function createSettingsWriter(
  initial: Settings,
  sync: ModuleSync,
  commit: (next: Settings) => void,
) {
  let current = initial;
  return {
    get: () => current,
    set(next: Settings | ((s: Settings) => Settings)) {
      const prev = current;
      const value = typeof next === "function" ? next(prev) : next;
      if (value === prev) return;
      current = value;
      if (value.tmdbLanguage !== prev.tmdbLanguage) sync.tmdbLanguage(value.tmdbLanguage);
      if (PROVIDER_KEY_FIELDS.some((k) => value[k] !== prev[k])) sync.providerKeys(value);
      commit(value);
    },
  };
}

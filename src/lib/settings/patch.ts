import type { Settings } from "./types";

/** Merges a patch, returning the same object when every patched value is already Object.is-equal. */
export function applySettingsPatch(s: Settings, patch: Partial<Settings>): Settings {
  for (const key of Object.keys(patch) as Array<keyof Settings>) {
    if (!Object.is(s[key], patch[key])) return { ...s, ...patch };
  }
  return s;
}

/** Keys of the patch whose value differs from the base settings. */
export function changedSettingsKeys(base: Settings, patch: Partial<Settings>): Set<keyof Settings> {
  const out = new Set<keyof Settings>();
  for (const key of Object.keys(patch) as Array<keyof Settings>) {
    if (!Object.is(base[key], patch[key])) out.add(key);
  }
  return out;
}

let cache: { raw: string | null; value: Record<string, unknown> } | null = null;

/** The `harbor.settings` mirror, parsed once per change; for code outside SettingsProvider. Do not mutate the result. */
export function storedSettings(): Record<string, unknown> {
  let raw: string | null = null;
  try {
    raw = typeof localStorage === "undefined" ? null : localStorage.getItem("harbor.settings");
  } catch {
    return {};
  }
  if (cache && cache.raw === raw) return cache.value;
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") value = parsed as Record<string, unknown>;
  } catch {
    value = {};
  }
  cache = { raw, value };
  return value;
}

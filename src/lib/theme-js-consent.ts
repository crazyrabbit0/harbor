import type { CustomTheme, CustomThemeOrigin } from "./custom-themes";

export const THEME_JS_CONSENT_KEY = "harbor.theme-js-consent.v1";

type ConsentMap = Record<string, string>;
type ScriptedTheme = Pick<CustomTheme, "id" | "js" | "origin">;

const subscribers = new Set<() => void>();
let cache: ConsentMap | null = null;

function readMap(): ConsentMap {
  if (cache) return cache;
  const out: ConsentMap = {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(THEME_JS_CONSENT_KEY) || "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) if (typeof v === "string") out[k] = v;
    }
  } catch {
    void 0;
  }
  cache = out;
  return out;
}

function writeMap(map: ConsentMap): void {
  cache = map;
  try {
    localStorage.setItem(THEME_JS_CONSENT_KEY, JSON.stringify(map));
  } catch {
    void 0;
  }
  for (const fn of subscribers) fn();
}

// FNV-1a 32-bit: a change detector for the script text, not a security digest.
export function hashThemeJs(js: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < js.length; i++) {
    h ^= js.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${js.length.toString(36)}-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function scriptOf(theme: ScriptedTheme): string {
  return (theme.js ?? "").trim();
}

// Built-in presets ship with the app; only `user:` themes can carry outside code.
function isForeign(theme: ScriptedTheme): boolean {
  return theme.id.startsWith("user:") && theme.origin !== "local";
}

export function needsThemeJsConsent(theme: ScriptedTheme): boolean {
  const js = scriptOf(theme);
  if (!js || !isForeign(theme)) return false;
  return readMap()[theme.id] !== hashThemeJs(js);
}

export function hasThemeJsConsent(theme: ScriptedTheme): boolean {
  const js = scriptOf(theme);
  return !!js && isForeign(theme) && readMap()[theme.id] === hashThemeJs(js);
}

export function canRunThemeJs(theme: ScriptedTheme): boolean {
  return !needsThemeJsConsent(theme);
}

export function grantThemeJsConsent(theme: ScriptedTheme): void {
  const js = scriptOf(theme);
  if (!js) return;
  writeMap({ ...readMap(), [theme.id]: hashThemeJs(js) });
}

export function revokeThemeJsConsent(themeId: string): void {
  const map = readMap();
  if (!(themeId in map)) return;
  const next = { ...map };
  delete next[themeId];
  writeMap(next);
}

export function subscribeThemeJsConsent(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

// A Studio save keeps a seed's foreign origin while its script is untouched, so re-saving cannot launder consent.
export function studioThemeOrigin(
  seeds: readonly (ScriptedTheme | undefined)[],
  js: string,
): CustomThemeOrigin {
  const script = js.trim();
  if (!script) return "local";
  for (const seed of seeds) {
    if (!seed || !isForeign(seed)) continue;
    if (scriptOf(seed) === script) return seed.origin ?? "imported";
  }
  return "local";
}

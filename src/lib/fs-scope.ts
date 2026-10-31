// Re-allows user-chosen folders and files kept outside settings.json; Rust (fs_scope.rs) re-allows the settings.json ones.
type ReadableStorage = Pick<Storage, "getItem" | "key" | "length">;
type LibraryEntry = { folder?: string; localArt?: Record<string, string | undefined> };

const MUSIC_DIR_KEY = "harbor.music.download-dir.v1";
const MANGA_DIR_KEY = "harbor.manga.downloads.dir.v1";
const EBOOK_SOURCES_KEY = "harbor.ebook.sources.v1";
const MANGA_SOURCES_KEY = "harbor.manga.sources.v1";
const SUBTITLE_MEMORY_KEY = "harbor.subtitle.memory.v1";
const CUSTOM_GAMES_PREFIX = "harbor.games.custom.v1:";
const GAME_PRESENTATION_PREFIX = "harbor.games.presentation.v1:";
const MAX_PATHS = 512;

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const absolute = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 4096 && /^(?:[a-z]:[\\/]|[\\/])/i.test(value.trim());

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];

const values = (value: unknown): Record<string, unknown>[] =>
  value && typeof value === "object" ? records(Object.values(value)) : [];

function storedKeys(store: ReadableStorage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function unique(list: unknown[]): string[] {
  return [...new Set(list.filter(absolute).map((value) => value.trim()))];
}

/** Folders and files the user picked that only localStorage remembers. */
export function collectStoredPaths(store: ReadableStorage): string[] {
  const out: unknown[] = [store.getItem(MUSIC_DIR_KEY), store.getItem(MANGA_DIR_KEY)];
  for (const source of records(parse(store.getItem(EBOOK_SOURCES_KEY))))
    if (source.kind === "local") out.push(source.location);
  for (const source of records(parse(store.getItem(MANGA_SOURCES_KEY))))
    if (source.kind === "local") out.push(source.baseUrl);
  for (const entry of values(parse(store.getItem(SUBTITLE_MEMORY_KEY))))
    if (entry.imported === true) out.push(entry.source);
  for (const key of storedKeys(store)) {
    if (key.startsWith(CUSTOM_GAMES_PREFIX)) {
      const store_ = parse(store.getItem(key)) as { games?: unknown } | null;
      for (const game of records(store_?.games)) out.push(game.artwork);
    } else if (key.startsWith(GAME_PRESENTATION_PREFIX)) {
      const prefs = parse(store.getItem(key)) as { entries?: unknown } | null;
      for (const entry of values(prefs?.entries)) out.push(entry.cover);
    }
  }
  return unique(out);
}

// Show-level tvshow.nfo and artwork sit one folder above a season folder (lib/local-library/sidecars.ts).
function parentOf(folder: unknown): string | undefined {
  if (!absolute(folder)) return undefined;
  const trimmed = folder.trim().replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return cut > 0 ? trimmed.slice(0, cut) : undefined;
}

/** Scanned local-library folders, their parents and the sidecar artwork found in them. */
export function localLibraryPaths(entries: LibraryEntry[]): string[] {
  return unique(
    entries.flatMap((entry) => [
      entry.folder,
      parentOf(entry.folder),
      ...Object.values(entry.localArt ?? {}),
    ]),
  );
}

/** Adds absolute folders (recursively) or files to the fs and asset scopes; Rust rejects roots, home and dot folders. */
export async function allowFsPaths(paths: readonly unknown[]): Promise<void> {
  const list = unique([...paths]);
  if (!isTauri() || list.length === 0) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    for (let start = 0; start < list.length; start += MAX_PATHS)
      await invoke("fs_scope_allow", { paths: list.slice(start, start + MAX_PATHS) });
  } catch (error) {
    console.warn("[fs-scope] allow failed", error);
  }
}

async function allowLocalLibraryPaths(): Promise<void> {
  try {
    const library = await import("@/lib/local-library");
    await library.localLibraryReady();
    await allowFsPaths(localLibraryPaths(library.readLocalLibrary()));
  } catch {
    // The library still scans through Rust; only sidecars and posters miss out.
  }
}

/** Startup pass for the main window; resolves once the localStorage paths are allowed, the local library follows. */
export async function allowStoredFsPaths(): Promise<void> {
  if (!isTauri()) return;
  void allowLocalLibraryPaths();
  try {
    await allowFsPaths(collectStoredPaths(localStorage));
  } catch {
    // Blocked storage leaves nothing to re-allow.
  }
}

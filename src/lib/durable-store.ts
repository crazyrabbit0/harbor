import { invoke } from "@tauri-apps/api/core";

// localStorage keys (and their `<key>.<profile>` or `<key>:<profile>` variants) also kept in user-data.json, so a cleared WebView keeps them.
export const DURABLE_PREFIXES = [
  "harbor.watchevents.v1",
  "harbor.playback-history.v1",
  "harbor.watchlist.v1",
  "harbor.manualwatched.v1",
  "harbor.manualunwatched.v1",
  "harbor.manualwatched.meta.v1",
  "harbor.manualwatched.dismissed.v1",
  "harbor.manualunwatched.at.v1",
  "harbor.manualwatched.fromremote.v1",
  "harbor.customlists.v1",
  "harbor.mangalists.v1",
  // Separate profiles store collections as harbor.collections.<profile>, not under .v1.
  "harbor.collections",
  "harbor.favorites.v1",
  "harbor.mangafav.v1",
  "harbor.charfavorites.v1",
  "harbor.localcw.v1",
  "harbor.localcw.private.v1",
  // The scanned library itself is rebuilt by a rescan; the paths the user removed are not.
  "harbor.library.local.removed.v1",
  // Your ratings (harbor.ratings.v1, harbor.ratings.<profile> for separate profiles) and their import receipts.
  "harbor.ratings",
  // Manga reading position per title and the chapters marked read, one key per profile.
  "harbor.mangaread.v1",
  "harbor.mangaread.chapters.v1",
  // Bookmarks and annotations the user made in the manga and eBook readers.
  "harbor.mangabookmarks.v1",
  "harbor.ebook.bookmarks.v1",
  "harbor.ebook.annotations.v1",
  // Episodes hidden from a show's list.
  "harbor.hiddenepisodes.v1",
  // The eBook library, favorites and read-later lists; EPUB covers are kept in IndexedDB (ebook-covers.ts).
  "harbor.ebook.library.v1",
  "harbor.ebook.favorites.v1",
  "harbor.ebook.read-later.v1",
  // Saved games, keyed harbor.games.saved.v1:<profile>.
  "harbor.games.saved.v1",
];

// Set once this WebView profile has been reconciled with user-data.json; without it the file's keys are restored.
const MARKER_KEY = "harbor.durable-store.v1";
const WRITE_DELAY_MS = 300;
// Playback history changes on every autosave tick, so scheduled writes are spaced out; pagehide still flushes at once.
const MIN_WRITE_INTERVAL_MS = 10_000;

let available = false;
let loaded = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let lastWriteAt = -Infinity;
let lastContent: string | null = null;

export function isDurableKey(key: string): boolean {
  return DURABLE_PREFIXES.some(
    (p) => key === p || key.startsWith(`${p}.`) || key.startsWith(`${p}:`),
  );
}

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !isDurableKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value != null) out[key] = value;
  }
  return out;
}

async function writeSnapshot(): Promise<void> {
  if (!available) return;
  const content = JSON.stringify(snapshot());
  if (content === lastContent) return;
  lastWriteAt = Date.now();
  try {
    await invoke("user_data_write", { content });
    lastContent = content;
  } catch (error) {
    console.error("[durable-store] user_data_write failed", error);
  }
}

/** Writes the durable keys to user-data.json now; writes run one at a time. */
export function flushDurableStore(): Promise<void> {
  if (timer != null) clearTimeout(timer);
  timer = null;
  writeChain = writeChain.then(writeSnapshot);
  return writeChain;
}

/** Schedules a write after durable keys changed in localStorage, including direct removals. */
export function syncDurableStore(): void {
  if (!available || timer != null) return;
  const delay = Math.max(WRITE_DELAY_MS, lastWriteAt + MIN_WRITE_INTERVAL_MS - Date.now());
  timer = setTimeout(() => {
    timer = null;
    void flushDurableStore();
  }, delay);
}

/** localStorage.setItem for a durable key; throws like setItem when storage refuses the value. */
export function durableSetItem(key: string, value: string): void {
  localStorage.setItem(key, value);
  syncDurableStore();
}

/** Reconciles localStorage with user-data.json once at startup, before any reader runs. */
export async function loadDurableStore(): Promise<void> {
  if (loaded) return;
  loaded = true;
  let file: Record<string, unknown> = {};
  try {
    const raw = await invoke<string | null>("user_data_read");
    available = true;
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      file = parsed as Record<string, unknown>;
    }
  } catch (error) {
    if (!available) return;
    console.warn(
      "[durable-store] user-data.json is unreadable; rewriting it from localStorage",
      error,
    );
  }
  try {
    if (localStorage.getItem(MARKER_KEY) == null) {
      for (const [key, value] of Object.entries(file)) {
        if (isDurableKey(key) && typeof value === "string" && localStorage.getItem(key) == null) {
          localStorage.setItem(key, value);
        }
      }
      localStorage.setItem(MARKER_KEY, "1");
    }
  } catch (error) {
    console.warn("[durable-store] could not restore durable keys", error);
  }
  await flushDurableStore();
  try {
    window.addEventListener("pagehide", () => void flushDurableStore());
  } catch {
    void 0;
  }
}

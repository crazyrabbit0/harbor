import { invoke } from "@tauri-apps/api/core";

// localStorage keys (and their `<key>.<profile>` variants) also kept in user-data.json, so a cleared WebView keeps them.
export const DURABLE_PREFIXES = ["harbor.watchevents.v1"];

// Set once this WebView profile has been reconciled with user-data.json; without it the file's keys are restored.
const MARKER_KEY = "harbor.durable-store.v1";
const WRITE_DELAY_MS = 300;

let available = false;
let loaded = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let writeChain: Promise<void> = Promise.resolve();

export function isDurableKey(key: string): boolean {
  return DURABLE_PREFIXES.some((p) => key === p || key.startsWith(`${p}.`));
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
  try {
    await invoke("user_data_write", { content: JSON.stringify(snapshot()) });
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
  timer = setTimeout(() => {
    timer = null;
    void flushDurableStore();
  }, WRITE_DELAY_MS);
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

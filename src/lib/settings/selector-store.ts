import type { Settings } from "./types";

export type SettingsStore = {
  get: () => Settings;
  set: (next: Settings) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createSettingsStore(initial: Settings): SettingsStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next) => {
      if (next === current) return;
      current = next;
      for (const l of Array.from(listeners)) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Object.is for primitives and arrays, one level of Object.is per key for plain objects. */
export function selectionEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!Object.hasOwn(b, k) || !Object.is(a[k], b[k])) return false;
  return true;
}

/** Snapshot reader for useSyncExternalStore: returns the previous selection while it stays selectionEqual. */
export function createSelectionReader<T>(
  store: Pick<SettingsStore, "get">,
  select: () => (s: Settings) => T,
): () => T {
  let cached: { value: T } | null = null;
  return () => {
    const next = select()(store.get());
    if (cached && selectionEqual(cached.value, next)) return cached.value;
    cached = { value: next };
    return next;
  };
}

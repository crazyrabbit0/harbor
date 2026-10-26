import { useSyncExternalStore } from "react";
import { readMusicPreference, writeMusicPreference } from "./preferences";

const KEY = "harbor.music.recents.hidden.v1";

function read(): string[] {
  try {
    const value = JSON.parse(readMusicPreference(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

// Read on first use rather than at import.
let hiddenIds: string[] | null = null;
const currentHidden = (): string[] => (hiddenIds ??= read());
const listeners = new Set<() => void>();

function commit(next: string[]): void {
  hiddenIds = next.slice(-200);
  writeMusicPreference(KEY, JSON.stringify(hiddenIds));
  listeners.forEach((listener) => listener());
}

export function hideMusicRecent(id: string): void {
  const hidden = currentHidden();
  if (!id || hidden.includes(id)) return;
  commit([...hidden, id]);
}

export function unhideMusicRecent(id: string): void {
  const hidden = currentHidden();
  if (!id || !hidden.includes(id)) return;
  commit(hidden.filter((entry) => entry !== id));
}

export function useHiddenMusicRecents(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    currentHidden,
    currentHidden,
  );
}

export function isMusicRecentHidden(id: string): boolean {
  return currentHidden().includes(id);
}

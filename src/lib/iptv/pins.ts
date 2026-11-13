import { durableSetItem } from "@/lib/durable-store";
import { useSyncExternalStore } from "react";

const KEY = "harbor.iptv.pins.v1";

let cache: string[] | null = null;
const listeners = new Set<() => void>();

function load(): string[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(next: string[]) {
  cache = next;
  try {
    durableSetItem(KEY, JSON.stringify(next));
  } catch {}
  for (const l of listeners) l();
}

export function togglePin(channelId: string): void {
  const cur = load();
  if (cur.includes(channelId)) persist(cur.filter((id) => id !== channelId));
  else persist([...cur, channelId]);
}

export function isPinned(channelId: string): boolean {
  return load().includes(channelId);
}

export function clearPins(): void {
  persist([]);
}

export function removePinsForSource(sourceId: string): void {
  if (!sourceId) return;
  const cur = load();
  const prefix = `${sourceId}::`;
  const next = cur.filter((id) => !id.startsWith(prefix));
  if (next.length !== cur.length) persist(next);
}

export function usePinnedOrder(): string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    load,
    load,
  );
}

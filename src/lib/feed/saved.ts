import { durableSetItem } from "@/lib/durable-store";
const KEY = "harbor.feed.saved";

type Entry = { id: string; savedAt: number };

function read(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: Entry[]) {
  try {
    durableSetItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function isSaved(id: string): boolean {
  return read().some((e) => e.id === id);
}

export function toggleSaved(id: string): boolean {
  const list = read();
  const i = list.findIndex((e) => e.id === id);
  if (i >= 0) {
    list.splice(i, 1);
    write(list);
    return false;
  }
  list.unshift({ id, savedAt: Date.now() });
  write(list.slice(0, 200));
  return true;
}

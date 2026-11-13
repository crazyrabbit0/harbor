import { durableSetItem } from "@/lib/durable-store";
const SNOOZE_KEY = "harbor.feed.skipped";
const BLOCK_KEY = "harbor.feed.blocked";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

type SnoozeMap = Record<string, number>;

function norm(id: string): string {
  return id.trim().toLowerCase();
}

function readSnoozeMap(): SnoozeMap {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SnoozeMap;
  } catch {
    return {};
  }
}

function writeSnoozeMap(map: SnoozeMap) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function readBlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(BLOCK_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set((parsed as string[]).map(norm));
  } catch {
    return new Set();
  }
}

function writeBlocked(set: Set<string>) {
  try {
    durableSetItem(BLOCK_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function snoozeQueueItem(id: string): void {
  if (!id) return;
  const key = norm(id);
  const map = readSnoozeMap();
  map[key] = Date.now() + SNOOZE_MS;
  writeSnoozeMap(map);
  console.info("[queue] snoozed", key, "until", new Date(map[key]).toISOString());
}

export function blockQueueItem(id: string): void {
  if (!id) return;
  const key = norm(id);
  const set = readBlocked();
  set.add(key);
  writeBlocked(set);
  console.info("[queue] blocked", key, "total", set.size);
}

export function isQueueItemHidden(id: string): boolean {
  if (!id) return false;
  const key = norm(id);
  const blocked = readBlocked();
  if (blocked.has(key)) return true;
  const map = readSnoozeMap();
  const until = map[key];
  if (typeof until !== "number") return false;
  if (until <= Date.now()) {
    delete map[key];
    writeSnoozeMap(map);
    return false;
  }
  return true;
}

export function filterQueuePool<T extends { meta: { id: string } }>(items: T[]): T[] {
  const before = items.length;
  const out = items.filter((it) => !isQueueItemHidden(it.meta.id));
  if (out.length !== before) {
    console.info(`[queue] filter removed ${before - out.length} of ${before}`);
  }
  return out;
}

export function shuffleQueuePool<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

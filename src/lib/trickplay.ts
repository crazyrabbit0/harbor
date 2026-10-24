import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";

export type TrickplayState = { active: boolean; bufferedOnly: boolean };
const IDLE: TrickplayState = { active: false, bufferedOnly: false };
let state: TrickplayState = IDLE;
const listeners = new Set<() => void>();

export function setTrickplayState(next: TrickplayState): void {
  if (state.active === next.active && state.bufferedOnly === next.bufferedOnly) return;
  state = next;
  for (const l of listeners) l();
}

export function useTrickplayState(): TrickplayState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => IDLE,
  );
}

const thumbCache = new Map<number, string>();

export function thumbCacheGet(bucket: number): string | undefined {
  return thumbCache.get(bucket);
}

export function thumbCacheSet(bucket: number, dataUri: string): void {
  thumbCache.set(bucket, dataUri);
}

export function thumbCacheNearest(bucket: number, maxDistance: number): string | undefined {
  const exact = thumbCache.get(bucket);
  if (exact) return exact;
  let best: string | undefined;
  let bestDist = Infinity;
  for (const [b, uri] of thumbCache) {
    const d = Math.abs(b - bucket);
    if (d < bestDist) {
      best = uri;
      bestDist = d;
    }
  }
  return bestDist <= maxDistance ? best : undefined;
}

export async function trickplaySetUrl(url: string): Promise<void> {
  generation++;
  thumbCache.clear();
  try {
    await invoke("thumbs_set_url", { url });
  } catch {}
}

export async function trickplaySpawnEager(): Promise<void> {
  try {
    await invoke("thumbs_spawn_eager");
  } catch {}
}

export async function trickplayGet(timeSec: number): Promise<string | null> {
  try {
    return await invoke<string | null>("thumbs_get", { timeSec });
  } catch {
    return null;
  }
}

const prefetchListeners = new Set<() => void>();
let generation = 0;

/** Renders the given times in parallel on the native side; each frame lands in the cache as soon as it is ready. */
export async function trickplayPrefetch(times: number[], bucketSec: number): Promise<void> {
  const gen = generation;
  const put = (time: number, uri: string) => {
    if (gen !== generation) return;
    thumbCache.set(Math.round(time / bucketSec), uri);
    for (const l of prefetchListeners) l();
  };
  const unlisten = await listen<{ time: number; uri: string }>("thumbs://frame", (e) =>
    put(e.payload.time, e.payload.uri),
  ).catch(() => null);
  try {
    const frames = await invoke<(string | null)[]>("thumbs_prefetch", { times });
    frames.forEach((uri, i) => uri && put(times[i], uri));
  } catch {
    return;
  } finally {
    unlisten?.();
  }
}

export function onTrickplayPrefetched(cb: () => void): () => void {
  prefetchListeners.add(cb);
  return () => prefetchListeners.delete(cb);
}

export async function trickplayStop(): Promise<void> {
  generation++;
  thumbCache.clear();
  try {
    await invoke("thumbs_stop");
  } catch {}
}

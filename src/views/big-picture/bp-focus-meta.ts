import { useEffect, useState, useSyncExternalStore } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { LibraryItem } from "@/lib/stremio";

export type BpFocusPayload = { meta: Meta; cwItem?: LibraryItem };

let current: Meta | null = null;
let currentCw: LibraryItem | null = null;
let pinned = false;
let locked = false;
const subs = new Set<(m: Meta | null) => void>();
const registry = new WeakMap<HTMLElement, BpFocusPayload>();

const busTrace: string[] = [];

function note(op: string, m: Meta | null): void {
  if (busTrace.length > 60) busTrace.shift();
  busTrace.push(`${op} ${m ? m.name : "null"} pinned=${pinned} locked=${locked}`);
}

if (typeof window !== "undefined") {
  (window as unknown as { __bpMeta?: () => unknown }).__bpMeta = () => ({
    current: current ? { id: current.id, name: current.name } : null,
    pinned,
    locked,
    trace: [...busTrace],
  });
}

function emit(m: Meta | null): void {
  for (const fn of subs) fn(m);
}

export function registerBpTarget(el: HTMLElement | null, payload: BpFocusPayload): void {
  if (el) registry.set(el, payload);
}

export function publishBpTarget(el: HTMLElement | null): void {
  if (locked || !el) return;
  const payload = registry.get(el);
  if (!payload) return;
  publishBpMeta(payload.meta, payload.cwItem ?? null);
}

export function publishBpMeta(m: Meta | null, cwItem?: LibraryItem | null): void {
  note("publish", m);
  if (locked) return;
  pinned = m !== null;
  currentCw = m ? (cwItem ?? null) : null;
  if (current?.id === m?.id) return;
  current = m;
  emit(m);
}

export function seedBpMeta(m: Meta | null, cwItem?: LibraryItem | null): void {
  note("seed", m);
  if (pinned || !m || current?.id === m.id) return;
  currentCw = cwItem ?? null;
  current = m;
  emit(m);
}

// A detail page owns its backdrop. Without this, focusing a recommendation
// card republishes that meta and the hero swaps to the wrong title.
export function lockBpMeta(m: Meta | null): void {
  locked = false;
  publishBpMeta(m);
  locked = m !== null;
}

export function forceBpMeta(m: Meta | null): void {
  locked = false;
  publishBpMeta(m);
}

export function unlockBpMeta(): void {
  locked = false;
}

export function unpinBpMeta(): void {
  note("unpin", null);
  locked = false;
  pinned = false;
}

export function readBpMeta(): Meta | null {
  return current;
}

export function readBpCwItem(): LibraryItem | null {
  return currentCw && currentCw._id === current?.id ? currentCw : null;
}

function subscribeImmediate(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function useBpFocusedMeta(settleMs = 0): Meta | null {
  const live = useSyncExternalStore(subscribeImmediate, readBpMeta);
  const [settled, setSettled] = useState<{ ms: number; meta: Meta | null }>({
    ms: settleMs,
    meta: live,
  });

  useEffect(() => {
    if (settleMs <= 0) return;
    const timer = window.setTimeout(() => setSettled({ ms: settleMs, meta: live }), settleMs);
    return () => window.clearTimeout(timer);
  }, [live, settleMs]);

  return settleMs <= 0 ? live : settled.ms === settleMs ? settled.meta : live;
}

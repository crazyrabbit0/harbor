import { useEffect, useState } from "react";

type Ticker = { subs: Set<(now: number) => void>; timer: number | null };

const tickers = new Map<number, Ticker>();
let visibilityBound = false;

function pageHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

function emit(ticker: Ticker): void {
  const now = Date.now();
  for (const fn of ticker.subs) fn(now);
}

function stop(ticker: Ticker): void {
  if (ticker.timer !== null) window.clearTimeout(ticker.timer);
  ticker.timer = null;
}

// Fires on wall-clock multiples of the interval so every subscriber flips its label at the same moment.
function start(intervalMs: number, ticker: Ticker): void {
  stop(ticker);
  if (pageHidden() || ticker.subs.size === 0) return;
  const schedule = () => {
    const delay = intervalMs - (Date.now() % intervalMs) || intervalMs;
    ticker.timer = window.setTimeout(() => {
      emit(ticker);
      schedule();
    }, delay);
  };
  schedule();
}

function onVisibilityChange(): void {
  for (const [intervalMs, ticker] of tickers) {
    if (pageHidden()) stop(ticker);
    else {
      emit(ticker);
      start(intervalMs, ticker);
    }
  }
}

function subscribeNow(intervalMs: number, fn: (now: number) => void): () => void {
  if (!visibilityBound && typeof document !== "undefined") {
    visibilityBound = true;
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  let ticker = tickers.get(intervalMs);
  if (!ticker) {
    ticker = { subs: new Set(), timer: null };
    tickers.set(intervalMs, ticker);
  }
  ticker.subs.add(fn);
  if (ticker.timer === null) start(intervalMs, ticker);
  const own = ticker;
  return () => {
    own.subs.delete(fn);
    if (own.subs.size > 0) return;
    stop(own);
    tickers.delete(intervalMs);
  };
}

// Shares one timer per interval across components and pauses while the window is hidden.
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    return subscribeNow(intervalMs, setNow);
  }, [intervalMs, active]);
  return now;
}

export function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

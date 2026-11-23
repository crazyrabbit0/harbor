import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const BP_META_SETTLE_MS = 200;
export const BP_COPY_CEILING_MS = 900;
export const BP_COPY_OUT_MS = 180;
export const BP_COPY_IN_MS = 300;
export const BP_COPY_IN_DELAY_MS = 140;

// translate, not transform: Tailwind v4 compiles translate-y-* to the CSS
// translate property, so a transition list naming transform never animated the
// rise and the copy jumped 10px while only the opacity crossfaded.
// Reduced motion means the travel is replaced by a cross-fade, not that the
// cross-fade is removed: the fade itself is held at 320ms by [data-bp-xfade].
export const BP_COPY_OUT =
  "translate-y-[10px] opacity-0 transition-[opacity,translate] duration-[180ms] ease-[var(--bp-ease-in)] motion-reduce:translate-y-0";
export const BP_COPY_IN =
  "translate-y-0 opacity-100 transition-[opacity,translate] duration-[300ms] delay-[140ms] ease-[var(--bp-ease)]";

// The last backdrop to finish committing. The copy gate below no longer waits
// on it, which is the whole point of that change, but subscribers still exist
// and a late joiner needs to be able to ask.
let committed = "";
const subs = new Set<(key: string) => void>();

export function bpBackdropCommitted(): string {
  return committed;
}

export function publishBpBackdropCommit(key: string): void {
  committed = key;
  for (const fn of subs) fn(key);
}

export function useBpCopyGate<T>(value: T, key: string): { shown: T | null; on: boolean } {
  const [settled, setSettled] = useState<{ key: string; value: T } | null>(() =>
    key ? { key, value } : null,
  );
  const live = useRef(value);
  useLayoutEffect(() => {
    live.current = value;
  }, [value]);

  if (key && settled === null) {
    setSettled({ key, value });
  }

  const settledKey = settled?.key ?? "";
  useEffect(() => {
    if (!key || settledKey === key || !settledKey) return;
    const outTimer = window.setTimeout(() => {
      setSettled({ key, value: live.current });
    }, BP_COPY_OUT_MS);
    return () => window.clearTimeout(outTimer);
  }, [key, settledKey]);

  const immediate = Boolean(key) && (settled === null || settled.key === key);
  return {
    shown: immediate ? value : (settled?.value ?? null),
    on: immediate,
  };
}

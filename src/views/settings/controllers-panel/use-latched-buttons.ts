import { useEffect, useMemo, useRef, useState } from "react";
import type { GpButton } from "@/lib/gamepad/protocol";

type Buttons = Partial<Record<GpButton, boolean>>;

export function useLatchedButtons(live: Buttons, floorMs: number): Buttons {
  const [prevLive, setPrevLive] = useState<Buttons>(live);
  const [latched, setLatched] = useState<Buttons>(() => ({ ...live }));
  const prevEffectLive = useRef<Buttons>({});
  const timers = useRef<Partial<Record<GpButton, number>>>({});

  if (prevLive !== live) {
    setPrevLive(live);
    const updates: Buttons = {};
    let changed = false;
    for (const k of Object.keys(live) as GpButton[]) {
      if (live[k] && !latched[k]) {
        updates[k] = true;
        changed = true;
      }
    }
    if (changed) {
      setLatched((prev) => ({ ...prev, ...updates }));
    }
  }

  useEffect(() => {
    const prev = prevEffectLive.current;
    prevEffectLive.current = live;
    for (const k of Object.keys(live) as GpButton[]) {
      if (live[k] && !prev[k]) {
        const pending = timers.current[k];
        if (pending !== undefined) window.clearTimeout(pending);
        timers.current[k] = window.setTimeout(() => {
          delete timers.current[k];
          setLatched((cur) => (cur[k] ? { ...cur, [k]: false } : cur));
        }, floorMs);
      }
    }
  }, [live, floorMs]);

  useEffect(
    () => () => {
      prevEffectLive.current = {};
      for (const id of Object.values(timers.current)) {
        if (id !== undefined) window.clearTimeout(id);
      }
      timers.current = {};
    },
    [],
  );

  return useMemo(() => {
    const out: Buttons = { ...latched };
    for (const k of Object.keys(live) as GpButton[]) {
      if (live[k]) out[k] = true;
    }
    return out;
  }, [latched, live]);
}

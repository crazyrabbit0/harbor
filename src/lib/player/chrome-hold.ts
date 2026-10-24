import { useEffect } from "react";

// Keeps the player controls on screen while a popover that isn't wired through the renderer's menu setters is open.
let holds = 0;
const listeners = new Set<() => void>();

export function isPlayerChromeHeld(): boolean {
  return holds > 0;
}

export function subscribePlayerChromeHold(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePlayerChromeHold(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    holds += 1;
    for (const l of listeners) l();
    return () => {
      holds -= 1;
      for (const l of listeners) l();
    };
  }, [active]);
}

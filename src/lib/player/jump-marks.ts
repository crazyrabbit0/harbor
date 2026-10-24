import { useSyncExternalStore } from "react";

// The seek bar's ten 0-9 jump marks: pinned while the 0-9 button is hovered, or flashed briefly by a jump key.
type State = { pinned: boolean; flashing: boolean };
let state: State = { pinned: false, flashing: false };
let timer: number | null = null;
const listeners = new Set<() => void>();

function emit(next: State) {
  if (next.pinned === state.pinned && next.flashing === state.flashing) return;
  state = next;
  for (const l of listeners) l();
}

export const JUMP_FRAME_BUCKET_SEC = 2;

/** The ten 0-9 jump times for a duration, in seconds. */
export function jumpTargets(durationSec: number): number[] {
  return Array.from({ length: 10 }, (_, d) => (durationSec * d) / 10);
}

export function setJumpMarksPinned(pinned: boolean): void {
  emit({ ...state, pinned });
}

export function flashJumpMarks(ms = 1600): void {
  if (timer != null) window.clearTimeout(timer);
  emit({ ...state, flashing: true });
  timer = window.setTimeout(() => {
    timer = null;
    emit({ ...state, flashing: false });
  }, ms);
}

export function getJumpMarks(): State {
  return state;
}

export function subscribeJumpMarks(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useJumpMarksVisible(): boolean {
  return useSyncExternalStore(
    subscribeJumpMarks,
    () => state.pinned || state.flashing,
    () => false,
  );
}

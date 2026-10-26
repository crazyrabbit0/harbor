export const FAST_POLL_MS = 1000;
export const SLOW_POLL_MS = 3000;
export const FAST_WINDOW_MS = 10_000;

function pageHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

/** Runs `tick` now, every 1 s for 10 s, then every 3 s; paused while hidden. Returns a stop function. */
export function startStatsPoll(tick: () => unknown): () => void {
  const startAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const schedule = () => {
    clearTimeout(timer);
    timer = undefined;
    if (stopped || pageHidden()) return;
    const delay = Date.now() - startAt < FAST_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS;
    timer = setTimeout(run, delay);
  };
  const run = () => {
    if (stopped) return;
    void tick();
    schedule();
  };
  const onVisibility = () => {
    if (pageHidden()) schedule();
    else run();
  };

  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  run();
  return () => {
    stopped = true;
    clearTimeout(timer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

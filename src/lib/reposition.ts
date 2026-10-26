// Runs fn at most once per frame after any scroll (capture, passive) or resize; returns the cleanup.
export function trackReposition(fn: () => void, accept?: (event: Event) => boolean): () => void {
  let frame = 0;
  const run = () => {
    frame = 0;
    fn();
  };
  const schedule = (event: Event) => {
    if (frame || (accept && !accept(event))) return;
    frame = requestAnimationFrame(run);
  };
  window.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.addEventListener("resize", schedule);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
  };
}

export const SEEK_STEP_OPTIONS = [1, 3, 5, 10, 15, 30, 60, 90] as const;
export const CLIP_LENGTH_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120] as const;

export type SeekStepSeconds = (typeof SEEK_STEP_OPTIONS)[number];

export function isSeekStepSeconds(value: unknown): value is SeekStepSeconds {
  return typeof value === "number" && SEEK_STEP_OPTIONS.includes(value as SeekStepSeconds);
}

export function sanitizeSeekStep(value: unknown, fallback: number): number {
  return isSeekStepSeconds(value) ? value : fallback;
}

export function sanitizeClipLength(value: unknown, fallback: number): number {
  const opts: readonly number[] = CLIP_LENGTH_OPTIONS;
  return typeof value === "number" && opts.includes(value) ? value : fallback;
}

/** The next allowed value up or down from `value`, clamped to the option list. */
export function nudgeStep(
  value: number,
  dir: 1 | -1,
  opts: readonly number[] = SEEK_STEP_OPTIONS,
): number {
  const idx = opts.indexOf(value);
  if (idx >= 0) return opts[Math.min(opts.length - 1, Math.max(0, idx + dir))];
  const next = dir > 0 ? opts.find((o) => o > value) : [...opts].reverse().find((o) => o < value);
  return next ?? (dir > 0 ? opts[opts.length - 1] : opts[0]);
}

type SeekStepSettings = {
  seekBackStepSec?: unknown;
  seekForwardStepSec?: unknown;
};

/** The normal seek step for each direction, from settings, falling back to 10 seconds. */
export function seekSteps(settings: SeekStepSettings): { back: number; forward: number } {
  return {
    back: sanitizeSeekStep(settings.seekBackStepSec, 10),
    forward: sanitizeSeekStep(settings.seekForwardStepSec, 10),
  };
}

/** Seek steps for windows without a settings provider, read from the settings mirror. */
export function storedSeekSteps(): { back: number; forward: number } {
  try {
    return seekSteps(
      JSON.parse(localStorage.getItem("harbor.settings") ?? "{}") as SeekStepSettings,
    );
  } catch {
    return seekSteps({});
  }
}

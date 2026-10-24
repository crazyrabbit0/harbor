import type { LottiePlayer } from "lottie-web";

// lottie-web is ~600 KB and only drives decorative animations, so it loads on first use instead of with the app.
let mod: Promise<LottiePlayer> | null = null;
let ready: LottiePlayer | null = null;

export function loadLottie(): Promise<LottiePlayer> {
  mod ??= import("lottie-web").then((m) => (ready = m.default));
  return mod;
}

/** Runs `start` once lottie is loaded unless `cancelled` says the caller unmounted first. */
export function withLottie(start: (lottie: LottiePlayer) => void, cancelled: () => boolean): void {
  if (ready) {
    start(ready);
    return;
  }
  void loadLottie().then((l) => {
    if (!cancelled()) start(l);
  });
}

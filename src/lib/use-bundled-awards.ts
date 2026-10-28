import { useEffect, useSyncExternalStore } from "react";
import {
  bundledAwardsVersion,
  ensureBundledAwardsIdle,
  subscribeBundledAwards,
} from "./awards-history";

/** Re-renders when the bundled award table arrives; the first enabled caller requests it. */
const NEVER = () => () => {};

export function useBundledAwardsVersion(enabled = true): number {
  useEffect(() => {
    if (enabled) ensureBundledAwardsIdle();
  }, [enabled]);
  return useSyncExternalStore(
    enabled ? subscribeBundledAwards : NEVER,
    bundledAwardsVersion,
    bundledAwardsVersion,
  );
}

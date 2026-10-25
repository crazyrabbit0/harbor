import { useSyncExternalStore } from "react";
import { bundledAwardsVersion, subscribeBundledAwards } from "./awards-history";

/** Re-renders when the bundled award table, fetched after the first paint, arrives. */
const NEVER = () => () => {};

export function useBundledAwardsVersion(enabled = true): number {
  return useSyncExternalStore(
    enabled ? subscribeBundledAwards : NEVER,
    bundledAwardsVersion,
    bundledAwardsVersion,
  );
}

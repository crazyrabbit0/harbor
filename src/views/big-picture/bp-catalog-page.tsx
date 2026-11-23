import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { BpRail, type BpRailEntry } from "./bp-rail";
import { useBpRail } from "./use-bp-rail";
import { useBpLayoutReflow } from "./use-bp-row-layout";

export type BpPagePhase = "nav" | "hero" | "row";

export type BpHeroState = { phase: BpPagePhase; activeRow: number };

function bpRootAboveThePage(page: HTMLElement): HTMLElement {
  return page.closest<HTMLElement>("[data-bp-root]") ?? page;
}

function bpPhaseOf(target: Element | null): BpPagePhase | null {
  if (!target || target === document.body) return null;
  if (target.closest("[data-bp-dialog]")) return null;
  if (target.closest("[data-bp-top-bar]")) return "nav";
  if (target.closest("[data-bp-hero]")) return "hero";
  return "row";
}

function createPhaseStore() {
  let value: BpPagePhase =
    bpPhaseOf(typeof document !== "undefined" ? document.activeElement : null) ?? "hero";
  return {
    get: () => {
      const next = bpPhaseOf(typeof document !== "undefined" ? document.activeElement : null);
      if (next) value = next;
      return value;
    },
    set: (next: BpPagePhase | null) => {
      if (!next || next === value) return false;
      value = next;
      return true;
    },
  };
}

export function useBpPagePhase(ref: RefObject<HTMLElement | null>): BpPagePhase {
  const [store] = useState(createPhaseStore);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const page = ref.current;
      if (!page) return () => {};
      const host = bpRootAboveThePage(page);
      const onFocus = (e: FocusEvent) => {
        if (store.set(bpPhaseOf(e.target instanceof HTMLElement ? e.target : null))) {
          onStoreChange();
        }
      };
      host.addEventListener("focusin", onFocus);
      return () => host.removeEventListener("focusin", onFocus);
    },
    [ref, store],
  );
  return useSyncExternalStore(subscribe, store.get);
}

export function BpCatalogPage({
  routeKey,
  signature,
  entries,
  hero,
  skeleton,
}: {
  routeKey: string;
  signature: string;
  entries: readonly BpRailEntry[];
  hero: (state: BpHeroState) => ReactNode;
  skeleton?: ReactNode;
}) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const phase = useBpPagePhase(pageRef);
  const { railRef, activeRow, railShift } = useBpRail(signature);
  useBpLayoutReflow({ railRef, signature, routeKey });

  return (
    <div ref={pageRef} className="relative flex h-full flex-col">
      <div data-bp-hero className="relative z-20 shrink-0">
        {hero({ phase, activeRow })}
      </div>
      {skeleton && entries.length === 0 ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">{skeleton}</div>
      ) : (
        <BpRail railRef={railRef} entries={entries} activeRow={activeRow} railShift={railShift} />
      )}
    </div>
  );
}

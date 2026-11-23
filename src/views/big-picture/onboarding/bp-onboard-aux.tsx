import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const NOOP_SUBSCRIBE = () => () => {};
const readAuxHost = () =>
  typeof document === "undefined"
    ? null
    : document.querySelector<HTMLElement>("[data-bp-onboard-aux]");

export function BpOnboardAux({ children }: { children: ReactNode }) {
  const host = useSyncExternalStore(NOOP_SUBSCRIBE, readAuxHost);
  if (!host) return null;
  return createPortal(children, host);
}

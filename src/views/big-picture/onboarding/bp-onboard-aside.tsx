import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const NOOP_SUBSCRIBE = () => () => {};
const readAsideHost = () =>
  typeof document === "undefined"
    ? null
    : document.querySelector<HTMLElement>("[data-bp-onboard-aside]");

export function BpOnboardAside({ children }: { children: ReactNode }) {
  const host = useSyncExternalStore(NOOP_SUBSCRIBE, readAsideHost);
  if (!host) return null;

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none mt-auto flex w-full max-w-full flex-col gap-[clamp(12px,1.7vh,26px)] pb-[clamp(20px,3vh,50px)] [animation:bp-rise_var(--bp-dur-slow)_var(--bp-ease)_both] motion-reduce:[animation:none]"
    >
      {children}
    </div>,
    host,
  );
}

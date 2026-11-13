import { useState, type ReactNode } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export function PopIcon({
  active,
  activeIcon,
  inactiveIcon,
}: {
  active: boolean;
  activeIcon: ReactNode;
  inactiveIcon: ReactNode;
}) {
  const [pop, setPop] = useState(0);
  const [activeSeen, setActiveSeen] = useState(active);
  if (activeSeen !== active) {
    setActiveSeen(active);
    if (active && !prefersReducedMotion()) setPop(pop + 1);
  }
  return (
    <span
      key={active ? `on-${pop}` : "off"}
      className={active && pop > 0 ? "harbor-pop inline-flex" : "inline-flex"}
    >
      {active ? activeIcon : inactiveIcon}
    </span>
  );
}

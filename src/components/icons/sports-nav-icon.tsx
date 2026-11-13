import { useState } from "react";
import { useSettingsSelector } from "@/lib/settings";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import basketball from "@/assets/lottie/nav/sports/basketball.svg";
import "./sports-nav-icon.css";

export function SportsNavIcon({
  active = false,
  hovered = false,
}: {
  active?: boolean;
  hovered?: boolean;
}) {
  const settings = useSettingsSelector((s) => ({ navIconAnimations: s.navIconAnimations }));
  const reducedMotion = useReducedMotion();
  const animate = settings.navIconAnimations && !reducedMotion;
  const [bouncing, setBouncing] = useState(animate && hovered);
  const [seen, setSeen] = useState({ animate, hovered });
  if (seen.animate !== animate || seen.hovered !== hovered) {
    setSeen({ animate, hovered });
    if (!animate) setBouncing(false);
    else if (hovered) setBouncing(true);
    // Finish the landing on pointer leave instead of snapping back mid-flight.
  }
  return (
    <span aria-hidden="true" className="sports-nav-ball" style={{ opacity: active ? 1 : 0.8 }}>
      <span
        className={
          bouncing && settings.navIconAnimations && !reducedMotion
            ? "sports-nav-ball-art is-bouncing"
            : "sports-nav-ball-art"
        }
        onAnimationEnd={(event) => {
          if (event.animationName === "sports-nav-bounce") setBouncing(false);
        }}
        style={{ maskImage: `url(${basketball})` }}
      />
    </span>
  );
}

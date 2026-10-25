import type { CSSProperties } from "react";

const DEFAULT_FACTOR = 4;

// Blurs a 1/factor-sized copy with radius/factor and scales it back up: the same look for ~factor² less filter work.
export function ScaledBlur({
  image,
  blur,
  extraFilter = "",
  factor = DEFAULT_FACTOR,
  style,
}: {
  image: string;
  blur: number;
  extraFilter?: string;
  factor?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: `${100 / factor}%`,
        height: `${100 / factor}%`,
        transform: `scale(${factor})`,
        transformOrigin: "0 0",
        backgroundImage: `url(${image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: `blur(${blur / factor}px)${extraFilter ? ` ${extraFilter}` : ""}`,
        willChange: "transform",
        ...style,
      }}
    />
  );
}

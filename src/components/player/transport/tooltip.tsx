import { useRef, useState } from "react";

const GAP = 6;
const EDGE = 8;

export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
  hidden = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "end";
  hidden?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ side: "top" | "bottom"; shift: number }>({ side, shift: 0 });

  // The tip is laid out while invisible, so it can be measured before it fades in and kept on screen.
  const place = () => {
    const wrap = wrapRef.current?.getBoundingClientRect();
    const tip = tipRef.current?.getBoundingClientRect();
    if (!wrap || !tip) return;
    const fitsAbove = wrap.top - GAP - tip.height >= EDGE;
    const fitsBelow = wrap.bottom + GAP + tip.height <= window.innerHeight - EDGE;
    const nextSide =
      side === "top"
        ? fitsAbove || !fitsBelow
          ? "top"
          : "bottom"
        : fitsBelow || !fitsAbove
          ? "bottom"
          : "top";
    const naturalLeft = tip.left - fit.shift;
    const naturalRight = naturalLeft + tip.width;
    let shift = 0;
    if (naturalLeft < EDGE) shift = EDGE - naturalLeft;
    else if (naturalRight > window.innerWidth - EDGE)
      shift = window.innerWidth - EDGE - naturalRight;
    if (nextSide !== fit.side || shift !== fit.shift) setFit({ side: nextSide, shift });
  };

  return (
    <div ref={wrapRef} className="group/tip relative inline-flex" onPointerEnter={place}>
      {children}
      <div
        ref={tipRef}
        role="tooltip"
        style={{
          transform:
            align === "end"
              ? `translateX(${fit.shift}px)`
              : `translateX(calc(-50% + ${fit.shift}px))`,
        }}
        className={`pointer-events-none absolute z-30 w-max max-w-[280px] rounded-md border border-white/10 bg-black/85 whitespace-pre-line px-2 py-1 text-[11.5px] font-medium leading-snug text-white/90 opacity-0 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.8)] backdrop-blur-md transition-opacity delay-0 duration-100 ${
          hidden ? "invisible" : "group-hover/tip:opacity-100 group-hover/tip:delay-500"
        } ${fit.side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"} ${
          align === "end" ? "end-0" : "left-1/2"
        }`}
      >
        {label}
      </div>
    </div>
  );
}

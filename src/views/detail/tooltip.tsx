import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trackReposition } from "@/lib/reposition";

type Side = "top" | "bottom" | "left" | "right";

export function Tooltip({
  label,
  children,
  delay = 420,
  side = "top",
}: {
  label: string;
  children: React.ReactNode;
  delay?: number;
  side?: Side;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<number | null>(null);

  const show = () => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setVisible(false);
    setCoords(null);
  };

  useEffect(
    () => () => {
      if (timer.current != null) clearTimeout(timer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!visible) return;
    const update = () => {
      const trigger = triggerRef.current;
      const tip = tipRef.current;
      if (!trigger || !tip) return;
      const t = trigger.getBoundingClientRect();
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const gap = 10;
      let left = 0;
      let top = 0;
      if (side === "top") {
        left = t.left + t.width / 2 - w / 2;
        top = t.top - h - gap;
      } else if (side === "bottom") {
        left = t.left + t.width / 2 - w / 2;
        top = t.bottom + gap;
      } else if (side === "left") {
        left = t.left - w - gap;
        top = t.top + t.height / 2 - h / 2;
      } else {
        left = t.right + gap;
        top = t.top + t.height / 2 - h / 2;
      }
      const pad = 8;
      left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
      top = Math.max(pad, Math.min(window.innerHeight - h - pad, top));
      setCoords({ left, top });
    };
    update();
    return trackReposition(update);
  }, [visible, side, label]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onPointerDown={hide}
    >
      {children}
      {visible &&
        createPortal(
          <span
            ref={tipRef}
            aria-hidden
            className="pointer-events-none fixed z-[9999] max-w-[280px] rounded-lg bg-canvas/95 px-3 py-2 text-[12px] font-medium leading-snug text-ink shadow-[0_8px_24px_rgba(0,0,0,0.55)] backdrop-blur-md ring-1 ring-edge-soft/40"
            style={{
              left: coords?.left ?? -9999,
              top: coords?.top ?? -9999,
              opacity: coords ? 1 : 0,
              transition: "opacity 150ms",
              whiteSpace: label.length > 28 ? "normal" : "nowrap",
            }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}

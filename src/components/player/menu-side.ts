import { useState, type RefObject } from "react";

export function useMenuSide(ref: RefObject<HTMLElement | null>, width: number) {
  const [side, setSide] = useState<"start" | "end">("end");
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 32);
    setSide(r.right - w < 16 ? "start" : "end");
  };
  return { side, measure };
}

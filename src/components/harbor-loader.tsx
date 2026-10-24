import type { AnimationItem } from "lottie-web";
import { withLottie } from "@/lib/lottie";
import { useCallback, useEffect, useRef, useState } from "react";
import whiteBoat from "@/assets/lottie/addons-boat-white.json";
import darkBoat from "@/assets/lottie/addons-boat-dark.json";
import harborBoat from "@/assets/lottie/harbor-loader.json";
import { CustomArtwork } from "./custom-artwork";
import {
  prefetchTopAddonLogos,
  prefetchedTopAddonLogos,
} from "@/lib/providers/addon-logo-prefetch";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<Size, string> = {
  xs: "h-7 w-7",
  sm: "h-20 w-20",
  md: "h-32 w-32",
  lg: "h-44 w-44",
  xl: "h-60 w-60",
};

const XLINK = "http://www.w3.org/1999/xlink";

function darkBackground(): boolean {
  if (typeof document === "undefined") return true;
  const probe = document.createElement("div");
  probe.style.cssText =
    "background-color:var(--color-canvas);position:absolute;opacity:0;pointer-events:none";
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).backgroundColor.match(/[\d.]+/g);
  probe.remove();
  if (!m || m.length < 3) return true;
  const [r, g, b] = m.map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function useTopAddonLogos(enabled: boolean): string[] {
  const [logos, setLogos] = useState<string[]>(() => (enabled ? prefetchedTopAddonLogos() : []));
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    prefetchTopAddonLogos().then((urls) => {
      if (!cancelled) setLogos(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return logos;
}

export function HarborLoader({
  size = "md",
  caption,
  className = "",
  keyed = false,
  logos,
  original = false,
}: {
  size?: Size;
  caption?: string;
  className?: string;
  keyed?: boolean;
  logos?: string[];
  original?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      {original ? (
        <Boat size={size} keyed={keyed} logos={logos} />
      ) : (
        <CustomArtwork
          role="loading"
          className={`harbor-loader-art ${SIZE_CLASS[size]}`}
          fallback={<Boat size={size} keyed={keyed} logos={logos} />}
        />
      )}
      {caption && (
        <p className="harbor-loader-cap mt-1 text-[12.5px] font-medium uppercase tracking-[0.18em] text-white/70">
          {caption}
        </p>
      )}
    </div>
  );
}

function Boat({ size, keyed, logos }: { size: Size; keyed: boolean; logos?: string[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cargo = keyed || logos !== undefined;
  const fetched = useTopAddonLogos(keyed && logos === undefined);
  const effective = logos ?? fetched;
  const logosRef = useRef<string[]>([]);
  logosRef.current = effective;
  const cycleRef = useRef(0);
  const [dark] = useState(darkBackground);

  const paint = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    const imgs = root.querySelectorAll<SVGImageElement>("image");
    const list = logosRef.current;
    const count = imgs.length;
    imgs.forEach((img, k) => {
      img.setAttribute("preserveAspectRatio", "xMidYMid meet");
      img.setAttribute("referrerpolicy", "no-referrer");
      const flyPos = count - 1 - k;
      const url = flyPos < list.length ? list[(cycleRef.current + flyPos) % list.length] : "";
      if (url) {
        img.setAttributeNS(XLINK, "href", url);
        img.setAttribute("href", url);
        img.style.opacity = "1";
      } else {
        img.style.opacity = "0";
      }
    });
  }, []);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let anim: AnimationItem | null = null;
    let cancelled = false;
    const onLoaded = () => {
      cycleRef.current = 0;
      paint();
    };
    const onLoop = () => {
      cycleRef.current += 3;
      paint();
    };
    withLottie(
      (lottie) => {
        anim = lottie.loadAnimation({
          container: host,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: cargo ? (dark ? whiteBoat : darkBoat) : harborBoat,
        });
        anim.addEventListener("DOMLoaded", onLoaded);
        anim.addEventListener("loopComplete", onLoop);
      },
      () => cancelled,
    );
    return () => {
      cancelled = true;
      anim?.removeEventListener("DOMLoaded", onLoaded);
      anim?.removeEventListener("loopComplete", onLoop);
      anim?.destroy();
    };
  }, [dark, paint, cargo]);

  useEffect(() => {
    paint();
  }, [effective, paint]);

  return <div ref={ref} className={`harbor-loader-art ${SIZE_CLASS[size]}`} aria-hidden />;
}

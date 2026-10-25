import { useMemo } from "react";

const ORBS = 7;
const STOPS = 10;
const SPREAD = 3;

type Orb = {
  x: number;
  y: number;
  box: number;
  gradient: string;
  opacity: number;
  delay: number;
  duration: number;
};

const PALETTE = [
  "rgba(124,214,255,0.55)",
  "rgba(174,140,255,0.45)",
  "rgba(94,165,247,0.50)",
  "rgba(255,180,220,0.35)",
  "rgba(110,255,210,0.35)",
];

function seeded(i: number): number {
  const s = Math.sin(i * 99.83) * 43758.5453;
  return s - Math.floor(s);
}

// 2D Gaussian blur (as CSS blur(sigma)) of a linear radial falloff (1 at r=0, 0 at r=fade), sampled at radius r.
function blurredFalloff(r: number, fade: number, sigma: number): number {
  const steps = 24;
  const span = SPREAD * sigma;
  const cell = (2 * span) / steps;
  let sum = 0;
  let weight = 0;
  for (let i = 0; i <= steps; i++) {
    const dx = -span + i * cell;
    for (let j = 0; j <= steps; j++) {
      const dy = -span + j * cell;
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      sum += w * Math.max(0, 1 - Math.hypot(r + dx, dy) / fade);
      weight += w;
    }
  }
  return sum / weight;
}

// Bakes the blur into gradient stops, so the animated orb repaints nothing and only composites.
function orbGradient(color: string, fade: number, sigma: number): string {
  const [r, g, b, a] = color.match(/[\d.]+/g)!.map(Number);
  const reach = fade + SPREAD * sigma;
  const stops = Array.from({ length: STOPS + 1 }, (_, i) => {
    const at = (reach * i) / STOPS;
    const alpha = i === STOPS ? 0 : a * blurredFalloff(at, fade, sigma);
    return `rgba(${r},${g},${b},${alpha.toFixed(4)}) ${at.toFixed(1)}px`;
  });
  return `radial-gradient(circle ${reach.toFixed(1)}px, ${stops.join(", ")})`;
}

export function AuroraBokeh() {
  const orbs = useMemo<Orb[]>(() => {
    return Array.from({ length: ORBS }, (_, i) => {
      const r1 = seeded(i * 3 + 1);
      const r2 = seeded(i * 3 + 2);
      const r3 = seeded(i * 3 + 3);
      const size = 180 + r1 * 220;
      const blur = 24 + r3 * 28;
      // A plain "circle" gradient reaches the box corner, so 65% of it is 0.65 * size / sqrt(2).
      const fade = (0.65 * size) / Math.SQRT2;
      return {
        x: r1 * 100,
        y: r2 * 100,
        box: 2 * (fade + SPREAD * blur),
        gradient: orbGradient(PALETTE[i % PALETTE.length], fade, blur),
        opacity: 0.4 + r2 * 0.35,
        delay: -r1 * 30,
        duration: 28 + r3 * 24,
      };
    });
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {orbs.map((o, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${o.x}%`,
            top: `${o.y}%`,
            width: `${o.box}px`,
            height: `${o.box}px`,
            background: o.gradient,
            opacity: o.opacity,
            transform: "translate(-50%, -50%)",
            animation: `aurora-orb ${o.duration}s ease-in-out ${o.delay}s infinite alternate`,
            willChange: "transform",
          }}
        />
      ))}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 35% at 50% 110%, rgba(255,255,255,0.05), transparent 70%)",
        }}
      />
      <style>{`
        @keyframes aurora-orb {
          0% { transform: translate(-50%, -50%) translateY(0px) scale(1); }
          50% { transform: translate(-50%, -50%) translateY(-40px) scale(1.1); }
          100% { transform: translate(-50%, -50%) translateY(20px) scale(0.95); }
        }
      `}</style>
    </div>
  );
}

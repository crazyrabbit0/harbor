// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { hookHarness } from "./helpers/hook-harness.ts";

function pill() {
  let next = 0;
  const intervals = new Map<number, () => void>();
  let created = 0;
  const win = {
    setInterval: (fn: () => void) => {
      created++;
      intervals.set(++next, fn);
      return next;
    },
    clearInterval: (id: number) => intervals.delete(id),
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  };
  const stub = () => null;
  const h = hookHarness(
    "src/components/player/skip-pill.tsx",
    "SkipPill",
    {
      "lucide-react": { ChevronsRight: stub, FastForward: stub, Undo2: stub, X: stub },
      "react/jsx-runtime": { jsx: () => null, jsxs: () => null, Fragment: stub },
      "@/components/icons/play-filled": { Play: stub },
      "@/components/icons/adskip-icon": { AdSkipIcon: stub },
      "@/lib/providers/kitsu": { parseKitsuId: () => null },
      "@/lib/streams/anime-identity-core": { splitFranchiseDisplaySeason: () => null },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/components/ThreeLiquidGlassSurface": { ThreeLiquidGlassSurface: stub },
    },
    { window: win },
  );
  return { h, intervals, created: () => created };
}

test("the skip countdown runs one interval for its whole run and dismisses at zero", () => {
  const { h, intervals, created } = pill();
  let dismissed = 0;
  const props = {
    segment: { kind: "intro", startSec: 10, endSec: 90 },
    visible: true,
    countdownSec: 1,
    onSkip: () => {},
    onDismiss: () => dismissed++,
    engine: "mpv",
  };
  h.render(props);
  h.render(props);
  for (let i = 0; i < 30 && intervals.size; i++) {
    for (const fn of Array.from(intervals.values())) fn();
    h.render(props);
  }
  assert.equal(dismissed, 1);
  assert.equal(created(), 1, "a 50 ms step must not recreate the interval");
  assert.equal(intervals.size, 0);
});

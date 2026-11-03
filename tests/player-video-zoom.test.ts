// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const hotkeys = read("src/views/player/hooks/use-player-hotkeys.ts");

type Fill = { step: (delta: number) => void; cycle: () => void };

// Runs useVideoFill once with plain refs and no effects; the zoom state lives in its refs.
function videoFill() {
  const zooms: number[] = [];
  const flashes: Array<{ icon: string; value: string }> = [];
  const exports: { useVideoFill?: (...args: unknown[]) => Fill; ZOOM_STEP?: number } = {};
  const compiled = ts.transpileModule(read("src/views/player/hooks/use-video-fill.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks: Record<string, unknown> = {
    react: { useRef: (current: unknown) => ({ current }), useEffect() {} },
    "@/lib/i18n": { t: (s: string) => s },
    "@/lib/settings": {
      useSettingsSelector: (select: (s: unknown) => unknown) => select({ cropMode: "fit" }),
      useSettingsUpdate: () => () => {},
    },
  };
  new Function("require", "exports", compiled)((name: string) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
    return mocks[name];
  }, exports);
  const bridge = {
    setPanscan() {},
    setAspectOverride() {},
    setStretch() {},
    setVideoZoom: (log2: number) => zooms.push(log2),
  };
  const flash = (f: { icon: string; value: string }) => flashes.push(f);
  const fill = exports.useVideoFill!({ current: bridge }, "src", false, flash);
  return { fill, zooms, flashes, step: exports.ZOOM_STEP! };
}

test("zoom can go below 1x, not only above it", () => {
  const { fill, zooms, step } = videoFill();
  for (let i = 0; i < 200; i += 1) fill.step(-step);
  const min = zooms.at(-1)!;
  assert.ok(min < 0, `zoom bottoms out at ${min}`);
  for (let i = 0; i < 400; i += 1) fill.step(step);
  assert.ok(zooms.at(-1)! > 0);
});

test("one step moves the picture by a couple of percent", () => {
  const { step } = videoFill();
  const percent = (Math.pow(2, step) - 1) * 100;
  assert.ok(percent > 0.5 && percent < 3, `a step moves ${percent.toFixed(2)}%`);
});

test("steps accumulate without rounding drift", () => {
  const { fill, zooms, step } = videoFill();
  for (let i = 0; i < 20; i += 1) fill.step(step);
  assert.equal(zooms.at(-1), Math.round(step * 20 * 1e6) / 1e6);
});

test("the fill for a 16:9 picture on a 21:9 screen is reachable", () => {
  const { fill, zooms, step } = videoFill();
  const needed = Math.log2(3440 / 1440 / (16 / 9));
  let presses = 0;
  while ((zooms.at(-1) ?? 0) < needed && presses < 30) {
    fill.step(step);
    presses += 1;
  }
  assert.ok(zooms.at(-1)! >= needed, `${presses} presses reach only ${zooms.at(-1)}`);
});

test("the readout appears when zoomed out, not only when zoomed in", () => {
  const { fill, flashes, step } = videoFill();
  fill.step(-step);
  assert.equal(flashes.at(-1)?.icon, "zoom");
  assert.equal(flashes.at(-1)?.value, `${Math.round(Math.pow(2, -step) * 100)}%`);
  fill.step(step);
  assert.equal(flashes.at(-1)?.icon, "aspect", "back at 1x shows the mode, not a 100% zoom");
});

test("the hotkeys use the shared step instead of their own number", () => {
  assert.match(hotkeys, /videoFill\.step\(ZOOM_STEP\)/);
  assert.match(hotkeys, /videoFill\.step\(-ZOOM_STEP\)/);
  assert.doesNotMatch(
    hotkeys,
    /videoFill\.step\(-?0\.\d+\)/,
    "a literal step drifted from the clamp",
  );
});

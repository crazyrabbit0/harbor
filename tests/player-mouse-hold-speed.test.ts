// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";

// player.tsx is too large to load, so its mouse-hold callbacks run on their own with the view's locals faked.
const source = readFileSync(new URL("../src/views/player.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile(
  "player.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function find<T extends ts.Node>(match: (node: ts.Node) => node is T): T {
  let found: T | undefined;
  const visit = (node: ts.Node) => {
    if (!found && match(node)) found = node;
    else ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(found, "player.tsx fragment not found");
  return found;
}

const release = find(
  (n): n is ts.VariableDeclaration =>
    ts.isVariableDeclaration(n) && n.name.getText(tree) === "releaseMouseHoldSpeed",
);
const mount = find(
  (n): n is ts.JsxSelfClosingElement =>
    ts.isJsxSelfClosingElement(n) &&
    n.attributes.properties.some((p) => p.name?.getText(tree) === "data-player-video-mount"),
);
const handler = (name: string) => {
  const attr = mount.attributes.properties.find((p) => p.name?.getText(tree) === name);
  assert.ok(attr && ts.isJsxAttribute(attr) && attr.initializer, name);
  return (attr.initializer as ts.JsxExpression).expression!.getText(tree);
};
const releaseFn = (release.initializer as ts.CallExpression).arguments[0].getText(tree);
const names = [
  "onPointerDown",
  "onPointerUp",
  "onPointerCancel",
  "onLostPointerCapture",
  "onClick",
];
const compiled = ts.transpileModule(
  [
    `exports.releaseMouseHoldSpeed = ${releaseFn};`,
    ...names.map((n) => `exports.${n} = ${handler(n)};`),
  ].join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function player({ status = "playing", rate = 1 } = {}) {
  const rates: number[] = [];
  const active: boolean[] = [];
  let toggles = 0;
  const snap = { status, rate };
  const scope: Record<string, unknown> = {
    window: {
      setTimeout: (fn: () => void, ms?: number) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id),
    },
    mouseHoldRef: { current: { pointerId: null, timer: null, engaged: false, baseRate: 1 } },
    suppressMouseClickRef: { current: false },
    suppressMouseClickTimerRef: { current: null },
    bridgeRef: { current: { setRate: (r: number) => rates.push(r) } },
    snapRef: { current: snap },
    snap,
    setMouseHoldSpeedActive: (on: boolean) => active.push(on),
    drawMode: false,
    pipMode: false,
    screenLocked: false,
    dismissedJustNow: () => false,
    clearOverlayDismiss() {},
    playPauseToggle: () => {
      toggles += 1;
    },
    hideForResume() {},
  };
  const exports: Record<string, (...args: any[]) => void> = {};
  const run = () =>
    new Function(...Object.keys(scope), "exports", compiled)(...Object.values(scope), exports);
  run();
  scope.releaseMouseHoldSpeed = exports.releaseMouseHoldSpeed;
  run();
  const stage = {
    captured: new Set<number>(),
    setPointerCapture(id: number) {
      this.captured.add(id);
    },
    hasPointerCapture(id: number) {
      return this.captured.has(id);
    },
    releasePointerCapture(id: number) {
      this.captured.delete(id);
    },
  };
  const event = (patch: Record<string, unknown> = {}) => ({
    target: stage,
    currentTarget: stage,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    pointerId: 7,
    ...patch,
  });
  return {
    rates,
    active,
    toggles: () => toggles,
    down: (patch?: Record<string, unknown>) => exports.onPointerDown(event(patch)),
    up: () => exports.onPointerUp(event()),
    cancel: () => exports.onPointerCancel(event()),
    lost: () => exports.onLostPointerCapture(event()),
    click: () => exports.onClick(event()),
  };
}

test("holding the primary left mouse button temporarily uses at least 2x speed", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const p = player();
  p.down();
  t.mock.timers.tick(349);
  assert.deepEqual(p.rates, [], "a short press is still a click");
  t.mock.timers.tick(1);
  assert.deepEqual(p.rates, [2]);
  assert.deepEqual(p.active, [true]);

  const fast = player({ rate: 3 });
  fast.down();
  t.mock.timers.tick(350);
  assert.deepEqual(fast.rates, [3], "a faster rate is never lowered");

  for (const patch of [{ pointerType: "touch" }, { isPrimary: false }, { button: 2 }]) {
    const other = player();
    other.down(patch);
    t.mock.timers.tick(350);
    assert.deepEqual(other.rates, [], JSON.stringify(patch));
  }
  const paused = player({ status: "paused" });
  paused.down();
  t.mock.timers.tick(350);
  assert.deepEqual(paused.rates, [], "a paused video does not speed up");
});

test("mouse hold restores the previous rate and cannot pause playback on release", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const p = player({ rate: 1.25 });
  p.down();
  t.mock.timers.tick(350);
  p.up();
  assert.deepEqual(p.rates, [2, 1.25]);
  assert.deepEqual(p.active, [true, false]);
  p.click();
  assert.equal(p.toggles(), 0, "the click that ends a hold does not pause");
  p.click();
  assert.equal(p.toggles(), 1, "the next click toggles again");

  const tap = player();
  tap.down();
  t.mock.timers.tick(100);
  tap.up();
  tap.click();
  assert.deepEqual(tap.rates, []);
  assert.equal(tap.toggles(), 1, "a plain click still toggles playback");
});

test("mouse hold is released when the pointer is cancelled or capture is lost", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const end of ["cancel", "lost"] as const) {
    const p = player({ rate: 1.5 });
    p.down();
    t.mock.timers.tick(350);
    p[end]();
    assert.deepEqual(p.rates, [2, 1.5], end);
    assert.deepEqual(p.active, [true, false], end);
    p.click();
    assert.equal(p.toggles(), 1, `${end} does not swallow the next click`);
  }
});

test("the overlay shows the speed HUD for a mouse hold too", () => {
  assert.ok(source.includes("holdSpeedActive: holdSpeedActive || mouseHoldSpeedActive,"));
});

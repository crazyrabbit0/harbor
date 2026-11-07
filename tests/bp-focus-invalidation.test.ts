// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as bpLogic from "../src/views/big-picture/bp-logic.ts";
import { BP_TOKENS } from "../src/views/big-picture/bp-tokens.ts";
import { loadModule } from "./helpers/hook-harness.ts";

// Row containment must key on [data-bp-row-focus]: a :has([data-bp-focus]) rule makes Chromium recheck every row per move.

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

test("no row rule is keyed on :has([data-bp-focus])", () => {
  const offenders = stripComments(BP_TOKENS)
    .split("\n")
    .filter((line) => /:has\([^)]*data-bp-focus/.test(line))
    .map((line) => line.trim());
  assert.deepEqual(offenders, [], "key these on [data-bp-row-focus] instead");
});

test("the containment rule matches the attribute the ring writes", () => {
  assert.match(
    stripComments(BP_TOKENS),
    /\[data-bp-row\]:not\(\[data-bp-row-focus\]\)\s*\{[^}]*content-visibility:\s*auto/,
  );
});

// Minimal DOM: attribute selectors only, which is all applyBpFocus asks of it.
type Node = ReturnType<typeof element>;
const all: Node[] = [];
const doc = {
  activeElement: null as Node | null,
  querySelectorAll: (sel: string) => all.filter((n) => n.matches(sel)),
};

function selector(sel: string): (n: Node) => boolean {
  const m = /^\[([\w-]+)(?:=['"]?([^'"\]]*)['"]?)?\]$/.exec(sel);
  if (!m) return () => false;
  return (n) => (m[2] === undefined ? n.attrs.has(m[1]) : n.attrs.get(m[1]) === m[2]);
}

function element(attrs: Record<string, string> = {}, parent: any = null, accepts = true) {
  const style = new Map<string, string>();
  const node = {
    attrs: new Map(Object.entries(attrs)),
    parentElement: parent,
    isConnected: true,
    style: {
      getPropertyValue: (k: string) => style.get(k) ?? "",
      setProperty: (k: string, v: string) => style.set(k, v),
      removeProperty: (k: string) => style.delete(k),
    },
    matches: (sel: string) => selector(sel)(node),
    closest(sel: string) {
      for (let n: any = node; n; n = n.parentElement) if (n.matches(sel)) return n;
      return null;
    },
    contains: (other: any) => {
      for (let n = other; n; n = n.parentElement) if (n === node) return true;
      return false;
    },
    getAttribute: (k: string) => node.attrs.get(k) ?? null,
    hasAttribute: (k: string) => node.attrs.has(k),
    setAttribute: (k: string, v: string) => node.attrs.set(k, v),
    removeAttribute: (k: string) => node.attrs.delete(k),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
    }),
    focus() {
      if (accepts) doc.activeElement = node;
    },
  };
  all.push(node);
  return node;
}

function core() {
  all.length = 0;
  doc.activeElement = null;
  const sounds: string[] = [];
  const api = loadModule(
    "src/views/big-picture/bp-focus-core.ts",
    {
      "@/lib/sfx": { SFX: { navigate: (dir: string) => sounds.push(dir) } },
      "./bp-safe-area": { bpSafeAreaPx: () => ({ x: 0, y: 0 }) },
      "./bp-focus-meta": { publishBpTarget() {} },
      "./bp-ring-motion": { markBpRingMoved() {} },
      "./bp-restore": { readBpRowPosition: () => null },
      "./bp-track-glide": { glideBpTrack() {} },
      "./bp-visible": { bpFirstVisible: () => null, bpStyleVisible: () => true },
      "./bp-logic": bpLogic,
    },
    { document: doc, window: { matchMedia: () => ({ matches: true }) } },
  );
  const root = element({ "data-bp-root": "" });
  const outer = element({ "data-bp-row": "" }, root);
  const rowA = element({ "data-bp-row": "" }, outer);
  const rowB = element({ "data-bp-row": "" }, root);
  return { apply: api.applyBpFocus, outer, rowA, rowB, sounds };
}

const ROW = "data-bp-row-focus";
const RING = "data-bp-focus";

test("applyBpFocus marks the ring and every row ancestor, and moves both marks together", () => {
  const { apply, outer, rowA, rowB } = core();
  const a = element({ "data-bp-focusable": "" }, rowA);
  const b = element({ "data-bp-focusable": "" }, rowB);
  assert.equal(apply(a, { silent: true }), true);
  assert.equal(a.getAttribute(RING), "true");
  assert.deepEqual(
    [rowA.hasAttribute(ROW), outer.hasAttribute(ROW), rowB.hasAttribute(ROW)],
    [true, true, false],
  );
  assert.equal(apply(b, { silent: true }), true);
  assert.equal(a.hasAttribute(RING), false);
  assert.equal(b.getAttribute(RING), "true");
  assert.deepEqual(
    [rowA.hasAttribute(ROW), outer.hasAttribute(ROW), rowB.hasAttribute(ROW)],
    [false, false, true],
  );
});

test("a refused focus rolls back only the marks that call added", () => {
  const { apply, outer, rowA, rowB } = core();
  const a = element({ "data-bp-focusable": "" }, rowA);
  const refusedSameRow = element({ "data-bp-focusable": "" }, rowA, false);
  const refusedOtherRow = element({ "data-bp-focusable": "" }, rowB, false);
  assert.equal(apply(a, { silent: true }), true);
  assert.equal(apply(refusedSameRow, { silent: true }), false);
  assert.equal(refusedSameRow.hasAttribute(RING), false);
  assert.ok(
    rowA.hasAttribute(ROW) && outer.hasAttribute(ROW),
    "the live ring's rows keep their mark",
  );
  assert.equal(apply(refusedOtherRow, { silent: true }), false);
  assert.equal(rowB.hasAttribute(ROW), false, "a refused candidate leaves its row uncontained");
  assert.equal(a.getAttribute(RING), "true");
});

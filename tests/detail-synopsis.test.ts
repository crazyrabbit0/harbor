import assert from "node:assert/strict";
import test from "node:test";
import { all, treeHarness, type El } from "./helpers/tree-render.ts";

class FakeResizeObserver {
  static live = new Set<FakeResizeObserver>();
  cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
  }
  observe() {
    FakeResizeObserver.live.add(this);
  }
  disconnect() {
    FakeResizeObserver.live.delete(this);
  }
  static fire() {
    for (const ro of FakeResizeObserver.live) ro.cb();
  }
}

function mount(text: string) {
  FakeResizeObserver.live.clear();
  const h = treeHarness(
    "src/views/detail/synopsis.tsx",
    {
      "lucide-react": { ChevronDown: "ChevronDown" },
      "@/lib/i18n": { useT: () => (k: string) => k },
    },
    { globals: { ResizeObserver: FakeResizeObserver } },
  );
  const el = { scrollHeight: 80, clientHeight: 80 };
  let cleanup: (() => void) | void;
  let lastRef: unknown;
  const render = () => {
    const tree = h.render({ type: h.exports.Synopsis, props: { text } }) as El;
    const p = all(tree).find((n) => n.type === "p")!;
    // React calls a new ref callback at commit and the previous one's cleanup first.
    if (p.props.ref !== lastRef) {
      cleanup?.();
      lastRef = p.props.ref;
      cleanup = p.props.ref(el);
    }
    return tree;
  };
  const toggle = (tree: El) => all(tree).find((n) => n.type === "button");
  return { el, render, toggle, observers: () => FakeResizeObserver.live.size };
}

test("text that fits its four lines shows no toggle", () => {
  const s = mount("short");
  s.render();
  assert.equal(s.toggle(s.render()), undefined);
});

test("clamped text shows Show more as soon as it is measured", () => {
  const s = mount("long");
  s.el.scrollHeight = 200;
  s.render();
  assert.ok(s.toggle(s.render()));
});

test("text that grows past the clamp after a resize gains the toggle", () => {
  const s = mount("later");
  s.render();
  assert.equal(s.toggle(s.render()), undefined);
  assert.equal(s.observers(), 1);
  s.el.scrollHeight = 200;
  FakeResizeObserver.fire();
  assert.ok(s.toggle(s.render()));
});

test("expanding stops measuring and the toggle stays to collapse it", () => {
  const s = mount("long");
  s.el.scrollHeight = 200;
  s.render();
  s.toggle(s.render())!.props.onClick();
  const tree = s.render();
  assert.equal(s.observers(), 0);
  assert.ok(s.toggle(tree));
  assert.doesNotMatch(all(tree).find((n) => n.type === "p")!.props.className, /line-clamp-4/);
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { hookHarness } from "./helpers/hook-harness.ts";

type Node = { type: unknown; props: Record<string, any> };

const settings = { liquidGlass: false };
const jsx = (type: unknown, props: Record<string, any>): Node => ({ type, props });
const arrow = hookHarness(
  "src/components/row.tsx",
  "EdgeArrow",
  {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-dom": { flushSync: (fn: () => void) => fn() },
    "@/lib/visibility": { observeWithin: () => () => {} },
    "lucide-react": { ChevronLeft: "ChevronLeft", ChevronRight: "ChevronRight" },
    "@/components/ThreeLiquidGlassSurface": { ThreeLiquidGlassSurface: "Glass" },
    "./nav-arrow": { NavChevron: "NavChevron" },
    "@/lib/i18n": { useT: () => (k: string) => k, useUiLanguage: () => "en", isRtl: () => false },
    "@/lib/settings": { useSettingsSelector: (pick: (s: unknown) => unknown) => pick(settings) },
    "@/lib/view": { useViewActions: () => ({}) },
    "@/lib/poster-dock": { resetPosterDock() {}, updatePosterDock() {} },
    "@/lib/poster-backdrop-expansion": { scrollDeltaToRevealCard: () => 0 },
    "@/components/row-card-expansion": { RowCardExpansionProvider: "Expansion" },
  },
  {},
  ["EdgeArrow"],
);

const nodes = (n: unknown): Node[] =>
  Array.isArray(n)
    ? n.flatMap(nodes)
    : n && typeof n === "object"
      ? [n as Node, ...nodes((n as Node).props?.children)]
      : [];
const tokens = (node: Node) => String(node.props.className ?? "").split(/\s+/);

function render(props: { side: "left" | "right"; visible: boolean; always?: boolean }) {
  const onClick = () => {};
  const tree = arrow.render({ ...props, onClick });
  const all = nodes(tree);
  return { tree: tree as Node, all, onClick, button: all.find((n) => n.type === "button")! };
}

test("standard row arrows retain beta's standalone chevron design", () => {
  settings.liquidGlass = false;
  for (const side of ["left", "right"] as const) {
    const { tree, all, button } = render({ side, visible: true });
    const chevron = all.find((n) => n.type === "NavChevron")!;
    assert.deepEqual(chevron.props, { dir: side, size: 54 });
    assert.ok(tokens(tree).includes(side === "left" ? "start-[-40px]" : "end-[-40px]"));
    assert.ok(tokens(button).includes("group/edge"));
    const span = all.find((n) => n.type === "span")!;
    assert.ok(tokens(span).includes("group-hover/edge:opacity-100"), "hover reveals the chevron");
    for (const n of all)
      for (const t of tokens(n)) assert.doesNotMatch(t, /rounded-full|bg-elevated|bg-gradient/);
    assert.equal(
      all.some((n) => n.type === "Glass"),
      false,
    );
  }
});

test("arrow restoration preserves glass controls and navigation safeguards", () => {
  settings.liquidGlass = true;
  const glass = render({ side: "left", visible: true });
  assert.ok(
    glass.all.some((n) => n.type === "Glass"),
    "liquid glass renders the glass surface",
  );
  assert.equal(
    glass.all.some((n) => n.type === "NavChevron"),
    false,
  );
  assert.equal(glass.button.props.onClick, glass.onClick);

  settings.liquidGlass = false;
  const shown = render({ side: "right", visible: true });
  assert.equal(shown.button.props.onClick, shown.onClick);
  assert.equal(shown.button.props["aria-label"], "Scroll right");
  assert.equal(render({ side: "left", visible: true }).button.props["aria-label"], "Scroll left");
  assert.equal(shown.button.props.tabIndex, 0);
  assert.equal(shown.button.props["data-tv-skip"], "true");
  assert.ok(tokens(shown.button).includes("pointer-events-auto"));

  const hidden = render({ side: "right", visible: false });
  assert.equal(hidden.button.props.tabIndex, -1);
  assert.equal(hidden.button.props["data-tv-skip"], "true");
  assert.ok(tokens(hidden.button).includes("pointer-events-none"));
  assert.ok(!tokens(hidden.button).includes("pointer-events-auto"));
});

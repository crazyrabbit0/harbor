// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import { loadingSrc, posterHarness } from "./helpers/poster-harness.ts";

const { ASPECT_PAD, RATIO_AR, posterTargetWidth } = await import("../src/lib/poster-sizing.ts");

test("poster sizing accounts for the height it has to cover, not just width", () => {
  // A portrait card in a box that is wider than 2:3 needs its width; one taller than 2:3 needs height * 2/3.
  assert.equal(posterTargetWidth({ width: 200, height: 300 }, "portrait", 1, 1), 200);
  assert.equal(posterTargetWidth({ width: 100, height: 300 }, "portrait", 1, 1), 200);
  assert.equal(posterTargetWidth({ width: 100, height: 90 }, "landscape", 1, 1), 160);
  assert.equal(posterTargetWidth({ width: 0, height: 300 }, "portrait", 2, 1), 0);
});

test("poster sizing scales by device pixels, capped at 2, and by the quality setting", () => {
  const box = { width: 101, height: 0 };
  assert.equal(posterTargetWidth(box, "square", 1.5, 1), 152);
  assert.equal(posterTargetWidth(box, "square", 4, 1), 202);
  assert.equal(posterTargetWidth(box, "square", 0, 1), 101);
  assert.equal(posterTargetWidth(box, "square", 2, 0.5), 101);
});

test("poster sizing sees css transforms so scaled art is not blurry", () => {
  // The rendered box is 100x300; clientWidth reports 50 because it ignores transforms like scale().
  const p = posterHarness("Poster", { box: { width: 100, height: 300 } });
  const props = { src: "art", seed: "s", ratio: "portrait" };
  p.render(props);
  assert.equal(loadingSrc(p.render(props)), "art?w=200", "a 2:3 card covering 300px height");
  const wider = { ...props, ratio: "landscape" };
  p.render(wider);
  assert.equal(loadingSrc(p.render(wider)), "art?w=534", "a ratio change re-measures the box");
});

test("the declared aspect ratios match the aspect padding", () => {
  for (const ratio of Object.keys(RATIO_AR) as Array<keyof typeof RATIO_AR>) {
    const pad = Number.parseFloat(ASPECT_PAD[ratio]) / 100;
    assert.ok(Math.abs(pad - 1 / RATIO_AR[ratio]) < 1e-9, ratio);
  }
  assert.equal(RATIO_AR.portrait, 2 / 3);
  assert.equal(RATIO_AR.landscape, 16 / 9);
  assert.equal(RATIO_AR.wide, 16 / 7);
});

function mountRow(settings: Record<string, unknown> = {}) {
  let resize: () => void = () => {};
  const actions = { rememberRowScroll() {}, recallRowScroll: () => null };
  let frames: Array<() => void> = [];
  const container = {
    offsetParent: {},
    getBoundingClientRect: () => ({ width: 1000, height: 300 }),
    closest: () => null,
  };
  const track = {
    scrollLeft: 0,
    scrollWidth: 1000,
    clientWidth: 1000,
    style: {},
    addEventListener() {},
    removeEventListener() {},
  };
  type Node = { type: unknown; props: Record<string, any> };
  const jsx = (type: unknown, props: Record<string, any>): Node => {
    const el = String(props.className).includes("harbor-row-track") ? track : container;
    if (typeof props.ref === "function") props.ref(el);
    else if (props.ref && typeof props.ref === "object") props.ref.current = el;
    return { type, props };
  };
  const all = {
    hidePosterTitles: false,
    rowCardStyle: "poster",
    posterScale: 1,
    posterBackdropExpansion: false,
    posterDockMagnification: false,
    posterDockTransitionMs: 200,
    rowTitleScale: 1,
    posterRadius: 12,
    ...settings,
  };
  const h = hookHarness(
    "src/components/row.tsx",
    "Row",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
      "react-dom": { flushSync: (fn: () => void) => fn() },
      "@/lib/visibility": { observeWithin: () => () => {} },
      "lucide-react": { ChevronLeft: "ChevronLeft", ChevronRight: "ChevronRight" },
      "@/components/ThreeLiquidGlassSurface": { ThreeLiquidGlassSurface: "Glass" },
      "./nav-arrow": { NavChevron: "NavChevron" },
      "@/lib/i18n": { useT: () => (k: string) => k, useUiLanguage: () => "en", isRtl: () => false },
      "@/lib/settings": { useSettingsSelector: (pick: (s: unknown) => unknown) => pick(all) },
      "@/lib/view": { useViewActions: () => actions },
      "@/lib/poster-dock": { resetPosterDock() {}, updatePosterDock() {} },
      "@/lib/poster-backdrop-expansion": { scrollDeltaToRevealCard: () => 0 },
      "@/components/row-card-expansion": { RowCardExpansionProvider: "Expansion" },
    },
    {
      ResizeObserver: class {
        constructor(cb: () => void) {
          resize = cb;
        }
        observe() {}
        disconnect() {}
      },
      requestAnimationFrame: (fn: () => void) => frames.push(fn),
      cancelAnimationFrame() {},
      window: {
        addEventListener() {},
        removeEventListener() {},
        setTimeout: () => 0,
        clearTimeout() {},
      },
    },
  );
  const props = {
    children: [
      { type: "Card", props: {} },
      { type: "Card", props: {} },
    ],
  };
  const nodes = (n: unknown): Node[] =>
    Array.isArray(n)
      ? n.flatMap(nodes)
      : n && typeof n === "object"
        ? [n as Node, ...nodes((n as Node).props?.children)]
        : [];
  const trackNode = (tree: unknown) =>
    nodes(tree).find((n) => String(n.props.className).includes("harbor-row-track"))!;
  return {
    settings: all,
    render: () => trackNode(h.render(props)),
    resize: () => {
      resize();
      const run = frames;
      frames = [];
      for (const fn of run) fn();
    },
  };
}

const classes = (node: { props: Record<string, any> }) => String(node.props.className).split(/\s+/);

test("row tracks do not bleed the next card into horizontal padding", () => {
  for (const dock of [false, true]) {
    const tokens = classes(mountRow({ posterDockMagnification: dock }).render());
    for (const token of tokens) {
      const pad = token.match(/^p([xy]?)-(\d+)$/);
      if (!pad) continue;
      assert.ok(
        tokens.includes(`-m${pad[1]}-${pad[2]}`),
        `${token} is not cancelled by -m${pad[1]}-${pad[2]}, which shows a sliver of the next card`,
      );
    }
    assert.ok(
      !tokens.includes("px-5") && !tokens.includes("p-5"),
      "horizontal padding shows a sliver",
    );
  }
});

test("row tracks keep vertical room for the hover lift", () => {
  const plain = classes(mountRow().render());
  assert.ok(plain.includes("py-5") && plain.includes("-my-5"), "hover lift is not clipped");
  const dock = classes(mountRow({ posterDockMagnification: true }).render());
  assert.ok(dock.includes("pt-14"), "dock mode needs headroom above the cards");
  assert.ok(dock.includes("-mt-14"), "the headroom is pulled back so layout does not shift");
});

test("scroll padding no longer offsets snapping now that the track has no inline padding", () => {
  for (const dock of [false, true]) {
    const tokens = classes(mountRow({ posterDockMagnification: dock }).render());
    assert.ok(!tokens.includes("scroll-ps-5") && !tokens.includes("scroll-pe-5"));
  }
});

test("row measurement never recomputes from a stale effMin after a style switch", async () => {
  const row = mountRow();
  row.render();
  await flushPromises();
  assert.equal(row.render().props.style.gridAutoColumns, "150.015625px", "six 144px cards fit");
  row.settings.posterScale = 2;
  row.render();
  await flushPromises();
  row.render();
  row.resize();
  await flushPromises();
  assert.equal(
    row.render().props.style.gridAutoColumns,
    "320.015625px",
    "a resize after the switch measures with the new 288px minimum",
  );
});

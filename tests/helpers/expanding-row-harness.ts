// Renders the real Row (`components/row.tsx`) with poster settings plus its LazyChild cells; timers run on `settle()`.
import { treeHarness } from "./tree-render.ts";

type Node = { type: unknown; props: Record<string, any> };

const nodes = (n: unknown): Node[] =>
  Array.isArray(n)
    ? n.flatMap(nodes)
    : n && typeof n === "object"
      ? [n as Node, ...nodes((n as Node).props?.children)]
      : [];

export function expandingRowHarness(settings: Record<string, unknown>, shape = "portrait") {
  const timers: Array<() => void> = [];
  const track = {
    scrollLeft: 0,
    scrollWidth: 1000,
    clientWidth: 1000,
    style: {} as Record<string, string>,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, right: 1000 }),
  };
  const container = {
    offsetParent: {},
    getBoundingClientRect: () => ({ width: 1000, height: 300 }),
    closest: () => null,
  };
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
  const mocks = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-dom": { flushSync: (fn: () => void) => fn() },
    "@/lib/visibility": { observeWithin: () => () => {} },
    "lucide-react": { ChevronLeft: "ChevronLeft", ChevronRight: "ChevronRight" },
    "@/components/ThreeLiquidGlassSurface": { ThreeLiquidGlassSurface: "Glass" },
    "./nav-arrow": { NavChevron: "NavChevron" },
    "@/lib/i18n": { useT: () => (k: string) => k, useUiLanguage: () => "en", isRtl: () => false },
    "@/lib/settings": { useSettingsSelector: (pick: (s: unknown) => unknown) => pick(all) },
    "@/lib/view": {
      useViewActions: () => ({ rememberRowScroll() {}, recallRowScroll: () => null }),
    },
    "@/lib/poster-dock": { resetPosterDock() {}, updatePosterDock() {} },
    "@/lib/poster-backdrop-expansion": { scrollDeltaToRevealCard: () => 0 },
    "@/components/row-card-expansion": { RowCardExpansionProvider: "Expansion" },
  };
  const globals = {
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    performance: { now: () => 0 },
    window: {
      addEventListener() {},
      removeEventListener() {},
      setTimeout: (fn: () => void) => timers.push(fn),
      clearTimeout() {},
    },
  };
  const options = { globals, expose: ["LazyChildImpl"], deferLazy: true, mockJsx: true };
  const row = treeHarness("src/components/row.tsx", mocks, options);
  const cells = treeHarness("src/components/row.tsx", mocks, options);
  const props = {
    shape,
    children: [
      { type: "Card", props: {} },
      { type: "Card", props: {} },
    ],
  };
  const render = () => nodes(row.run(() => row.exports.Row(props)));
  return {
    track,
    /** The row track element as rendered. */
    trackNode: () => render().find((n) => String(n.props.className).includes("harbor-row-track"))!,
    /** The expansion each card cell was handed. */
    expansions: () =>
      render()
        .filter((n) => "expansion" in n.props)
        .map((n) => n.props.expansion),
    /** The cell div LazyChild draws for one expansion. */
    cell: (expansion: unknown): Node =>
      cells.run(() =>
        cells.exports.LazyChildImpl({
          children: null,
          eager: false,
          rowSeen: false,
          shape,
          expansion,
        }),
      ),
    render,
    settle: () => timers.splice(0).forEach((fn) => fn()),
  };
}

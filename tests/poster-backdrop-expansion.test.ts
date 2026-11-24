// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import * as expansion from "../src/lib/poster-backdrop-expansion.ts";
import { DEFAULT } from "../src/lib/settings/defaults.ts";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";
import { componentHarness, elements, stubModule } from "./helpers/component-harness.ts";
import ts from "typescript";
import { expandingRowHarness } from "./helpers/expanding-row-harness.ts";
import { jsxAttribute, sourceCallback } from "./helpers/source-callback.ts";
import { tvNavigationHarness } from "./helpers/tv-navigation-harness.ts";

const {
  expandedCardWidth,
  isSuitableWideArtworkSize,
  normalizePosterCardSettings,
  pickAlternativeWideArtwork,
  rewriteWideArtworkRung,
  scrollDeltaToRevealCard,
  stableCardNavigationRect,
} = expansion;

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("expanding cards keep the poster height and reject unsuitable artwork", () => {
  assert.equal(expandedCardWidth(180), 320);
  assert.equal(isSuitableWideArtworkSize(1280, 720), true);
  assert.equal(isSuitableWideArtworkSize(600, 338), false);
  assert.equal(isSuitableWideArtworkSize(900, 1200), false);
  assert.equal(isSuitableWideArtworkSize(1700, 330), false);
  assert.equal(isSuitableWideArtworkSize(1920, 500), false);
});

test("expanded cards keep their original spatial-navigation center", () => {
  const expanded = { left: 100, right: 420, top: 20, bottom: 260, width: 320, height: 240 };
  assert.deepEqual(stableCardNavigationRect(expanded, 160, false), {
    left: 100,
    right: 260,
    top: 20,
    bottom: 260,
    width: 160,
    height: 240,
    cx: 180,
    cy: 140,
  });
  assert.deepEqual(stableCardNavigationRect(expanded, 160, true), {
    left: 260,
    right: 420,
    top: 20,
    bottom: 260,
    width: 160,
    height: 240,
    cx: 340,
    cy: 140,
  });
});

test("the TV focus engine navigates an expanded card from its base width", () => {
  const n = tvNavigationHarness(
    '<button id="a" data-rect="0,0,100,100"></button>' +
      '<div data-tv-nav-base-width="100" data-rect="120,0,300,100"><button id="b" data-rect="120,0,300,100"></button></div>' +
      '<button id="c" data-rect="120,200,100,100"></button>' +
      '<button id="d" data-rect="220,200,100,100"></button>',
  );
  n.mount();
  n.get("#b").focus();
  n.api.moveFocus("down");
  assert.equal(n.activeId(), "c", "Down picks the card under the base width, not the wide frame");
  n.get("#c").focus();
  n.api.moveFocus("up");
  assert.equal(n.activeId(), "b");
});

test("expanded cards remain fully visible at either row edge", () => {
  const viewport = { left: 100, right: 900 };
  assert.equal(scrollDeltaToRevealCard({ left: 120, right: 880 }, viewport, 20), 0);
  assert.equal(scrollDeltaToRevealCard({ left: 600, right: 930 }, viewport, 20), 50);
  assert.equal(scrollDeltaToRevealCard({ left: 70, right: 400 }, viewport, 20), -50);
  assert.equal(scrollDeltaToRevealCard({ left: 50, right: 950 }, viewport, 20), 0);
});

test("wide artwork prefers a different TMDB image and upgrades its resolution", () => {
  const current = "https://image.tmdb.org/t/p/original/current.jpg";
  const candidates = [
    "https://image.tmdb.org/t/p/w780/current.jpg",
    "https://image.tmdb.org/t/p/w780/alternate.jpg",
  ];

  assert.equal(pickAlternativeWideArtwork(candidates, current), candidates[1]);
  assert.equal(pickAlternativeWideArtwork([candidates[0]], current), undefined);
  assert.equal(
    rewriteWideArtworkRung(candidates[1]),
    "https://image.tmdb.org/t/p/w1280/alternate.jpg",
  );

  const cinemetaPoster = "https://images.metahub.space/poster/small/tt0427340/img";
  const cinemetaBackdrop = "https://images.metahub.space/background/medium/tt0427340/img";
  assert.equal(pickAlternativeWideArtwork([cinemetaBackdrop], cinemetaPoster), cinemetaBackdrop);
});

test("Expanding Cards reflows the row and keeps artwork under the card badges", () => {
  const classes = (row: ReturnType<typeof expandingRowHarness>) =>
    String(row.trackNode().props.className).split(/\s+/);
  const plain = expandingRowHarness({ posterBackdropExpansion: false });
  assert.ok(classes(plain).includes("grid"));
  assert.deepEqual(plain.expansions(), [undefined, undefined], "a plain row hands cards nothing");

  const row = expandingRowHarness({ posterBackdropExpansion: true });
  for (const token of [
    "harbor-expanding-card-scope",
    "harbor-expanding-row",
    "flex",
    "flex-nowrap",
  ])
    assert.ok(classes(row).includes(token), token);
  assert.equal(row.trackNode().props.style.gridAutoColumns, undefined, "cards size by flex basis");
  const [first] = row.expansions();
  const cell = row.cell(first);
  assert.equal(cell.props["data-tv-nav-base-width"], first.baseWidth);
  assert.equal(cell.props.style.flexBasis, `${first.baseWidth}px`);
  const grown = row.cell({ ...first, expandedWidth: first.baseWidth * 2 });
  assert.equal(grown.props.style.flexBasis, `${first.baseWidth * 2}px`, "expanded cards widen");
  assert.equal(grown.props["data-tv-nav-base-width"], first.baseWidth, "and keep their nav width");
  assert.equal(
    expandingRowHarness({ posterBackdropExpansion: true }, "landscape").expansions()[0],
    undefined,
    "only portrait rows expand",
  );

  first.onExpand(0, first.baseWidth * 2);
  row.render();
  row.settle();
  assert.equal(row.track.style.scrollSnapType, "none", "an expanded card keeps snapping off");
  row.expansions()[0].onCollapse(0);
  row.render();
  row.settle();
  assert.equal(row.track.style.scrollSnapType, "", "collapsing restores snapping");

  // pick-card.tsx is over 1000 lines; its artwork-before-badges order is read from the parsed JSX tree.
  const card = ts.createSourceFile(
    "pick-card.tsx",
    read("src/components/pick-card.tsx"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const elementsNamed = (tag: string) => {
    const found: ts.Node[] = [];
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        node.tagName.getText(card) === tag
      )
        found.push(ts.isJsxOpeningElement(node) ? node.parent : node);
      ts.forEachChild(node, visit);
    };
    visit(card);
    assert.equal(found.length, 1, `one <${tag}> in pick-card.tsx`);
    return found[0];
  };
  const lineage = (node: ts.Node) => {
    const chain: ts.Node[] = [];
    for (let at: ts.Node | undefined = node; at; at = at.parent) chain.unshift(at);
    return chain;
  };
  const artwork = lineage(elementsNamed("ExpandingCardArtwork"));
  const scores = lineage(elementsNamed("ScoreStack"));
  let split = 0;
  while (artwork[split] === scores[split]) split++;
  const parent = artwork[split - 1];
  assert.ok(ts.isJsxElement(parent), "artwork and badges share one JSX parent");
  const siblings: ts.Node[] = [...parent.children];
  const artworkAt = siblings.indexOf(artwork[split]);
  const scoresAt = siblings.indexOf(scores[split]);
  assert.ok(artworkAt >= 0 && scoresAt >= 0, "both sit under direct children of that parent");
  assert.ok(artworkAt < scoresAt, "wide artwork must remain underneath IMDb and other card badges");
  assert.match(read("src/index.css"), /\[data-expanding-card\]\[data-row-card-expanded="true"\]/);
});

test("Focused Card, Expanding Cards, and Poster Dock remain independent settings", async () => {
  assert.equal(DEFAULT.posterFocusedCard, false);
  assert.equal(DEFAULT.posterBackdropExpansion, false);
  assert.equal(DEFAULT.posterDockMagnification, false);
  assert.deepEqual(
    normalizePosterCardSettings({ posterBackdropExpansion: true, posterDockMagnification: true }),
    { posterBackdropExpansion: true, posterFocusedCard: false, posterDockMagnification: true },
  );
  assert.deepEqual(
    normalizePosterCardSettings({
      posterBackdropExpansion: false,
      posterFocusedCard: true,
      posterDockMagnification: true,
    }),
    { posterBackdropExpansion: false, posterFocusedCard: true, posterDockMagnification: true },
  );
  assert.deepEqual(
    normalizePosterCardSettings({ posterBackdropExpansion: "yes", posterFocusedCard: 1 }),
    { posterBackdropExpansion: false, posterFocusedCard: false, posterDockMagnification: false },
  );
  const { loadStoredSettings } = await import("../src/lib/settings/load.ts");
  localStorage.setItem(
    "test.poster-cards",
    JSON.stringify({
      posterBackdropExpansion: true,
      posterFocusedCard: "true",
      posterDockMagnification: true,
    }),
  );
  const loaded = loadStoredSettings("test.poster-cards");
  assert.deepEqual(
    [loaded.posterBackdropExpansion, loaded.posterFocusedCard, loaded.posterDockMagnification],
    [true, false, true],
    "stored settings go through the same normalizer",
  );
  const patches: unknown[] = [];
  const panel = componentHarness(
    "src/views/settings/theme-panel/display/poster-card-section.tsx",
    "PosterCardSection",
    {
      "@/components/slider": { fillStyle: () => ({}) },
      react: { useEffect() {}, useRef: () => ({ current: null }) },
      "@/lib/sample-artwork": {
        useSettingsSamples: () => [],
        useSettingsSampleMeta: () => ({ name: "Sample" }),
        useSampleArtwork: () => ({ poster: "p.jpg", logo: null }),
      },
      "@/components/tv-card": stubModule(),
      "@/lib/settings": {
        useSettings: () => ({
          settings: {
            ...DEFAULT,
            posterFocusedCard: true,
            posterBackdropExpansion: false,
            posterDockMagnification: false,
          },
          update: (patch: unknown) => patches.push(patch),
        }),
      },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/poster-dock": stubModule(),
      "../../shared": { Section: "Section", Segmented: "Segmented", ToggleRow: "ToggleRow" },
      "../../kit": { SettingRow: "SettingRow" },
      "../../ui": { SButton: "SButton" },
      "./poster-options": {
        POSTER_RADII: [],
        POSTER_SIZES: [{ value: "m", label: "Medium", scale: 1 }],
        posterSizeKey: () => "m",
        radiusKey: () => "classic",
      },
      "../../preview-image": { PreviewImage: "PreviewImage" },
    },
  );
  const toggles = [...elements(panel.render())].filter((el) => el.type === "ToggleRow");
  const toggle = (label: string) => toggles.find((el) => el.props.label === label)!;
  assert.deepEqual(
    toggles.map((el) => [el.props.label, el.props.value]),
    [
      ["Focused Card", true],
      ["Expanding Cards", false],
      ["Poster dock magnification", false],
    ],
  );
  toggle("Focused Card").props.onChange(false);
  toggle("Expanding Cards").props.onChange(true);
  toggle("Poster dock magnification").props.onChange(true);
  assert.deepEqual(patches, [
    { posterFocusedCard: false },
    { posterBackdropExpansion: true },
    { posterDockMagnification: true },
  ]);
  const dockPad = (settings: Record<string, unknown>, shape?: string) =>
    String(expandingRowHarness(settings, shape).trackNode().props.className).includes("pt-14");
  assert.equal(dockPad({ posterDockMagnification: true }), true, "the dock follows its own toggle");
  assert.equal(dockPad({ posterDockMagnification: true, posterBackdropExpansion: true }), true);
  assert.equal(dockPad({ posterDockMagnification: false, posterBackdropExpansion: true }), false);
  assert.equal(
    dockPad({ posterDockMagnification: true }, "landscape"),
    false,
    "portrait rows only",
  );
});

type Row = {
  enabled: boolean;
  expanded: boolean;
  expand: (w: number) => void;
  collapse: () => void;
};

function expandingCard(
  options: { enabled?: boolean; focusEnabled?: boolean; modality?: string } = {},
) {
  const prepared: string[] = [];
  const resolvers: Array<(url: string | undefined) => void> = [];
  const visibility: Array<(visible: boolean) => void> = [];
  const widths: number[] = [];
  let collapses = 0;
  const row: Row = {
    enabled: options.enabled ?? true,
    expanded: false,
    expand: (w) => widths.push(w),
    collapse: () => collapses++,
  };
  const h = hookHarness(
    "src/components/pick-card/use-expanding-card.tsx",
    "useExpandingCard",
    {
      "@/lib/expanding-card-artwork": {
        expandingCardArtworkKey: (meta: { id: string }) => meta.id,
        invalidateExpandingCardArtwork() {},
        prepareExpandingCardArtwork: (_meta: unknown, _key: string, priority: string) => {
          prepared.push(priority);
          return new Promise<string | undefined>((resolve) => resolvers.push(resolve));
        },
      },
      "@/lib/poster-backdrop-expansion": expansion,
      "@/lib/visibility": {
        observe: (_el: unknown, cb: (visible: boolean) => void) => (visibility.push(cb), () => {}),
      },
      "../row-card-expansion": { useRowCardExpansion: () => row },
      "react/jsx-runtime": { jsx: (type: unknown, props: object) => ({ type, props }) },
    },
    {
      document: {
        documentElement: { getAttribute: () => options.modality ?? "keys" },
      },
    },
  );
  const anchor = { getBoundingClientRect: () => ({ height: 270 }) };
  const props = {
    cardRef: { current: { querySelector: () => anchor } },
    meta: { id: "tt1", type: "movie", name: "One" },
    tmdbKey: "key",
    focusEnabled: options.focusEnabled ?? false,
  };
  return {
    render: () => h.render(props),
    prepared,
    resolve: (url: string | undefined) => resolvers.shift()?.(url),
    visible: () => visibility.forEach((cb) => cb(true)),
    widths,
    collapses: () => collapses,
  };
}

test("Focused Card is global and independent from card expansion", () => {
  const off = expandingCard({ enabled: false, focusEnabled: true });
  const card = off.render();
  assert.equal(card.focusEnabled, true, "Focused Card works on rows without expansion");
  assert.equal(card.enabled, false);
  card.onFocus();
  assert.deepEqual(off.prepared, [], "and never loads wide artwork there");
  assert.equal(expandingCard({ focusEnabled: false }).render().focusEnabled, false);
  const frame = (focusEnabled: boolean) =>
    String(
      cardAttr("div", "className", {
        tiltable: false,
        expandingCard: { enabled: false, focusEnabled },
      }),
    ).split(/\s+/);
  assert.ok(frame(true).includes("group-focus:[transform:translate3d(0,-0.5rem,0)]"));
  assert.ok(!frame(false).some((c) => c.startsWith("group-focus:")), "off means no focus lift");
  assert.match(read("src/index.css"), /#root\[data-card-focus-active\]/);
});

// pick-card.tsx is over 1000 lines; one JSX attribute of its card runs alone with `scope`.
const cardAttr = (tag: string, attr: string, scope: Record<string, unknown>) =>
  sourceCallback("src/components/pick-card.tsx", jsxAttribute(tag, attr), scope);

test("pointer focus never expands cards and keeps the hover preview", async () => {
  const c = expandingCard({ modality: "pointer" });
  c.render().onFocus();
  assert.deepEqual(c.prepared, [], "a mouse focus asks for no artwork");
  c.render().onArtworkReady("ignored");
  assert.deepEqual(c.widths, []);

  const previews: unknown[][] = [];
  const meta = { id: "tt1" };
  const anchor = { id: "anchor" };
  const focus = (enabled: boolean) => {
    previews.length = 0;
    cardAttr("button", "onFocus", {
      meta,
      expandingCard: { enabled, onFocus() {} },
      hoverPreviewFocus: (...args: unknown[]) => previews.push(["focus", ...args]),
    })({ currentTarget: anchor });
    return [...previews];
  };
  assert.deepEqual(focus(false), [["focus", meta, anchor]], "without expansion focus previews");
  assert.deepEqual(focus(true), [], "an expanding card replaces the preview on focus");
  previews.length = 0;
  cardAttr("div", "onPointerEnter", {
    meta,
    tiltable: false,
    hoverPreviewEnter: (...args: unknown[]) => previews.push(["enter", ...args]),
  })({ currentTarget: anchor, buttons: 0 });
  assert.deepEqual(previews, [["enter", meta, anchor, 0]], "the pointer always previews");
  const cardStyle = (kids: boolean, hoverPreviewEnabled: boolean) =>
    sourceCallback(
      "src/components/pick-card.tsx",
      (node, source) =>
        ts.isVariableDeclaration(node) && node.name.getText(source) === "cardStyle"
          ? node.initializer
          : undefined,
      { kids, settings: { hoverPreviewEnabled, cardHoverStyle: "zoom" } },
    );
  assert.equal(cardStyle(false, true), "zoom");
  assert.equal(cardStyle(false, false), "none", "previews off means no hover style");
  assert.equal(cardStyle(true, true), "none", "kids cards never preview");
});

test("wide artwork is prepared before the row is allowed to expand", async () => {
  const c = expandingCard();
  c.render();
  c.visible();
  assert.deepEqual(c.prepared, ["auto"], "a visible card preloads at normal priority");
  c.render().onFocus();
  assert.deepEqual(c.prepared, ["auto", "high"], "focus raises the pending load to high");
  assert.deepEqual(c.widths, [], "no expansion before the artwork exists");
  c.resolve("wide.jpg");
  await flushPromises();
  const loaded = c.render();
  assert.equal(loaded.artwork, "wide.jpg");
  assert.deepEqual(c.widths, [], "a downloaded image still waits for its decode");
  loaded.onArtworkReady("wide.jpg");
  assert.deepEqual(c.widths, [480], "then the row expands to 16:9 of the poster height");
  c.render().onBlur();
  assert.equal(c.collapses() > 0, true);
});

test("wide artwork decodes the card's own backdrop before asking remote sources", async () => {
  const sizes = new Map<string, [number, number]>([
    ["https://img/background.jpg", [1280, 720]],
    ["https://image.tmdb.org/t/p/w1280/tmdb.jpg", [1920, 1080]],
    ["https://img/narrow.jpg", [600, 338]],
  ]);
  const remote: string[] = [];
  class FakeImage {
    naturalWidth = 0;
    naturalHeight = 0;
    decoding = "";
    fetchPriority = "";
    onload: () => void = () => {};
    onerror: () => void = () => {};
    decode = () => Promise.resolve();
    set src(url: string) {
      const size = sizes.get(url);
      queueMicrotask(() => {
        if (!size) return this.onerror();
        [this.naturalWidth, this.naturalHeight] = size;
        this.onload();
      });
    }
  }
  const artwork = loadModule(
    "src/lib/expanding-card-artwork.ts",
    {
      "@/lib/anime-backdrop": { resolveHeroBackdrop: async () => undefined },
      "@/lib/cinemeta": { narrowMediaType: (t: string) => t },
      "@/lib/providers/anime-mapping": { externalToKitsu: async () => null },
      "@/lib/providers/kitsu": { parseKitsuId: () => null },
      "@/lib/providers/tmdb": {
        tmdbAnimeMatch: async () => null,
        tmdbIdFromImdb: async (_k: string, id: string) => (
          remote.push(`tmdb:${id}`),
          "tmdb:movie:1"
        ),
        tmdbMovieImages: async () => ["https://image.tmdb.org/t/p/w780/tmdb.jpg"],
      },
      "@/lib/providers/tvdb-proxy": {
        fetchTvdbArtwork: async () => (remote.push("tvdb"), { backgrounds: [] }),
      },
      "@/lib/simkl/activities": { getLocalCache: () => null },
      "@/lib/simkl/client": { simklRequest: async () => null },
      "@/lib/poster-backdrop-expansion": expansion,
    },
    { Image: FakeImage },
  );
  const withBackground = {
    id: "tt1",
    type: "movie",
    name: "One",
    poster: "https://img/p.jpg",
    background: "https://img/background.jpg",
  };
  assert.equal(
    await artwork.prepareExpandingCardArtwork(withBackground, "key"),
    "https://img/background.jpg",
  );
  assert.deepEqual(remote, [], "a suitable backdrop on the card needs no remote lookup");

  const narrow = { ...withBackground, id: "tt2", background: "https://img/narrow.jpg" };
  assert.equal(
    await artwork.prepareExpandingCardArtwork(narrow, "key"),
    "https://image.tmdb.org/t/p/w1280/tmdb.jpg",
    "a too-small backdrop falls back to TMDB at the w1280 rung",
  );
  assert.deepEqual(remote.sort(), ["tmdb:tt2", "tvdb"]);
});

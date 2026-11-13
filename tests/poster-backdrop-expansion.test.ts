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
  const row = read("src/components/row.tsx");
  const card = read("src/components/pick-card.tsx");
  assert.match(row, /\? "harbor-expanding-card-scope harbor-expanding-row flex flex-nowrap"/);
  assert.match(row, /flexBasis: `\$\{expansion\.expandedWidth \?\? expansion\.baseWidth\}px`,/);
  assert.match(row, /data-tv-nav-base-width=\{expansion\?\.baseWidth\}/);
  assert.match(row, /if \(!expandedCard\) track\.style\.scrollSnapType = "";/);
  assert.ok(
    card.indexOf("<ExpandingCardArtwork") < card.indexOf("<ScoreStack"),
    "wide artwork must remain underneath IMDb and other card badges",
  );
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
  assert.match(
    read("src/components/row.tsx"),
    /const dockEnabled = effShape === "portrait" && settings\.posterDockMagnification;/,
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
  assert.match(
    read("src/components/pick-card.tsx"),
    /expandingCard\.focusEnabled\s*\? "group-focus:\[-webkit-transform:translate3d\(0,-0\.5rem,0\)\]/,
  );
  assert.match(read("src/index.css"), /#root\[data-card-focus-active\]/);
});

test("pointer focus never expands cards and keeps the hover preview", async () => {
  const c = expandingCard({ modality: "pointer" });
  c.render().onFocus();
  assert.deepEqual(c.prepared, [], "a mouse focus asks for no artwork");
  c.render().onArtworkReady("ignored");
  assert.deepEqual(c.widths, []);
  const card = read("src/components/pick-card.tsx");
  assert.match(card, /if \(!expandingCard\.enabled\) hoverPreviewFocus\(meta, e\.currentTarget\);/);
  assert.match(card, /hoverPreviewEnter\(meta, e\.currentTarget, e\.buttons\);/);
  assert.match(card, /kids \|\| !settings\.hoverPreviewEnabled \? "none"/);
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

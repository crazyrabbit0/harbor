const compactCss = (value: string) =>
  value
    .replace(/\s*([{}:;,/])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/@media\s+\(/g, "@media(")
    .replace(/;}/g, "}");
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const watchCss = compactCss(read("../src/components/music/music-watch.css"));
const watchTsx = read("../src/components/music/music-watch.tsx");
const discoveryCss = compactCss(read("../src/components/music/music-video-discovery.css"));

const rule = (css: string, selector: string) => {
  const start = css.indexOf(selector + "{");
  assert.notEqual(start, -1, `missing rule ${selector}`);
  return css.slice(start + selector.length + 1, css.indexOf("}", start));
};

test("the watch stage reserves a 16:9 box and clips the media element itself", () => {
  const stage = rule(watchCss, ".music-watch-stage");
  assert.match(stage, /aspect-ratio:\s*16\/9/);
  assert.match(stage, /overflow:hidden/);
  assert.match(stage, /border-radius:/);
  assert.match(stage, /position:relative/);
});

test("the stage no longer pins itself to escape a native window it no longer hosts", () => {
  assert.doesNotMatch(watchCss, /position:sticky/);
  assert.doesNotMatch(watchCss, /native window/i);
  assert.doesNotMatch(watchCss, /max-height:620px/);
});

test("the terminal error state replaces the picture and offers a reachable retry", () => {
  assert.match(watchTsx, /preparationError \? \(/);
  assert.match(watchTsx, /music-watch-stage-error/);
  assert.match(watchTsx, /role="alert"/);
  const retry = watchTsx.slice(
    watchTsx.indexOf("music-watch-stage-error"),
    watchTsx.indexOf("music-watch-stage-poster"),
  );
  assert.match(retry, /data-music-watch-retry/);
  assert.match(retry, /type="button"/);
  assert.match(retry, /t\("common\.retry"\)/);
  assert.match(retry, /onClick=\{replayTrack\}/);
  assert.match(rule(watchCss, ".music-watch-retry"), /min-height:44px/);
  assert.match(watchCss, /\.music-watch-retry:focus-visible\{outline:/);
});

test("resolving shows artwork and shaped skeletons rather than an empty or frozen frame", () => {
  assert.match(watchTsx, /music-watch-stage-poster/);
  assert.match(watchTsx, /function VideoNextSkeleton/);
  assert.match(watchTsx, /\{busy && \(\s*<ul className="music-watch-next-list"/);
  assert.match(watchTsx, /similarBusy \? \(/);
  assert.doesNotMatch(watchTsx, /Loader2/);
  assert.match(watchCss, /@keyframes music-watch-sheen/);
});

test("the up next rows expose focus and pointer affordance on the controls that actually take it", () => {
  assert.match(
    watchCss,
    /\.music-watch-next-art:focus-visible,\.music-watch-next-label button:focus-visible\{outline:/,
  );
  assert.doesNotMatch(rule(watchCss, ".music-watch-video-next"), /cursor:pointer/);
  assert.match(rule(watchCss, ".music-watch-next-art"), /cursor:pointer/);
});

test("skeleton and retry motion stand down under reduced motion", () => {
  assert.match(
    watchCss,
    /@media\(prefers-reduced-motion:reduce\)\{[^}]*music-watch-sheen|@media\(prefers-reduced-motion:reduce\)\{[^{]*\.music-watch-next-skeleton/,
  );
  assert.match(
    discoveryCss,
    /@media\(prefers-reduced-motion:reduce\)\{.*\.music-video-skeleton span\{animation:none\}/,
  );
});

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

function discovery() {
  const rail = {
    scrollLeft: 0,
    scrollWidth: 1000,
    clientWidth: 400,
    listeners: new Map<string, () => void>(),
    addEventListener(type: string, fn: () => void) {
      rail.listeners.set(type, fn);
    },
    removeEventListener(type: string) {
      rail.listeners.delete(type);
    },
  };
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  // The section's ref is attached during render, as React does before effects run.
  const mount = (type: unknown, props: N["props"]) => {
    if (type === "section" && props.ref && !props.ref.current) props.ref.current = {};
    return element(type, props);
  };
  const track = { id: "v1", sourceId: "v1", title: "Video", artist: "Artist" };
  const h = hookHarness(
    "src/components/music/music-video-discovery.tsx",
    "MusicVideoDiscovery",
    {
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, name) => String(name) }),
      "@/components/poster": { Poster: "Poster" },
      "./music-artist-link": { MusicArtistLink: "MusicArtistLink" },
      "./music-item-menu": { useMusicItemMenu: () => ({ openFor: () => () => {}, menu: null }) },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/use-drag-scroll": { useDragScroll: () => ({ ref: { current: rail }, handlers: {} }) },
      "@/lib/music/video-discovery": {
        MUSIC_VIDEO_KIND_LABELS: {},
        musicVideoQuery: () => "q",
        musicVideoUsesYoutube: () => false,
      },
      "@/lib/music/video-pages": {
        appendMusicVideos: (a: unknown[], b: unknown[]) => [...a, ...b],
        searchMusicVideoPage: async () => ({ tracks: [track], next: null }),
      },
      "@/assets/service-logos/youtube.ico": { default: "yt.ico" },
      "./music-video-discovery.css": {},
      "react/jsx-runtime": { jsx: mount, jsxs: mount, Fragment: "Fragment" },
    },
    {
      IntersectionObserver: class {
        constructor(cb: typeof intersect) {
          intersect = cb;
        }
        observe() {}
        disconnect() {}
      },
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
    },
  );
  const props = { onWatch() {} };
  return {
    rail,
    render: () => h.render(props) as N,
    start: async () => {
      h.render(props);
      intersect([{ isIntersecting: true }]);
      h.render(props);
      await flushPromises();
      return h.render(props) as N;
    },
  };
}

const arrows = (tree: N) =>
  all(tree)
    .filter((n) => n.props["aria-label"] === "common.previous" || n.props["aria-label"] === "common.next")
    .map((n) => n.props.disabled);

test("the discovery rail arrows disable at each edge and follow scrolling", async () => {
  const d = discovery();
  await d.start();
  assert.deepEqual(arrows(d.render()), [true, false], "at the start only Next works");
  d.rail.scrollLeft = 600;
  d.rail.listeners.get("scroll")!();
  assert.deepEqual(arrows(d.render()), [false, true], "at the end only Previous works");
  d.rail.scrollLeft = 300;
  d.rail.listeners.get("scroll")!();
  assert.deepEqual(arrows(d.render()), [false, false]);
  assert.match(discoveryCss, /\.music-video-rail-controls button:disabled\{/);
});

test("the discovery placeholder mirrors the tile it becomes instead of spinning", async () => {
  const d = discovery();
  const first = d.render();
  const skeleton = all(first).find((n) => n.props.className === "music-video-skeleton")!;
  assert.equal(skeleton.props.role, "status");
  const parts = all(skeleton).map((n) => n.props.className);
  assert.ok(parts.includes("music-video-skeleton-art"));
  assert.ok(parts.includes("music-video-skeleton-line"));
  assert.equal(all(first).some((n) => n.type === "LoaderCircle"), false);
  assert.match(rule(discoveryCss, ".music-video-skeleton-art"), /aspect-ratio:16\/9/);
  assert.equal(
    all(await d.start()).some((n) => n.props.className === "music-video-skeleton"),
    false,
    "loaded tiles replace it",
  );
});

test("every discovery control declares its button type so a rail cannot submit the search form", async () => {
  const buttons = all(await discovery().start()).filter((n) => n.type === "button");
  assert.ok(buttons.length >= 4);
  assert.deepEqual(
    buttons.filter((b) => b.props.type !== "button" && b.props.type !== "submit"),
    [],
  );
  assert.deepEqual(
    buttons.filter((b) => b.props.type === "submit").map((b) => b.props["aria-label"]),
    ["common.search"],
    "only the search arrow submits",
  );
});

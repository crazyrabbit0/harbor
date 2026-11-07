import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import { all, type N } from "./helpers/hero-carousel-harness.ts";

const connector = readFileSync("src-tauri/music/src/connector.rs", "utf8");

type Timer = { fn: () => void; ms: number };

function clock() {
  const live = new Map<number, Timer>();
  let next = 0;
  return {
    live,
    setTimeout: (fn: () => void, ms: number) => {
      live.set(++next, { fn, ms });
      return next;
    },
    clearTimeout: (id: number) => live.delete(id),
    pending: (ms: number) => [...live.values()].filter((t) => t.ms === ms),
  };
}

const track = { id: "t1", kind: "track", title: "Title", artist: "Artist" };

function heroMedia(options: { direct?: "none" | "reject"; reduced?: boolean; hidden?: boolean }) {
  const timers = clock();
  const calls: string[] = [];
  const doc = { hidden: !!options.hidden, listeners: new Map<string, () => void>() } as any;
  doc.addEventListener = (type: string, fn: () => void) => doc.listeners.set(type, fn);
  doc.removeEventListener = (type: string) => doc.listeners.delete(type);
  const media = { play: () => Promise.resolve(), pause: () => {}, currentTime: 0 };
  const element = (type: unknown, props: Record<string, any>) => {
    if (props?.ref && typeof props.ref === "object")
      props.ref.current = type === "video" || type === "audio" ? media : {};
    return { type, props };
  };
  const h = hookHarness(
    "src/views/music/music-hero-media.tsx",
    "MusicHeroMedia",
    {
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
      "@/components/icons/music-glyph": { MusicGlyph: "MusicGlyph" },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/music/player": {
        getMusicState: () => ({ phase: "idle" }),
        toggleMusicPlayback: () => {},
      },
      "@/lib/music/video": {
        musicVideoStream: async (t: { id: string }) => {
          calls.push(`stream:${t.id}`);
          if (t.id === "found") return { url: "https://example.test/found.mp4", audioUrl: null };
          if (options.direct === "reject") throw new Error("no video");
          if (options.direct === "none") return null;
          return { url: "https://example.test/direct.mp4", audioUrl: null };
        },
      },
      "@/lib/music/video-discovery": {
        searchMusicVideos: async (query: string) => {
          calls.push(`search:${query}`);
          return [{ id: "found" }];
        },
      },
      "./use-hero-layers": { useHeroLayers: () => [] },
    },
    {
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      document: doc,
      matchMedia: () => ({ matches: !!options.reduced }),
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
    },
  );
  const render = (hovering: boolean) => all(h.render({ item: track, hovering }));
  const video = (tree: N[]) => tree.find((n) => n.type === "video");
  const stage = (tree: N[]) => tree.find((n) => n.props.className === "music-hero-video")!;
  async function hoverUntilLoaded() {
    render(true);
    for (const t of timers.pending(700)) t.fn();
    await flushPromises();
    return render(true);
  }
  return { render, video, stage, calls, timers, doc, hoverUntilLoaded };
}

test("only one connector can resolve a video, so a fallback is required", () => {
  // Rust source: nothing here can run it.
  assert.match(connector, /fn resolve_video[\s\S]{0,200}Err\(NO_VIDEO/);
});

test("the hero falls back to searching for a music video when the item's own source has none", async () => {
  const m = heroMedia({ direct: "none" });
  const tree = await m.hoverUntilLoaded();
  assert.deepEqual(m.calls, ["stream:t1", "search:Artist Title", "stream:found"]);
  assert.equal(m.video(tree)?.props.src, "https://example.test/found.mp4");
  const direct = heroMedia({});
  await direct.hoverUntilLoaded();
  assert.deepEqual(direct.calls, ["stream:t1"], "a direct video must be used before searching");
});

test("a failed direct resolve does not abort the preview", async () => {
  const m = heroMedia({ direct: "reject" });
  const tree = await m.hoverUntilLoaded();
  assert.equal(m.video(tree)?.props.src, "https://example.test/found.mp4");
});

test("the preview is only visible while hovering and stays muted and looping", async () => {
  const m = heroMedia({});
  let tree = await m.hoverUntilLoaded();
  const video = m.video(tree)!;
  assert.equal(video.props.muted, true, "a hero preview must never make sound");
  assert.equal(video.props.loop, true);
  assert.equal(m.stage(tree).props["data-on"], undefined, "shown before the video played");
  video.props.onPlaying();
  tree = m.render(true);
  assert.equal(m.stage(tree).props["data-on"], true);
  tree = m.render(false);
  assert.equal(m.stage(tree).props["data-on"], undefined, "shown while not hovering");
});

test("reduced motion and a hidden page suppress the preview", async () => {
  for (const options of [{ reduced: true }, { hidden: true }]) {
    const m = heroMedia(options);
    m.render(true);
    assert.equal(
      m.timers.pending(700).length,
      0,
      `${Object.keys(options)[0]} still loads a preview`,
    );
  }
  const m = heroMedia({});
  m.render(true);
  for (const t of m.timers.pending(700)) t.fn();
  m.doc.hidden = true;
  m.doc.listeners.get("visibilitychange")();
  await flushPromises();
  assert.equal(m.video(m.render(true)), undefined, "hiding the page mid-load kept the preview");
  assert.ok(m.video(await heroMedia({}).hoverUntilLoaded()), "a visible page shows the preview");
});

function homeHero() {
  const timers = clock();
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const element = (type: unknown, props: Record<string, any>) => {
    if (props?.ref && typeof props.ref === "object") props.ref.current = { clientWidth: 600 };
    return { type, props };
  };
  const stub = (name: string) => ({ [name]: name });
  const h = hookHarness(
    "src/views/music/music-home-hero.tsx",
    "MusicHomeHero",
    {
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
      "./music-hero-media": stub("MusicHeroMedia"),
      "./use-hero-layers": { useHeroLayers: () => [] },
      "@/components/music/music-artist-link": stub("MusicArtistLink"),
      "@/components/music/music-taste-icon": stub("MusicTasteIcon"),
      "@/components/music/music-billboard-rank": stub("MusicBillboardRank"),
      "@/components/music/music-item-menu": {
        useMusicItemMenu: () => ({ openFor: () => () => {}, menu: null }),
      },
      "@/lib/use-reduced-motion": { useReducedMotion: () => false },
      "./music-home-rows": { classifyHomeRow: () => "other" },
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, icon) => String(icon) }),
      "@/components/music/music-now-playing-mark": stub("MusicNowPlayingMark"),
      "@/components/music/music-source-picker": {
        useMusicSourcePicker: () => ({ openSourcePicker: () => {} }),
      },
      "@/lib/music/now-playing-key": { nowPlayingMatches: () => false },
      "@/lib/music/use-now-playing": { useMusicNowPlaying: () => ({ phase: "idle" }) },
      "@/components/music/music-service-logo": stub("MusicServiceLogo"),
      "@/components/music/music-skeletons": stub("MusicHomeHeroSkeleton"),
      "@/lib/i18n": { useT: () => (key: string) => key },
      "./music-home.css": {},
    },
    {
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      document: { hidden: false, addEventListener: () => {}, removeEventListener: () => {} },
      IntersectionObserver: class {
        constructor(fn: typeof intersect) {
          intersect = fn;
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
  const items = ["1", "2", "3"].map((id) => ({ id, kind: "track", title: id, artist: "A" }));
  const props = { rows: [{ source: "youtube", title: "r", items }], recent: [], loading: false };
  const render = () => all(h.render(props));
  render();
  intersect([{ isIntersecting: true }]);
  const root = render().find((n) => n.props.className === "music-home-intro")!;
  assert.equal(timers.pending(8000).length, 1, "a visible hero never scheduled its next slide");
  return { root, render, cycles: () => timers.pending(8000).length };
}

test("hovering the hero pauses the carousel", () => {
  const m = homeHero();
  m.root.props.onPointerEnter();
  m.render();
  assert.equal(m.cycles(), 0, "the carousel kept cycling under the pointer");
  m.root.props.onPointerLeave();
  m.render();
  assert.equal(m.cycles(), 1);
});

test("focus pauses the carousel too, for keyboard users", () => {
  const m = homeHero();
  m.root.props.onFocus();
  m.render();
  assert.equal(m.cycles(), 0, "the carousel kept cycling under keyboard focus");
});

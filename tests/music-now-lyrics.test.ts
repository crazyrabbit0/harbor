// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as karaokeScroll from "../src/lib/music/karaoke-scroll.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

const CSS = readFileSync("src/components/music/music-now-playing.css", "utf8");
const LOCALES = ["ar", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "pl", "pt", "ru", "tr", "vi", "zh"];

type N = { type: unknown; key?: unknown; props: Record<string, any> & { children?: unknown } };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];
const text = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text((n as N).props?.children)
        : "";

const LINES = [
  { at: 10, text: "first" },
  { at: 20, text: "" },
  { at: 30, text: "third" },
];
const TRACK = { id: "t1", connectorId: "local", title: "Song", artist: "Artist", mediaKind: "audio" };

class FakeElement {
  offsetTop: number;
  clientHeight = 20;
  constructor(offsetTop: number) {
    this.offsetTop = offsetTop;
  }
}

function nowPlaying(options: { lyrics?: typeof LINES | null; never?: boolean } = {}) {
  const log = { seeks: [] as number[], appearance: [] as object[], scrolls: [] as object[], lyricLoads: 0 };
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let timerId = 0;
  const player = { current: TRACK, currentTime: 0, phase: "playing", queue: [], queueIndex: 0, likedIds: [] };
  const list = {
    clientHeight: 100,
    scrollHeight: 400,
    children: { item: (i: number) => (i >= 0 && i < LINES.length ? new FakeElement(i * 40) : null) },
    scrollTo: (o: object) => log.scrolls.push(o),
  };
  // Refs are attached during render, as React does before effects run.
  const element = (type: unknown, props: N["props"], key?: unknown) => {
    if (type === "ol" && props.className === "music-now-lyrics" && props.ref) props.ref.current = list;
    return { type, props, key };
  };
  const stub = (name: string) => name;
  const h = hookHarness(
    "src/components/music/music-now-playing.tsx",
    "MusicNowPlaying",
    {
      "@/lib/music/liked": { isMusicLiked: () => false },
      "@/lib/music/search-artists": { artistCreditParts: () => ["Artist"] },
      "./music-artist-link": { MusicArtistLink: stub("MusicArtistLink") },
      "@/components/hover-tooltip": { HoverTooltip: stub("HoverTooltip") },
      "./music-listening-details": { MusicListeningDetails: stub("MusicListeningDetails") },
      "@/lib/music/use-recording-profile": {
        useRecordingProfile: (t: unknown) => ({ profile: null, display: t }),
      },
      "react-dom": { createPortal: (tree: unknown) => tree },
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, n) => String(n) }),
      "@/components/icons/music-glyph": { MusicGlyph: stub("MusicGlyph") },
      "@/components/poster": { Poster: stub("Poster") },
      "./music-track-menu": { useMusicTrackContextMenu: () => ({ menu: null, onContextMenu() {} }) },
      "./music-queue-continuation": { MusicQueueContinuation: stub("MusicQueueContinuation") },
      "./music-now-title": { MusicNowTitle: stub("MusicNowTitle") },
      "./music-up-next-row": { MusicUpNextRow: stub("MusicUpNextRow") },
      "./music-video-surface": { MusicVideoSurface: stub("MusicVideoSurface") },
      "./music-video-fullscreen": { MusicVideoFullscreen: stub("MusicVideoFullscreen") },
      "@/lib/music/video-fullscreen": {
        exitMusicVideoFullscreen() {},
        getMusicVideoFullscreen: () => ({ stage: null }),
        subscribeMusicVideoFullscreen: () => () => {},
        toggleMusicVideoFullscreen() {},
      },
      "./music-now-search": { MusicNowSearch: stub("MusicNowSearch") },
      "./music-queue": { musicUpcoming: () => [] },
      "@/components/player/cast-icon": { CastIcon: stub("CastIcon") },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/back-intercept": { pushBackHandler: () => () => {} },
      "@/lib/music/player": {
        useMusicPlayer: () => player,
        seekMusic: (at: number) => log.seeks.push(at),
        toggleMusicLiked() {},
        isMusicVideoActive: () => false,
      },
      "@/lib/music/lyrics": {
        loadTrackLyrics: () => {
          log.lyricLoads++;
          return options.never ? new Promise(() => {}) : Promise.resolve(options.lyrics === undefined ? LINES : options.lyrics);
        },
        lyricIndexAt: (lines: typeof LINES, seconds: number) => {
          let found = -1;
          lines.forEach((line, i) => {
            if (line.at <= seconds) found = i;
          });
          return found;
        },
      },
      "@/lib/music/lyric-offset": {
        LYRIC_OFFSET_STEP: 0.25,
        getLyricOffset: () => 0,
        setLyricOffset: (_t: unknown, s: number) => s,
        shiftedLyricTime: (time: number, offset: number) => time + offset,
      },
      "@/lib/music/karaoke-scroll": karaokeScroll,
      "./music-karaoke": { MusicKaraoke: stub("MusicKaraoke") },
      "@/lib/music/audio-settings": {
        loadMusicAudioDevices: async () => [],
        useMusicAudioSettings: () => ({ settings: {} }),
      },
      "@/lib/music/appearance": {
        setMusicAppearance: (patch: object) => log.appearance.push(patch),
        useMusicAppearance: () => ({ levels: false, artworkColors: false, dockVisualizer: false }),
      },
      "@/lib/music/recovery": { musicSourceName: () => "Local" },
      "./music-service-logo": { MusicServiceLogo: stub("MusicServiceLogo") },
      "./music-quality-badge": { MusicQualityBadge: stub("MusicQualityBadge") },
      "./music-signal-details": {
        MusicSignalDetails: stub("MusicSignalDetails"),
        MusicLevelMeter: stub("MusicLevelMeter"),
      },
      "@/lib/music/audio-meter": { useMusicAudioMeter: () => null },
      "@/lib/music/casting": { getMusicSpeakerState: () => ({ active: false }) },
      "@/lib/music/quality": { musicTrackQuality: () => null },
      "./music-now-playing.css": {},
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    },
    {
      document: {
        createElement: () => ({ style: {}, remove() {} }),
        activeElement: null,
        addEventListener() {},
        removeEventListener() {},
        getElementById: () => null,
      },
      window: {
        setTimeout: (fn: () => void, ms: number) => (timers.set(++timerId, { fn, ms }), timerId),
        clearTimeout: (i: number) => timers.delete(i),
        matchMedia: () => ({ matches: false }),
        addEventListener() {},
        removeEventListener() {},
      },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame() {},
      setTimeout: () => 0,
      clearTimeout() {},
      HTMLElement: FakeElement,
      Element: FakeElement,
      getComputedStyle: () => ({ direction: "ltr" }),
    },
  );
  const props = { inset: 0, dockRef: { current: null }, onClose() {}, onExplore() {}, onAudio() {}, onSpeakers() {}, onSource() {}, onQueue() {} };
  const render = () => h.render(props) as unknown;
  const settle = async () => {
    render();
    await flushPromises();
    return render();
  };
  return { render, settle, log, player, timers, list };
}

const button = (tree: unknown, label: string) =>
  all(tree).find((n) => n.type === "button" && n.props.title === label)!;
const tab = (tree: unknown, id: string) =>
  all(tree).find((n) => n.props.role === "tab" && n.props.id === `music-now-tab-${id}`)!;
const openLyrics = async (n: ReturnType<typeof nowPlaying>) => {
  tab(await n.settle(), "lyrics").props.onClick();
  return n.settle();
};

test("Karaoke sits in the header options row after the visualizer", async () => {
  const tree = await nowPlaying().settle();
  const row = all(tree).find((n) => n.props.className === "music-now-options")!;
  const titles = all(row)
    .filter((n) => n.type === "button")
    .map((b) => b.props.title);
  assert.ok(titles.indexOf("Karaoke") > titles.indexOf("music.now.visualizer"));
  assert.ok(titles.indexOf("music.now.visualizer") >= 0);
});

test("Karaoke is transient local state that opens and closes the shared karaoke view", async () => {
  const n = nowPlaying();
  let tree = await n.settle();
  const karaokeView = () => all(n.render()).find((node) => node.type === "MusicKaraoke")!;
  assert.equal(button(tree, "Karaoke").props["aria-pressed"], false);
  assert.equal(karaokeView().props.open, false);
  button(tree, "Karaoke").props.onClick();
  tree = n.render();
  assert.equal(button(tree, "Karaoke").props["aria-pressed"], true);
  assert.equal(karaokeView().props.open, true);
  karaokeView().props.onClose();
  assert.equal(karaokeView().props.open, false);
  assert.deepEqual(n.log.appearance, [], "karaoke is never written into appearance preferences");
});

test("a track without lyrics disables Karaoke and the lyrics tab", async () => {
  const tree = await nowPlaying({ lyrics: [] }).settle();
  assert.equal(button(tree, "Karaoke").props.disabled, true);
  assert.equal(tab(tree, "lyrics").props.disabled, true);
});

test("lyrics is a tab in the roving tablist and keyboard hops skip a closed lyrics tab", async () => {
  const n = nowPlaying();
  const tree = await n.settle();
  const ids = all(tree)
    .filter((node) => node.props.role === "tab")
    .map((node) => node.props.id.replace("music-now-tab-", ""));
  assert.deepEqual(ids, ["queue", "about", "lyrics", "signal"]);
  assert.deepEqual(
    ids.map((id) => tab(tree, id).props.tabIndex),
    [0, -1, -1, -1],
    "only the selected tab is in the tab order",
  );
  const empty = nowPlaying({ lyrics: [] });
  const closed = await empty.settle();
  tab(closed, "about").props.onKeyDown({
    key: "ArrowRight",
    currentTarget: {},
    preventDefault() {},
  });
  assert.equal(tab(empty.render(), "signal").props["aria-selected"], true, "Right skips lyrics");
});

test("the lyrics panel reads the live engine and highlights the line being sung", async () => {
  const n = nowPlaying();
  n.player.currentTime = 31;
  const tree = await openLyrics(n);
  const items = all(tree).filter((node) => node.type === "li");
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((li) => li.props["data-active"]),
    [undefined, undefined, "1"],
  );
  assert.equal(all(items[1]).some((node) => node.type === "button"), false, "a rest line is not a button");
});

test("the panel covers loading, empty and ready, and a hung lookup gives up", async () => {
  const hung = nowPlaying({ never: true });
  await openLyrics(hung);
  const empty = () => all(hung.render()).find((node) => node.props.className === "music-now-empty");
  assert.equal(text(empty()!), "Finding lyrics");
  const giveUp = [...hung.timers.values()].find((t) => t.ms === 9000);
  assert.ok(giveUp, "the wait is bounded");
  giveUp!.fn();
  hung.render();
  assert.equal(text(empty()!), "No lyrics for this track");
  for (const lyrics of [null, []]) {
    const n = nowPlaying({ lyrics });
    const tree = await n.settle();
    tab(tree, "lyrics").props.onClick();
    const opened = await n.settle();
    assert.equal(
      text(all(opened).find((node) => node.props.className === "music-now-empty")!),
      "No lyrics for this track",
      `an ${lyrics ? "empty" : "absent"} list shows the empty state`,
    );
  }
});

test("clicking a line seeks the player", async () => {
  const n = nowPlaying();
  const opened = await openLyrics(n);
  all(opened)
    .find((node) => node.type === "button" && node.props.children === "third")!
    .props.onClick();
  assert.deepEqual(n.log.seeks, [30]);
});

test("the active line scrolls its own list, and the list returns to the top before the first line", async () => {
  const n = nowPlaying();
  n.player.currentTime = 31;
  await openLyrics(n);
  const last = n.log.scrolls.at(-1) as { top: number; behavior: string };
  assert.equal(last.behavior, "smooth");
  assert.equal(
    last.top,
    karaokeScroll.karaokeScrollTop({ lineTop: 80, lineHeight: 20, viewHeight: 100, maxScroll: 300, anchor: 0.5 }),
  );
  n.player.currentTime = 0;
  n.render();
  assert.deepEqual(n.log.scrolls.at(-1), { top: 0, behavior: "auto" });
  assert.match(CSS, /\n\.music-now-lyrics \{[^}]*overflow-y\s*:\s*auto/);
  assert.match(CSS, /\n\.music-now-lyrics \{[^}]*position\s*:\s*relative/, "offsetTop is measured inside the list");
});

test("lyric lines clear the 44px target floor and stand still under reduced motion", () => {
  const base = CSS.slice(0, CSS.indexOf("@container"));
  const at = base.indexOf("\n.music-now-lyrics button {");
  const rule = base.slice(at, base.indexOf("}", at));
  assert.match(rule, /min-height\s*:\s*(4[4-9]|[5-9]\d)px/);
  const reduced = CSS.slice(CSS.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)/));
  assert.match(reduced, /\.music-now-lyrics button\s*\{\s*transition:\s*none;?\s*\}/);
});

test("Karaoke and the lyric strings exist in every locale, written in each script", async () => {
  const nonLatin = ["ar", "hi", "ja", "ko", "ru", "zh"];
  for (const lang of LOCALES) {
    const source = readFileSync(`src/lib/i18n/locales/${lang}/music.ts`, "utf8");
    const found = /"?Karaoke"?:\s*"([^"]+)"/.exec(source);
    assert.ok(found, `${lang} is missing the Karaoke label`);
    if (nonLatin.includes(lang))
      assert.ok([...found[1]].some((char) => (char.codePointAt(0) ?? 0) > 127), `${lang} left Karaoke in Latin`);
    for (const key of ["Lyrics", "Finding lyrics", "No lyrics for this track"])
      assert.ok(new RegExp(`"?${key}"?:`).test(source), `${lang} is missing ${key}`);
  }
});

import * as karaokeScroll from "../../src/lib/music/karaoke-scroll.ts";
import { flushPromises, hookHarness } from "./hook-harness.ts";

export type N = {
  type: unknown;
  key?: unknown;
  props: Record<string, any> & { children?: unknown };
};
export const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];
export const text = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text((n as N).props?.children)
        : "";

export const LINES = [
  { at: 10, text: "first" },
  { at: 20, text: "" },
  { at: 30, text: "third" },
];
const TRACK = {
  id: "t1",
  connectorId: "local",
  title: "Song",
  artist: "Artist",
  mediaKind: "audio",
};

class FakeElement {
  offsetTop: number;
  clientHeight = 20;
  constructor(offsetTop: number) {
    this.offsetTop = offsetTop;
  }
}

export type NowPlayingOptions = {
  lyrics?: typeof LINES | null;
  never?: boolean;
  upcoming?: (queue: unknown[], index: number, limit: number) => unknown[];
};

/** Runs the real MusicNowPlaying sheet with its imports mocked; refs attach during render. */
export function nowPlaying(options: NowPlayingOptions = {}) {
  const log = {
    seeks: [] as number[],
    appearance: [] as object[],
    scrolls: [] as object[],
    upcoming: [] as unknown[][],
    lyricLoads: 0,
  };
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let timerId = 0;
  const player = {
    current: TRACK,
    currentTime: 0,
    phase: "playing",
    queue: [] as unknown[],
    queueIndex: 0,
    likedIds: [],
  };
  const list = {
    clientHeight: 100,
    scrollHeight: 400,
    children: {
      item: (i: number) => (i >= 0 && i < LINES.length ? new FakeElement(i * 40) : null),
    },
    scrollTo: (o: object) => log.scrolls.push(o),
  };
  const element = (type: unknown, props: N["props"], key?: unknown) => {
    if (type === "ol" && props.className === "music-now-lyrics" && props.ref)
      props.ref.current = list;
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
      "./music-track-menu": {
        useMusicTrackContextMenu: () => ({ menu: null, onContextMenu() {} }),
      },
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
      "./music-queue": {
        musicUpcoming: (queue: unknown[], index: number, limit: number) => {
          log.upcoming.push([queue, index, limit]);
          return options.upcoming ? options.upcoming(queue, index, limit) : [];
        },
      },
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
          return options.never
            ? new Promise(() => {})
            : Promise.resolve(options.lyrics === undefined ? LINES : options.lyrics);
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
  const props = {
    inset: 0,
    dockRef: { current: null },
    onClose() {},
    onExplore() {},
    onAudio() {},
    onSpeakers() {},
    onSource() {},
    onQueue() {},
  };
  const render = (extra: Record<string, unknown> = {}) =>
    h.render({ ...props, ...extra }) as unknown;
  const settle = async (extra: Record<string, unknown> = {}) => {
    render(extra);
    await flushPromises();
    return render(extra);
  };
  return { render, settle, log, player, timers, list };
}

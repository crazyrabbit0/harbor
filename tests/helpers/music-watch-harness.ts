import { MusicQueueOrder } from "../../src/lib/music/queue-order";
import { searchTrackKey } from "../../src/lib/music/now-search";
import type { MusicTrack } from "../../src/lib/music/types";
import { flushPromises, hookHarness, loadModule } from "./hook-harness.ts";

export type WatchNode = { type: unknown; props: Record<string, any>; rendered?: unknown };

export const watchTrack = (id: string, mediaKind: "audio" | "video" = "video"): MusicTrack => ({
  id,
  title: `Title ${id}`,
  artist: `Artist ${id}`,
  artwork: `art-${id}.jpg`,
  durationSeconds: 180,
  durationLabel: "3:00",
  mediaKind,
});

export const allNodes = (n: unknown): WatchNode[] =>
  Array.isArray(n)
    ? n.flatMap(allNodes)
    : n && typeof n === "object"
      ? [
          n as WatchNode,
          ...allNodes((n as WatchNode).props?.children),
          ...allNodes((n as WatchNode).rendered),
        ]
      : [];

export const byClass = (tree: unknown, className: string) =>
  allNodes(tree).filter((n) => n.props?.className === className);

// Local components (Rail, VideoNext, skeletons) render inline so the tree holds their output.
const jsx = (type: unknown, props: WatchNode["props"]): WatchNode =>
  typeof type === "function" ? { type, props, rendered: type(props) } : { type, props };

function loadTransport() {
  const subscribers: unknown[] = [];
  const prefs = new Map<string, string>();
  const transport = loadModule("src/lib/music/transport.ts", {
    react: {
      useSyncExternalStore(subscribe: unknown, snapshot: () => any) {
        subscribers.push(subscribe);
        return snapshot();
      },
    },
    "./queue-order": { MusicQueueOrder },
    "./preferences": {
      readMusicPreference: (key: string) => prefs.get(key) ?? null,
      writeMusicPreference: (key: string, value: string) => prefs.set(key, value),
    },
  });
  return { transport, subscribers };
}

/** Mounts the real MusicWatch page; `prepareFails` makes the video preparation reject. */
export async function mountWatch({
  queue,
  index,
  similar = [],
  modes,
  prepareFails = false,
}: {
  queue: MusicTrack[];
  index: number;
  similar?: MusicTrack[];
  modes?: (transport: Record<string, any>) => void;
  prepareFails?: boolean;
}) {
  const { transport, subscribers } = loadTransport();
  modes?.(transport);
  const plays: { track: MusicTrack; queue: MusicTrack[] }[] = [];
  let resolveSimilar: (page: { tracks: MusicTrack[]; next: null }) => void = () => {};
  const current = queue[index] ?? watchTrack("x");
  const h = hookHarness(
    "src/components/music/music-watch.tsx",
    "MusicWatch",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
      "react-dom": { createPortal: (node: unknown) => node },
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, name) => String(name) }),
      "@/components/music/music-service-logo": { MusicServiceLogo: "MusicServiceLogo" },
      "./music-artist-link": { MusicArtistLink: "MusicArtistLink" },
      "./music-artist-overview": { MusicWhereToBuy: "MusicWhereToBuy" },
      "@/lib/window": { openUrl: async () => {} },
      "@/components/music/music-add-to-playlist": { MusicAddToPlaylist: "MusicAddToPlaylist" },
      "./music-media-badge": { MusicMediaBadge: "MusicMediaBadge" },
      "./music-queue": {
        musicUpcoming: transport.musicUpcoming,
        useMusicTransport: transport.useMusicTransport,
      },
      "@/components/poster": { Poster: "Poster" },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/music/video-pages": {
        appendMusicVideos: (a: MusicTrack[], b: MusicTrack[]) => [...a, ...b],
        searchMusicVideoPage: () =>
          new Promise((resolve) => {
            resolveSimilar = resolve;
          }),
      },
      "@/lib/music/now-search": { searchTrackKey },
      "@/lib/music/video": { prefetchMusicVideoStreams: () => {} },
      "@/lib/music/player": {
        getMusicState: () => ({ current, phase: "playing" }),
        playMusic: async (next: MusicTrack, list: MusicTrack[]) => {
          plays.push({ track: next, queue: list });
        },
        returnMusicToComputer: async () => {},
        toggleMusicLiked: () => {},
        useMusicPlayer: () => ({ queue, queueIndex: index, likedIds: [], current }),
        waitForMusicAudioReady: async () => {
          if (prepareFails) throw new Error("fixture preparation failure");
        },
      },
      "@/lib/music/casting": { getMusicSpeakerState: () => ({ active: false }) },
      "./music-video-surface": { MusicVideoSurface: "MusicVideoSurface" },
      "./music-video-fullscreen": { MusicVideoFullscreen: "MusicVideoFullscreen" },
      "@/lib/music/video-fullscreen": {
        getMusicVideoFullscreen: () => ({ stage: null }),
        subscribeMusicVideoFullscreen: () => () => {},
      },
      "./music-watch.css": {},
    },
    {
      document: { createElement: () => ({ style: {}, parentElement: null, remove() {} }) },
      setTimeout: () => 0,
      clearTimeout: () => {},
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
    },
    ["VideoNext"],
  );
  const props = { track: current, queue, onClose() {} };
  const busy = h.render(props);
  await flushPromises();
  resolveSimilar({ tracks: similar, next: null });
  await flushPromises();
  const loaded = h.render(props);
  const VideoNext = h.exports.VideoNext;
  const rows = (tree: unknown) => allNodes(tree).filter((n) => n.type === VideoNext);
  return {
    busy,
    loaded,
    rows,
    plays,
    transport,
    subscribers,
    current,
    render: () => h.render(props),
  };
}

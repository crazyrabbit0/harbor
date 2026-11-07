import { componentHarness, findElement, stubModule, Stub } from "./component-harness";

const noop = () => {};

/** Fake `document.documentElement` that records the custom properties the dock publishes. */
export function fakeRoot() {
  const properties = new Map<string, string>();
  return {
    properties,
    documentElement: {
      dataset: {} as Record<string, string>,
      style: {
        setProperty: (name: string, value: string) => void properties.set(name, value),
        removeProperty: (name: string) => void properties.delete(name),
      },
    },
  };
}

/** Runs the real `MusicDock` with every child stubbed and a track playing. */
export function musicDockHarness() {
  const root = fakeRoot();
  const tracker = { installs: 0, removals: 0 };
  const track = { id: "t1", connectorId: "youtube", title: "Song", artist: "Artist" };
  const player = {
    current: track,
    phase: "playing",
    volume: 0.5,
    currentTime: 10,
    duration: 100,
    queue: [track],
    queueIndex: 0,
    likedIds: [],
    error: null,
  };
  const harness = componentHarness(
    "src/components/music/music-dock.tsx",
    "MusicDock",
    {
      "@/lib/viewport-bottom": {
        trackViewportBottom: () => {
          tracker.installs++;
          return () => void tracker.removals++;
        },
      },
      "@/lib/app-features": { appFeatures: () => ({ cast: false }) },
      "@/lib/music/liked": { isMusicLiked: () => false },
      "@/lib/back-intercept": { pushBackHandler: () => noop },
      "@/components/modal-shell": {
        useModalExit: (onClose: () => void) => ({ closing: false, close: onClose }),
      },
      "@/lib/music/search-artists": { artistCreditParts: (name: string) => [name] },
      "./music-artist-link": stubModule(),
      "@/lib/music/use-recording-profile": {
        useRecordingProfile: (current: unknown) => ({ profile: null, display: current }),
      },
      "@/components/icons/music-glyph": stubModule(),
      "./music-queue": {
        MusicQueue: Stub,
        cycleMusicRepeat: noop,
        toggleMusicShuffle: noop,
        useMusicTransport: () => ({ shuffle: false, repeat: "off" }),
      },
      "@/components/poster": stubModule(),
      "@/components/player/cast-icon": stubModule(),
      "@/components/slider": stubModule(),
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/music/player": {
        clearMusicError: noop,
        closeMusicPlayer: async () => {},
        getMusicState: () => player,
        isMusicVideoActive: () => false,
        nextMusic: noop,
        previousMusic: noop,
        playMusic: async () => {},
        seekMusic: noop,
        setMusicVolume: noop,
        toggleMusicLiked: noop,
        toggleMusicPlayback: noop,
        useMusicPlayer: () => player,
      },
      "@/lib/view": {
        useViewActions: () => ({ setView: noop }),
        useViewSelector: (select: (v: unknown) => unknown) => select({ topKind: "home" }),
      },
      "@/lib/settings": {
        useSettingsSelector: (select: (s: unknown) => unknown) =>
          select({ musicSeekThumb: false, musicSeekThumbHover: false }),
      },
      "./music-source-picker": stubModule(),
      "./music-connections": stubModule(),
      "./music-service-logo": stubModule(),
      "./music-quality-badge": stubModule(),
      "./music-track-menu": {
        useMusicTrackContextMenu: () => ({ onContextMenu: noop, menu: null }),
      },
      "@/lib/music/dock-layout": { useMusicDockLayout: () => ({}) },
      "./music-dock-visualizer": stubModule(),
      "./music-like-button": stubModule(),
      "./music-miku-visualizer": stubModule(),
      "./music-gif-visualizer": stubModule(),
      "./music-dock-overflow": stubModule(),
      "./music-dock-tooltip": stubModule(),
      "@/lib/music/playback-origin": stubModule(),
      "@/lib/music/navigation": stubModule(),
      "./music-now-playing": stubModule(),
      "@/lib/music/appearance": {
        useMusicAppearance: () => ({}),
        useMusicArtworkColor: () => null,
      },
      "@/lib/music/recovery": stubModule(),
      "@/lib/music/audio-settings": {
        musicVolumeCeiling: () => 1,
        useMusicAudioSettings: noop,
      },
      "@/lib/music/casting": {
        getMusicSpeakerState: () => ({ active: false }),
        subscribeMusicSpeakerState: () => noop,
      },
      "./music-dock.css": {},
    },
    {
      window: {
        addEventListener: noop,
        removeEventListener: noop,
        setTimeout: () => 1,
        clearTimeout: noop,
        setInterval: () => 1,
        clearInterval: noop,
      },
      document: root,
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
    },
  );
  return {
    properties: root.properties,
    tracker,
    render: () => harness.render(),
    /** Presses the dock's hide button and renders the collapsed tab. */
    collapse() {
      const tree = harness.render();
      findElement(tree, (el) => "data-music-dock-hide" in el.props)!.props.onClick();
      return harness.render();
    },
    unmount: () => harness.unmount(),
  };
}

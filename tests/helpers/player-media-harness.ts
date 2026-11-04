import { emptySnapshot, type PlayerSnapshot } from "../../src/lib/player/bridge.ts";
import * as sdh from "../../src/lib/subtitles/sdh-filter.ts";
import { hookHarness } from "./hook-harness.ts";

type Options = {
  preflightSettled?: boolean;
  windows?: boolean;
  engine?: "mpv" | "html5";
  settings?: Record<string, unknown>;
  snap?: Partial<PlayerSnapshot>;
  bridgeReady?: boolean;
};

// Runs use-player-media with every child hook stubbed; `calls` holds the last arguments per stub and `subVisible` each setSubVisible.
export function playerMediaHarness(options: Options = {}) {
  const calls = new Map<string, unknown[]>();
  const subVisible: boolean[] = [];
  const record =
    (name: string, result: unknown = undefined) =>
    (...args: unknown[]) => {
      calls.set(name, args);
      return result;
    };
  const noop = () => {};
  const autoSync = {
    status: "idle",
    offer: null,
    applyOffer: noop,
    revert: noop,
    retry: noop,
    run: noop,
    stop: noop,
    feedback: noop,
    suspendForManualTiming: noop,
  };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": {},
    "@/lib/download-text": { downloadText: noop },
    "@/lib/subtitles/extract": { getCuesAnySource: noop },
    "@/lib/subtitles/serialize": { toSrt: noop },
    "@/lib/platform": { isWindowsDesktop: () => options.windows ?? false },
    "@/lib/player/sub-format": { isAssTrack: () => false, isImageSubTrack: () => false },
    "@/lib/player/imported-subs": { clearImportedSubs: noop },
    "@/lib/player-volume": { readPlayerVolume: () => ({ volume: 1, muted: false }) },
    "@/lib/player-actions": { setPlayerActions: noop },
    "@/lib/settings": {},
    "@/lib/simkl/scrobble-hook": { useSimklScrobble: noop },
    "@/lib/trakt/scrobble-hook": { useTraktScrobble: noop },
    "@/lib/media-server/progress-sync": { useMediaServerProgress: noop },
    "@/lib/torrent/local-engine": {
      claimTorrentPlaybackHandoff: noop,
      confirmTorrentUsage: noop,
      localEngineStreamRef: () => null,
      releaseTorrentUsage: noop,
      retainTorrentUsage: noop,
    },
    "@/lib/torrent/full-download": {
      startFullDownload: noop,
      stopAllFullDownloads: noop,
      stopFullDownload: noop,
    },
    "./use-exit-snapshot": { useExitSnapshot: () => ({ captureExitSnapshot: noop }) },
    "./use-power-inhibit": { usePowerInhibit: noop },
    "./use-resume-autosave": { useResumeAutosave: noop },
    "./use-stremio-sync": { useStremioSync: noop },
    "./use-sub-drop": { useSubDrop: () => null },
    "./use-sub-style-apply": { useSubStyleApply: record("useSubStyleApply") },
    "./use-ass-normalize": { useAssNormalize: () => null },
    "./use-track-autoload": {
      useTrackAutoload: record("useTrackAutoload", {
        resolvedImdbId: "tt1",
        resolvedImdbVerified: true,
        resolutionSettled: true,
        subtitleSearchActive: false,
        subtitlePreflightSettled: options.preflightSettled ?? true,
      }),
    },
    "./use-translation-auto-select": { useTranslationAutoSelect: noop },
    "./use-secondary-sub": { useSecondarySub: noop },
    "./use-auto-sync": { useAutoSync: record("useAutoSync", autoSync) },
    "@/components/player/autosync/autosync-store": { publishAutoSync: noop },
    "./use-video-download": { useVideoDownload: () => ({ start: noop }) },
    "./use-webview-memory": { useWebviewMemory: noop },
    "@/lib/player/captions-popout-state": { useCaptionsPopoutOpen: () => false },
    "@/lib/subtitles/sdh-filter": sdh,
  };
  const h = hookHarness("src/views/player/hooks/use-player-media.ts", "usePlayerMedia", mocks);
  const bridge = { setSubVisible: (v: boolean) => subVisible.push(v), setMediaInfo: noop };
  const result = h.render({
    src: { url: "https://media.test/a.mkv", meta: { id: "tt1", name: "Movie" } },
    snap: {
      ...emptySnapshot,
      subtitleTracks: [{ id: "1", lang: "en", forced: true, selected: true }],
      ...options.snap,
    },
    engine: options.engine ?? "mpv",
    settings: { subHideSdh: true, ...options.settings },
    authKey: null,
    bridgeRef: { current: bridge },
    bridgeReady: options.bridgeReady ?? false,
    bridgeKey: 1,
    svpActive: false,
    videoMountRef: { current: null },
    toggleFullscreen: noop,
    castActiveRef: { current: false },
    season: undefined,
    episode: undefined,
  });
  return { calls, subVisible, result };
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { useT } from "@/lib/i18n";
import type { ActionFeedback } from "@/components/player/action-indicator";
import type { PlayerBridge, PlayerSnapshot, TrackInfo } from "@/lib/player/bridge";
import { useClipRecorder } from "./use-clip-recorder";
import { useFrameGrab } from "./use-frame-grab";
import { useGifRecorder } from "./use-gif-recorder";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import { useLiveChannelOverlay } from "./use-live-channel-overlay";
import { useSleepTimer } from "./use-sleep-timer";
import { useVideoFill, ZOOM_STEP } from "./use-video-fill";
import type { AbLoopState } from "./use-ab-loop";

export function usePlayerHotkeys(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  snap: PlayerSnapshot;
  metaId: string;
  svpActive: boolean;
  drawMode: boolean;
  setDrawMode: Dispatch<SetStateAction<boolean>>;
  closePlayer: () => Promise<void>;
  returnToPreview?: () => void;
  playPauseToggle: () => void;
  seekStep: (delta: number) => void;
  seekTo: (sec: number) => void;
  toggleFullscreen: () => void;
  togglePip: () => void;
  fullscreen: boolean;
  cycleSubtitles: (direction: 1 | -1) => TrackInfo | null | undefined;
  cycleAudio?: (direction: 1 | -1) => TrackInfo | undefined;
  onDownload?: () => void;
  onCast?: () => void;
  onEditLayout?: () => void;
  playNext: () => void;
  playPrev: () => void;
  hasNextEpisode: boolean;
  hasPrevEpisode: boolean;
  toggleSwitcher: () => void;
  toggleEpisodePanel: () => void;
  liveOverlay: ReturnType<typeof useLiveChannelOverlay>;
  toggleDvr: () => void;
  sleep: ReturnType<typeof useSleepTimer>;
  quickToolsEnabled: boolean;
  frameGrab: ReturnType<typeof useFrameGrab>;
  gif: ReturnType<typeof useGifRecorder>;
  clip: ReturnType<typeof useClipRecorder>;
  videoFill: ReturnType<typeof useVideoFill>;
  onToggleAnime4k?: () => void;
  onAnime4kOn?: () => void;
  onAnime4kOff?: () => void;
  onReloadSource?: () => void;
  onRestartServer?: () => void;
  onVolumeFeedback?: (volume: number, muted: boolean) => void;
  onSpeedFeedback?: (rate: number) => void;
  onOsd?: (feedback: ActionFeedback) => void;
  ab?: AbLoopState;
}) {
  const {
    bridgeRef,
    snap,
    metaId,
    svpActive,
    drawMode,
    setDrawMode,
    closePlayer,
    returnToPreview,
    playPauseToggle,
    seekStep,
    seekTo,
    toggleFullscreen,
    togglePip,
    fullscreen,
    cycleSubtitles,
    cycleAudio,
    onDownload,
    onCast,
    onEditLayout,
    playNext,
    playPrev,
    hasNextEpisode,
    hasPrevEpisode,
    toggleSwitcher,
    toggleEpisodePanel,
    liveOverlay,
    toggleDvr,
    sleep,
    quickToolsEnabled,
    frameGrab,
    gif,
    clip,
    videoFill,
    onToggleAnime4k,
    onAnime4kOn,
    onAnime4kOff,
    onReloadSource,
    onRestartServer,
    onVolumeFeedback,
    onSpeedFeedback,
    onOsd,
    ab,
  } = params;

  const t = useT();
  const [showStats, setShowStatsState] = useState(false);
  const statsToggled = useRef(false);
  const setShowStats = useCallback((updater: (prev: boolean) => boolean) => {
    statsToggled.current = true;
    setShowStatsState(updater);
  }, []);
  useEffect(() => {
    if (!statsToggled.current) return;
    statsToggled.current = false;
    onOsd?.({ icon: "stats", title: t("Stats"), value: showStats ? t("On") : t("Off") });
  }, [showStats, onOsd, t]);
  const { holdSpeedActive, subtitleOffsetSec } = useKeyboardShortcuts({
    bridgeRef,
    snap,
    drawMode,
    setDrawMode,
    closePlayer,
    returnToPreview,
    playPauseToggle,
    seekStep,
    seekTo,
    toggleFullscreen,
    togglePip,
    fullscreen,
    cycleSubtitles,
    cycleAudio,
    onDownload,
    onCast,
    onEditLayout,
    setShowStats,
    metaId,
    svpActive,
    onNextEp: hasNextEpisode ? playNext : undefined,
    onPrevEp: hasPrevEpisode ? playPrev : undefined,
    hasNextEp: hasNextEpisode,
    hasPrevEp: hasPrevEpisode,
    toggleSwitcher,
    toggleEpisodePanel,
    toggleGuide: () => {
      if (liveOverlay.isLive) liveOverlay.setOpen((o) => !o);
    },
    toggleDvr: () => {
      if (liveOverlay.isLive) toggleDvr();
    },
    toggleSleep: () => {
      if (sleep.mode.kind === "off") {
        sleep.set({ kind: "end_episode" });
        onOsd?.({ icon: "sleep", title: t("Sleep timer"), value: t("End ep") });
      } else {
        sleep.cancel();
        onOsd?.({ icon: "sleep", title: t("Sleep timer"), value: t("Off") });
      }
    },
    onScreenshot: quickToolsEnabled ? () => frameGrab.trigger() : undefined,
    onGifRecord: quickToolsEnabled ? () => gif.toggle() : undefined,
    onClipRecord: quickToolsEnabled ? () => clip.openChooser() : undefined,
    onToggleCrop: () => videoFill.cycle(),
    onPanscanUp: () => videoFill.step(ZOOM_STEP),
    onPanscanDown: () => videoFill.step(-ZOOM_STEP),
    onPrevChannel: liveOverlay.isLive ? liveOverlay.goPrevChannel : undefined,
    onToggleAnime4k,
    onAnime4kOn,
    onAnime4kOff,
    onReloadSource,
    onRestartServer,
    onFrameStep: (dir) => bridgeRef.current?.frameStep?.(dir),
    onVolumeFeedback,
    onSpeedFeedback,
    onOsd,
    onLoopStart: quickToolsEnabled ? ab?.setA : undefined,
    onLoopEnd: quickToolsEnabled ? ab?.setB : undefined,
    onLoopClear: quickToolsEnabled ? ab?.clear : undefined,
  });

  const toggleStats = useCallback(() => setShowStats((v) => !v), [setShowStats]);
  return { holdSpeedActive, showStats, toggleStats, subtitleOffsetSec };
}

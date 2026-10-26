import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerBridge, PlayerSnapshot, TrackInfo } from "@/lib/player/bridge";
import { writePlayerPrefs } from "@/lib/player-prefs";
import { writePlayerVolume } from "@/lib/player-volume";
import {
  digitFromEvent,
  effectiveBinding,
  eventToBinding,
  isTypingTarget,
  type HotkeyId,
} from "@/lib/hotkeys";
import { isWindowsDesktop } from "@/lib/platform";
import { isRtxHdrBlocked, isRtxVsrBlocked } from "@/lib/player/rtx-video-policy";
import { mediaKeyGate } from "@/lib/media-session";
import { setVideoOwnsMediaKeys } from "@/lib/player/media-key-owner";
import { useSettingsSelector, useSettingsUpdate } from "@/lib/settings";
import { isAnyFullscreen, exitAnyFullscreen } from "@/lib/fullscreen-state";
import { isBigPictureActive } from "@/lib/big-picture";
import { getLeaveConfirm, openLeaveConfirm } from "@/lib/player/leave-confirm";
import { isPlayerInteractionLocked } from "@/lib/player/interaction-lock";
import { flashJumpMarks } from "@/lib/player/jump-marks";
import { round2 } from "../player-utils";
import { SPEED_MAX, SPEED_MIN } from "@/components/player/speed-indicator";
import { SFX } from "@/lib/sfx";
import type { ActionFeedback } from "@/components/player/action-indicator";
import { useT } from "@/lib/i18n";
import { fmtTime } from "@/components/player/transport/transport-utils";
import { subtitleTrackLanguageLabel } from "@/lib/subtitles/track-label";
import { trackLanguageName } from "@/lib/subtitles/language";

export function useKeyboardShortcuts(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  snap: PlayerSnapshot;
  drawMode: boolean;
  setDrawMode: (v: boolean) => void;
  closePlayer: () => void;
  returnToPreview?: () => void;
  playPauseToggle: () => void;
  seekStep: (delta: number) => void;
  seekTo: (sec: number) => void;
  onFrameStep?: (dir: 1 | -1) => void;
  toggleFullscreen: () => void;
  togglePip?: () => void;
  fullscreen: boolean;
  cycleSubtitles: (direction: 1 | -1) => TrackInfo | null | undefined;
  cycleAudio?: (direction: 1 | -1) => TrackInfo | undefined;
  onDownload?: () => void;
  onCast?: () => void;
  onEditLayout?: () => void;
  setShowStats: (updater: (prev: boolean) => boolean) => void;
  metaId: string;
  svpActive: boolean;
  onNextEp?: () => void;
  onPrevEp?: () => void;
  hasNextEp?: boolean;
  hasPrevEp?: boolean;
  toggleSwitcher?: () => void;
  toggleEpisodePanel?: () => void;
  toggleGuide?: () => void;
  toggleDvr?: () => void;
  toggleSleep?: () => void;
  onScreenshot?: () => void;
  onGifRecord?: () => void;
  onClipRecord?: () => void;
  onToggleCrop?: () => void;
  onPanscanUp?: () => void;
  onPanscanDown?: () => void;
  onPrevChannel?: () => void;
  onToggleAnime4k?: () => void;
  onAnime4kOn?: () => void;
  onAnime4kOff?: () => void;
  onReloadSource?: () => void;
  onRestartServer?: () => void;
  onVolumeFeedback?: (volume: number, muted: boolean) => void;
  onSpeedFeedback?: (rate: number) => void;
  onOsd?: (feedback: ActionFeedback) => void;
  onLoopStart?: () => void;
  onLoopEnd?: () => void;
  onLoopClear?: () => void;
}) {
  const {
    bridgeRef,
    snap,
    drawMode,
    setDrawMode,
    closePlayer,
    returnToPreview,
    playPauseToggle,
    seekStep,
    seekTo,
    onFrameStep,
    toggleFullscreen,
    togglePip,
    cycleSubtitles,
    cycleAudio,
    onDownload,
    onCast,
    onEditLayout,
    setShowStats,
    metaId,
    svpActive,
    onNextEp,
    onPrevEp,
    hasNextEp,
    hasPrevEp,
    toggleSwitcher,
    toggleEpisodePanel,
    toggleGuide,
    toggleDvr,
    toggleSleep,
    onScreenshot,
    onGifRecord,
    onClipRecord,
    onToggleCrop,
    onPanscanUp,
    onPanscanDown,
    onPrevChannel,
    onToggleAnime4k,
    onAnime4kOn,
    onAnime4kOff,
    onReloadSource,
    onRestartServer,
    onVolumeFeedback,
    onSpeedFeedback,
    onOsd,
    onLoopStart,
    onLoopEnd,
    onLoopClear,
  } = params;
  const t = useT();
  const settings = useSettingsSelector((s) => ({
    hotkeys: s.hotkeys,
    playerConfirmLeave: s.playerConfirmLeave,
    playerEscExitsFullscreen: s.playerEscExitsFullscreen,
    playerHdrToSdr: s.playerHdrToSdr,
    playerRtxHdr: s.playerRtxHdr,
    playerRtxVsr: s.playerRtxVsr,
    playerVolumeSfx: s.playerVolumeSfx,
    seekBackStepLongSec: s.seekBackStepLongSec,
    seekBackStepSec: s.seekBackStepSec,
    seekBackStepShortSec: s.seekBackStepShortSec,
    seekForwardStepLongSec: s.seekForwardStepLongSec,
    seekForwardStepSec: s.seekForwardStepSec,
    seekForwardStepShortSec: s.seekForwardStepShortSec,
    volumeBoostMax: s.volumeBoostMax,
  }));
  const update = useSettingsUpdate();
  const overrides = settings.hotkeys ?? {};
  const seekBackStepSec = settings.seekBackStepSec;
  const seekForwardStepSec = settings.seekForwardStepSec;
  const seekBackStepShortSec = settings.seekBackStepShortSec;
  const seekForwardStepShortSec = settings.seekForwardStepShortSec;
  const seekBackStepLongSec = settings.seekBackStepLongSec;
  const seekForwardStepLongSec = settings.seekForwardStepLongSec;
  const [subtitleOffsetSec, setSubtitleOffsetSec] = useState<number | null>(null);
  const subtitleOffsetTimerRef = useRef<number | null>(null);
  const showSubtitleOffset = (delaySec: number) => {
    setSubtitleOffsetSec(delaySec);
    if (subtitleOffsetTimerRef.current != null) {
      window.clearTimeout(subtitleOffsetTimerRef.current);
    }
    subtitleOffsetTimerRef.current = window.setTimeout(() => {
      setSubtitleOffsetSec(null);
      subtitleOffsetTimerRef.current = null;
    }, 1800);
  };
  useEffect(
    () => () => {
      if (subtitleOffsetTimerRef.current != null) {
        window.clearTimeout(subtitleOffsetTimerRef.current);
      }
    },
    [],
  );

  const togglePlayRef = useRef(() => {});
  togglePlayRef.current = () => {
    const pausing = mediaRef.current.status === "playing";
    playPauseToggle();
    onOsd?.({
      icon: pausing ? "pause" : "play",
      title: t("Playback"),
      value: pausing ? t("Paused") : t("Resumed"),
    });
  };

  const holdRef = useRef<{
    key: string | null;
    timer: number | null;
    engaged: boolean;
    baseRate: number;
  }>({ key: null, timer: null, engaged: false, baseRate: 1 });
  const [holdSpeedActive, setHoldSpeedActive] = useState(false);
  const mediaRef = useRef({
    status: snap.status,
    muted: snap.muted,
    volume: snap.volume,
    seekBackStepSec,
    seekForwardStepSec,
    playPauseToggle,
    seekStep,
    seekTo,
    onNextEp,
    onPrevEp,
    hasNextEp,
    hasPrevEp,
  });
  mediaRef.current = {
    status: snap.status,
    muted: snap.muted,
    volume: snap.volume,
    seekBackStepSec,
    seekForwardStepSec,
    playPauseToggle,
    seekStep,
    seekTo,
    onNextEp,
    onPrevEp,
    hasNextEp,
    hasPrevEp,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        document.querySelector('[data-harbor-player][data-detached="true"]') &&
        !e.key.startsWith("Media")
      )
        return;
      const dock = document.querySelector('[data-harbor-player][data-docked="true"]');
      if (dock && !dock.contains(e.target as Node) && !e.key.startsWith("Media")) return;
      if (isPlayerInteractionLocked()) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      // The in-player layout editor owns the keyboard while it is open.
      if (document.querySelector("[data-layout-editor]")) return;
      if (isTypingTarget(e)) return;

      const binding = eventToBinding(e);
      const match = (id: HotkeyId): boolean => effectiveBinding(id, overrides) === binding;
      const seekBy = (delta: number) => {
        seekStep(delta);
        const n = Math.abs(delta);
        onOsd?.({
          icon: delta < 0 ? "rewind" : "forward",
          title: t("Seek"),
          value: `${delta < 0 ? "−" : "+"}${n}s`,
        });
      };
      const jumpTo = (sec: number, icon: "jump" | "start" | "end" = "jump") => {
        seekTo(sec);
        onOsd?.({ icon, title: t("Position"), value: fmtTime(sec) });
      };

      if (e.key === "MediaPlayPause") {
        e.preventDefault();
        if (mediaKeyGate()) togglePlayRef.current();
        return;
      }
      if (e.key === "MediaPlay") {
        e.preventDefault();
        if (mediaRef.current.status !== "playing" && mediaKeyGate()) togglePlayRef.current();
        return;
      }
      if (e.key === "MediaPause" || e.key === "MediaStop") {
        e.preventDefault();
        if (mediaRef.current.status === "playing" && mediaKeyGate()) togglePlayRef.current();
        return;
      }
      if (e.key === "MediaTrackNext" && hasNextEp && onNextEp) {
        e.preventDefault();
        if (mediaKeyGate()) onNextEp();
        return;
      }
      if (e.key === "MediaTrackPrevious" && hasPrevEp && onPrevEp) {
        e.preventDefault();
        if (mediaKeyGate()) onPrevEp();
        return;
      }

      if (match("playerClose")) {
        if (getLeaveConfirm().open) return;
        if (drawMode) {
          setDrawMode(false);
          return;
        }
        if (returnToPreview) {
          e.preventDefault();
          returnToPreview();
          return;
        }
        void (async () => {
          if (
            settings.playerEscExitsFullscreen &&
            !isBigPictureActive() &&
            (await isAnyFullscreen())
          ) {
            await exitAnyFullscreen();
            return;
          }
          if (settings.playerConfirmLeave) {
            openLeaveConfirm((remember) => {
              if (remember) update({ playerConfirmLeave: false });
              closePlayer();
            });
            return;
          }
          closePlayer();
        })();
        return;
      }
      if (match("playerPip")) {
        e.preventDefault();
        togglePip?.();
        return;
      }
      if (match("playerPlayPause")) {
        e.preventDefault();
        if (e.repeat) return;
        const h = holdRef.current;
        h.key = e.key;
        h.baseRate = snap.rate;
        h.timer = window.setTimeout(() => {
          h.timer = null;
          h.engaged = true;
          setHoldSpeedActive(true);
          bridgeRef.current?.setRate(Math.max(2, h.baseRate));
        }, 350);
        return;
      }
      if (match("playerSeekBack10")) {
        e.preventDefault();
        seekBy(-seekBackStepSec);
        return;
      }
      if (match("playerSeekForward10")) {
        e.preventDefault();
        seekBy(seekForwardStepSec);
        return;
      }
      if (match("playerSeekBackShort")) {
        e.preventDefault();
        seekBy(-seekBackStepShortSec);
        return;
      }
      if (match("playerSeekForwardShort")) {
        e.preventDefault();
        seekBy(seekForwardStepShortSec);
        return;
      }
      if (match("playerSeekBack30")) {
        e.preventDefault();
        seekBy(-seekBackStepLongSec);
        return;
      }
      if (match("playerSeekForward30")) {
        e.preventDefault();
        seekBy(seekForwardStepLongSec);
        return;
      }
      if (match("playerFrameForward") && onFrameStep) {
        e.preventDefault();
        onFrameStep(1);
        onOsd?.({ icon: "frame-forward", title: t("Next frame"), value: "" });
        return;
      }
      if (match("playerFrameBack") && onFrameStep) {
        e.preventDefault();
        onFrameStep(-1);
        onOsd?.({ icon: "frame-back", title: t("Previous frame"), value: "" });
        return;
      }
      if (match("playerVolumeUp")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.5 : 0.05;
        const max =
          bridgeRef.current?.capabilities().engine === "mpv"
            ? Math.max(1, Math.min(6, settings.volumeBoostMax || 2))
            : 1;
        const next = Math.min(max, Math.max(0, snap.volume + step));
        bridgeRef.current?.setVolume(next);
        bridgeRef.current?.setMuted(false);
        writePlayerVolume({ volume: next, muted: false });
        onVolumeFeedback?.(next, false);
        if (settings.playerVolumeSfx) SFX.volumeChange(true);
        return;
      }
      if (match("playerVolumeDown")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.5 : 0.05;
        const max =
          bridgeRef.current?.capabilities().engine === "mpv"
            ? Math.max(1, Math.min(6, settings.volumeBoostMax || 2))
            : 1;
        const next = Math.min(max, Math.max(0, snap.volume - step));
        bridgeRef.current?.setVolume(next);
        bridgeRef.current?.setMuted(false);
        writePlayerVolume({ volume: next, muted: false });
        onVolumeFeedback?.(next, false);
        if (settings.playerVolumeSfx) SFX.volumeChange(false);
        return;
      }
      if (match("playerMute")) {
        e.preventDefault();
        const next = !snap.muted;
        bridgeRef.current?.setMuted(next);
        writePlayerVolume({ muted: next });
        onVolumeFeedback?.(snap.volume, next);
        if (settings.playerVolumeSfx) SFX.volumeChange(true);
        return;
      }
      if (match("playerFullscreen")) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (match("playerCrop") && onToggleCrop) {
        e.preventDefault();
        onToggleCrop();
        return;
      }
      if (match("playerAnime4kToggle") && onToggleAnime4k) {
        e.preventDefault();
        onToggleAnime4k();
        return;
      }
      if (match("playerAnime4kOn") && onAnime4kOn) {
        e.preventDefault();
        onAnime4kOn();
        return;
      }
      if (match("playerAnime4kOff") && onAnime4kOff) {
        e.preventDefault();
        onAnime4kOff();
        return;
      }
      if (match("playerRtxHdrToggle")) {
        e.preventDefault();
        if (e.repeat) return;
        if (!isWindowsDesktop() || isRtxHdrBlocked(settings.playerHdrToSdr, svpActive)) return;
        if (bridgeRef.current?.capabilities().engine !== "mpv") return;
        update({ playerRtxHdr: !settings.playerRtxHdr });
        onOsd?.({
          icon: "video",
          title: t("RTX Video HDR"),
          value: settings.playerRtxHdr ? t("Off") : t("On"),
        });
        return;
      }
      if (match("playerRtxVsrToggle")) {
        e.preventDefault();
        if (e.repeat) return;
        if (!isWindowsDesktop() || isRtxVsrBlocked(svpActive)) return;
        if (bridgeRef.current?.capabilities().engine !== "mpv") return;
        update({ playerRtxVsr: !settings.playerRtxVsr });
        onOsd?.({
          icon: "video",
          title: t("RTX Video Super Resolution"),
          value: settings.playerRtxVsr ? t("Off") : t("On"),
        });
        return;
      }
      if (match("playerPanscanUp") && onPanscanUp) {
        e.preventDefault();
        onPanscanUp();
        return;
      }
      if (match("playerPanscanDown") && onPanscanDown) {
        e.preventDefault();
        onPanscanDown();
        return;
      }
      if (match("playerPrevChannel") && onPrevChannel) {
        e.preventDefault();
        onPrevChannel();
        return;
      }
      const cycleForward = match("playerSubtitleCycle") || match("playerSubtitleCycleAlt");
      if (cycleForward || match("playerSubtitleCycleBack")) {
        e.preventDefault();
        const track = cycleSubtitles(cycleForward ? 1 : -1);
        if (track !== undefined) {
          onOsd?.(
            track
              ? {
                  icon: "subtitles",
                  title: t("Subtitles"),
                  value: t(subtitleTrackLanguageLabel(track)),
                }
              : { icon: "subtitles-off", title: t("Subtitles"), value: t("Off") },
          );
        }
        return;
      }
      const audioForward = match("playerAudioCycle");
      if ((audioForward || match("playerAudioCycleBack")) && cycleAudio) {
        e.preventDefault();
        const track = cycleAudio(audioForward ? 1 : -1);
        if (track) {
          onOsd?.({
            icon: "audio",
            title: t("Audio"),
            value: track.title || trackLanguageName(track.lang, track.title),
          });
        }
        return;
      }
      if (match("playerDownload") && onDownload) {
        e.preventDefault();
        if (!e.repeat) onDownload();
        return;
      }
      if (match("playerCast") && onCast) {
        e.preventDefault();
        if (!e.repeat) onCast();
        return;
      }
      if (match("playerEditLayout") && onEditLayout) {
        e.preventDefault();
        if (!e.repeat) onEditLayout();
        return;
      }
      if (match("playerNextEpisode") && hasNextEp && onNextEp) {
        e.preventDefault();
        onNextEp();
        return;
      }
      if (match("playerPrevEpisode") && hasPrevEp && onPrevEp) {
        e.preventDefault();
        onPrevEp();
        return;
      }
      if (match("playerLoopStart") && onLoopStart) {
        e.preventDefault();
        if (!e.repeat) onLoopStart();
        return;
      }
      if (match("playerLoopEnd") && onLoopEnd) {
        e.preventDefault();
        if (!e.repeat) onLoopEnd();
        return;
      }
      if (match("playerLoopClear") && onLoopClear) {
        e.preventDefault();
        if (!e.repeat) onLoopClear();
        return;
      }
      if (match("playerStart")) {
        e.preventDefault();
        jumpTo(0, "start");
        return;
      }
      if (match("playerEnd")) {
        e.preventDefault();
        if (snap.durationSec > 0) jumpTo(snap.durationSec - 0.5, "end");
        return;
      }
      if (match("playerStats")) {
        e.preventDefault();
        setShowStats((v) => !v);
        return;
      }
      if (match("playerSpeedDown")) {
        e.preventDefault();
        const r = Math.max(SPEED_MIN, +(snap.rate - 0.25).toFixed(2));
        bridgeRef.current?.setRate(r);
        writePlayerPrefs(metaId, { rate: r });
        onSpeedFeedback?.(r);
        return;
      }
      if (match("playerSpeedUp")) {
        e.preventDefault();
        const r = Math.min(SPEED_MAX, +(snap.rate + 0.25).toFixed(2));
        bridgeRef.current?.setRate(r);
        writePlayerPrefs(metaId, { rate: r });
        onSpeedFeedback?.(r);
        return;
      }
      if (match("playerSubDelayDown")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.05 : 0.1;
        const delay = round2(snap.subDelaySec - step);
        bridgeRef.current?.setSubDelay(delay);
        showSubtitleOffset(delay);
        writePlayerPrefs(metaId, { subDelaySec: delay });
        return;
      }
      if (match("playerSubDelayUp")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.05 : 0.1;
        const delay = round2(snap.subDelaySec + step);
        bridgeRef.current?.setSubDelay(delay);
        showSubtitleOffset(delay);
        writePlayerPrefs(metaId, { subDelaySec: delay });
        return;
      }
      if (match("playerStreamSwitcher") && toggleSwitcher) {
        e.preventDefault();
        toggleSwitcher();
        return;
      }
      if (match("playerEpisodePanel") && toggleEpisodePanel) {
        e.preventDefault();
        toggleEpisodePanel();
        return;
      }
      if (match("playerTvGuide") && toggleGuide) {
        e.preventDefault();
        toggleGuide();
        return;
      }
      if (match("playerDvr") && toggleDvr) {
        e.preventDefault();
        toggleDvr();
        return;
      }
      if (match("playerSleep") && toggleSleep) {
        e.preventDefault();
        toggleSleep();
        return;
      }
      if (match("playerScreenshot") && onScreenshot) {
        e.preventDefault();
        if (e.repeat) return;
        onScreenshot();
        return;
      }
      if (match("playerGifRecord") && onGifRecord) {
        e.preventDefault();
        if (e.repeat) return;
        onGifRecord();
        return;
      }
      if (match("playerClipRecord") && onClipRecord) {
        e.preventDefault();
        if (e.repeat) return;
        onClipRecord();
        return;
      }
      if (match("playerReloadSource") && onReloadSource) {
        e.preventDefault();
        if (e.repeat) return;
        onReloadSource();
        return;
      }
      if (match("playerRestartServer") && onRestartServer) {
        e.preventDefault();
        if (e.repeat) return;
        onRestartServer();
        return;
      }
      const digit = digitFromEvent(e, effectiveBinding("playerJumpDigits", overrides));
      if (digit != null) {
        e.preventDefault();
        flashJumpMarks();
        if (digit === 0) jumpTo(0, "start");
        else if (snap.durationSec > 0) jumpTo((snap.durationSec * digit) / 10);
        return;
      }
    };
    const releaseHold = () => {
      const h = holdRef.current;
      h.key = null;
      if (h.timer != null) {
        window.clearTimeout(h.timer);
        h.timer = null;
        return "tap" as const;
      }
      if (h.engaged) {
        h.engaged = false;
        setHoldSpeedActive(false);
        bridgeRef.current?.setRate(h.baseRate);
      }
      return "held" as const;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const h = holdRef.current;
      if (isPlayerInteractionLocked()) {
        if (e.cancelable) e.preventDefault();
        if (h.key != null && e.key === h.key) releaseHold();
        return;
      }
      if (h.key == null || e.key !== h.key) return;
      if (releaseHold() !== "tap") return;
      togglePlayRef.current();
    };
    const onBlur = () => {
      if (holdRef.current.key != null) releaseHold();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    closePlayer,
    returnToPreview,
    togglePip,
    drawMode,
    snap.muted,
    snap.volume,
    snap.rate,
    snap.durationSec,
    snap.subDelaySec,
    overrides,
    seekBackStepSec,
    seekForwardStepSec,
    seekBackStepShortSec,
    seekForwardStepShortSec,
    seekBackStepLongSec,
    seekForwardStepLongSec,
    seekTo,
    toggleSwitcher,
    toggleEpisodePanel,
    toggleGuide,
    toggleDvr,
    toggleSleep,
    onScreenshot,
    onGifRecord,
    onClipRecord,
    onToggleCrop,
    onPanscanUp,
    onPanscanDown,
    onPrevChannel,
    onToggleAnime4k,
    onAnime4kOn,
    onAnime4kOff,
    onReloadSource,
    onRestartServer,
    onFrameStep,
    cycleAudio,
    onDownload,
    onCast,
    onEditLayout,
    onVolumeFeedback,
    onSpeedFeedback,
    onOsd,
    onLoopStart,
    onLoopEnd,
    onLoopClear,
    t,
    settings.playerEscExitsFullscreen,
    settings.playerConfirmLeave,
    settings.playerVolumeSfx,
    settings.playerHdrToSdr,
    settings.playerRtxHdr,
    settings.playerRtxVsr,
    svpActive,
    update,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    setVideoOwnsMediaKeys(true);
    let dead = false;
    let cleanup: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const u1 = await listen<string>("harbor://media-key", (e) => {
        const m = mediaRef.current;
        const playing = m.status === "playing";
        switch (e.payload) {
          case "playpause":
            if (mediaKeyGate()) togglePlayRef.current();
            break;
          case "play":
            if (!playing && mediaKeyGate()) togglePlayRef.current();
            break;
          case "pause":
          case "stop":
            if (playing && mediaKeyGate()) togglePlayRef.current();
            break;
          case "next":
            if (m.hasNextEp && m.onNextEp && mediaKeyGate()) m.onNextEp();
            break;
          case "previous":
            if (m.hasPrevEp && m.onPrevEp && mediaKeyGate()) m.onPrevEp();
            break;
        }
      });
      const u2 = await listen<number>("harbor://media-seek-relative", (e) => {
        if (typeof e.payload === "number" && Number.isFinite(e.payload)) {
          mediaRef.current.seekStep(e.payload);
        }
      });
      const u3 = await listen<number>("harbor://media-seek-absolute", (e) => {
        if (typeof e.payload === "number" && Number.isFinite(e.payload)) {
          mediaRef.current.seekTo(e.payload);
        }
      });
      const u4 = await listen<number>("harbor://media-set-volume", (e) => {
        if (typeof e.payload === "number" && Number.isFinite(e.payload)) {
          const vol = Math.max(0, Math.min(1, e.payload));
          bridgeRef.current?.setVolume(vol);
          bridgeRef.current?.setMuted(false);
          writePlayerVolume({ volume: vol, muted: false });
          onVolumeFeedback?.(vol, false);
        }
      });
      const u5 = await listen<string>("harbor://taskbar-button", (e) => {
        if (isPlayerInteractionLocked()) return;
        const m = mediaRef.current;
        switch (e.payload) {
          case "toggle":
            togglePlayRef.current();
            break;
          case "back":
            m.seekStep(-m.seekBackStepSec);
            break;
          case "forward":
            m.seekStep(m.seekForwardStepSec);
            break;
          case "previous":
            if (m.hasPrevEp) m.onPrevEp?.();
            break;
          case "next":
            if (m.hasNextEp) m.onNextEp?.();
            break;
          case "mute": {
            const next = !m.muted;
            bridgeRef.current?.setMuted(next);
            writePlayerVolume({ muted: next });
            onVolumeFeedback?.(m.volume, next);
            break;
          }
        }
      });
      const stop = () => {
        u1();
        u2();
        u3();
        u4();
        u5();
      };
      if (dead) stop();
      else cleanup = stop;
    });
    return () => {
      dead = true;
      setVideoOwnsMediaKeys(false);
      cleanup?.();
    };
  }, []);

  return { holdSpeedActive, subtitleOffsetSec };
}

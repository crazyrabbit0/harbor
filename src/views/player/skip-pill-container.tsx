import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlaybackPosition } from "@/lib/player/playback-clock";
import { SkipPill } from "@/components/player/skip-pill";
import { BpSkipPill } from "@/views/big-picture/player/bp-skip-pill";
import { activeSegment, type SkipSegment } from "@/lib/skip-intro";
import { useSettings } from "@/lib/settings";
import { effectiveBinding, eventToBinding, isTypingTarget } from "@/lib/hotkeys";
import { isPlayerInteractionLocked } from "@/lib/player/interaction-lock";
import type { SpoilerMask } from "@/lib/spoilers";
import type { PlayEpisode } from "@/lib/view";

const UNDO_SKIP_MS = 4000;
const EMPTY_DISMISSED = new Set<string>();

const segmentKey = (s: SkipSegment) =>
  `${s.kind}:${Math.round(s.startSec)}:${Math.round(s.endSec)}`;

export function nextEpisodeLead(setting: number, durationSec: number): number {
  if (setting === 0) return 0;
  if (setting > 0) return setting;
  return Math.min(45, Math.max(15, Math.round(durationSec * 0.04)));
}

export function SkipPillContainer({
  engine,
  skipSegments,
  durationSec,
  hasNextEpisode,
  hasNextEpDisplay,
  nextEp,
  nextEpMask,
  visible,
  allowAutoSkip = true,
  tenFoot = false,
  onSkip,
  onNextEpisode,
  onCancelAutoNext,
}: {
  engine: "html5" | "mpv";
  skipSegments: SkipSegment[];
  durationSec: number;
  hasNextEpisode: boolean;
  hasNextEpDisplay: boolean;
  nextEp: PlayEpisode | null;
  nextEpMask?: SpoilerMask;
  visible: boolean;
  allowAutoSkip?: boolean;
  /** Swap the mouse pill for the D-pad one. All the timing logic is shared. */
  tenFoot?: boolean;
  onSkip: (sec: number) => void;
  onNextEpisode: () => void;
  onCancelAutoNext: () => void;
}) {
  const { settings } = useSettings();
  const positionSec = usePlaybackPosition();
  const realActiveSkip = activeSegment(skipSegments, positionSec);
  const leadSec = nextEpisodeLead(settings.nextEpisodeLeadSec, durationSec);
  const syntheticOutro = useMemo(() => {
    if (realActiveSkip) return null;
    if (!hasNextEpisode) return null;
    if (durationSec <= 0) return null;
    if (leadSec <= 0) return null;
    const remaining = durationSec - positionSec;
    if (remaining > leadSec || remaining < 0.5) return null;
    const hasRealOutro = skipSegments.some((s) => s.kind === "outro");
    if (hasRealOutro) return null;
    return {
      kind: "outro" as const,
      startSec: Math.max(0, durationSec - leadSec),
      endSec: durationSec,
      source: "chapters" as const,
    };
  }, [realActiveSkip, hasNextEpisode, durationSec, positionSec, skipSegments, leadSec]);
  const remainingSec = Math.max(0, durationSec - positionSec);

  const [undoState, setUndoState] = useState<{
    segments: SkipSegment[];
    undo: { fromSec: number; key: string } | null;
  }>({ segments: skipSegments, undo: null });
  if (undoState.segments !== skipSegments) {
    setUndoState({ segments: skipSegments, undo: null });
  }
  const undo = undoState.segments === skipSegments ? undoState.undo : null;
  const setUndo = useCallback(
    (next: { fromSec: number; key: string } | null) => {
      setUndoState({ segments: skipSegments, undo: next });
    },
    [skipSegments],
  );
  const skipActionRef = useRef<() => void>(() => {});
  const undoActionRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), UNDO_SKIP_MS);
    return () => clearTimeout(id);
  }, [undo, setUndo]);

  const autoSkippedRef = useRef<SkipSegment | null>(null);
  useEffect(() => {
    autoSkippedRef.current = null;
  }, [skipSegments]);
  useEffect(() => {
    if (!allowAutoSkip || positionSec <= 0 || !realActiveSkip) return;
    const wantSkip =
      (realActiveSkip.kind === "intro" && settings.autoSkipIntro) ||
      (realActiveSkip.kind === "recap" && settings.autoSkipRecap) ||
      (realActiveSkip.kind === "outro" && settings.autoSkipOutro) ||
      (realActiveSkip.kind === "ad" && settings.autoSkipAd);
    if (!wantSkip) return;
    if (autoSkippedRef.current === realActiveSkip) return;
    autoSkippedRef.current = realActiveSkip;
    setUndo({ fromSec: positionSec, key: segmentKey(realActiveSkip) });
    onSkip(realActiveSkip.endSec);
  }, [
    settings.autoSkipIntro,
    settings.autoSkipRecap,
    settings.autoSkipOutro,
    settings.autoSkipAd,
    allowAutoSkip,
    positionSec,
    realActiveSkip,
    onSkip,
    setUndo,
  ]);

  const [hideState, setHideState] = useState<{
    segments: SkipSegment[];
    autoHiddenKey: string | null;
    dismissedKeys: Set<string>;
  }>({ segments: skipSegments, autoHiddenKey: null, dismissedKeys: EMPTY_DISMISSED });
  if (hideState.segments !== skipSegments) {
    setHideState({ segments: skipSegments, autoHiddenKey: null, dismissedKeys: EMPTY_DISMISSED });
  }
  const autoHiddenKey = hideState.segments === skipSegments ? hideState.autoHiddenKey : null;
  const dismissedKeys =
    hideState.segments === skipSegments ? hideState.dismissedKeys : EMPTY_DISMISSED;
  const prevSkipKeyRef = useRef<string | null>(null);
  useEffect(() => {
    prevSkipKeyRef.current = null;
  }, [skipSegments]);
  const buttonKey = realActiveSkip && settings.showSkipButton ? segmentKey(realActiveSkip) : null;
  useEffect(() => {
    if (!buttonKey || settings.skipButtonHideSec <= 0) return;
    const id = window.setTimeout(
      () =>
        setHideState((cur) =>
          cur.segments === skipSegments ? { ...cur, autoHiddenKey: buttonKey } : cur,
        ),
      settings.skipButtonHideSec * 1000,
    );
    return () => window.clearTimeout(id);
  }, [buttonKey, settings.skipButtonHideSec, skipSegments]);
  useEffect(() => {
    if (prevSkipKeyRef.current && prevSkipKeyRef.current !== buttonKey) {
      const previousKey = prevSkipKeyRef.current;
      setHideState((cur) => {
        if (cur.segments !== skipSegments) return cur;
        const nextAuto = cur.autoHiddenKey === previousKey ? null : cur.autoHiddenKey;
        let nextDismissed = cur.dismissedKeys;
        if (cur.dismissedKeys.has(previousKey)) {
          nextDismissed = new Set(cur.dismissedKeys);
          nextDismissed.delete(previousKey);
        }
        if (nextAuto === cur.autoHiddenKey && nextDismissed === cur.dismissedKeys) return cur;
        return { ...cur, autoHiddenKey: nextAuto, dismissedKeys: nextDismissed };
      });
    }
    prevSkipKeyRef.current = buttonKey;
  }, [buttonKey, skipSegments]);
  const skipHidden =
    buttonKey != null && (buttonKey === autoHiddenKey || dismissedKeys.has(buttonKey));
  const displaySkip = settings.showSkipButton && !skipHidden ? realActiveSkip : null;
  const activeSkip = displaySkip ?? syntheticOutro;

  const shared = {
    segment: activeSkip,
    hasNextEp: hasNextEpDisplay && leadSec > 0,
    nextEp,
    nextEpMask,
    remainingSec,
    leadSec,
    visible,
    onSkip: () => {
      if (!activeSkip) return;
      if (activeSkip === displaySkip) {
        setUndo({ fromSec: positionSec, key: segmentKey(activeSkip) });
      }
      onSkip(activeSkip.endSec);
    },
    onNextEpisode,
    onCancelAutoNext,
    onDismiss:
      displaySkip && buttonKey
        ? () =>
            setHideState((cur) => {
              const base = cur.segments === skipSegments ? cur.dismissedKeys : EMPTY_DISMISSED;
              const next = new Set(base);
              next.add(buttonKey);
              return {
                segments: skipSegments,
                autoHiddenKey: cur.segments === skipSegments ? cur.autoHiddenKey : null,
                dismissedKeys: next,
              };
            })
        : undefined,
  };

  // Undo brings the segment's Skip button back even if it had timed out or been dismissed.
  const undoSkip = undo
    ? () => {
        setHideState((cur) => {
          if (cur.segments !== skipSegments) return cur;
          const nextAuto = cur.autoHiddenKey === undo.key ? null : cur.autoHiddenKey;
          let nextDismissed = cur.dismissedKeys;
          if (cur.dismissedKeys.has(undo.key)) {
            nextDismissed = new Set(cur.dismissedKeys);
            nextDismissed.delete(undo.key);
          }
          if (nextAuto === cur.autoHiddenKey && nextDismissed === cur.dismissedKeys) return cur;
          return { ...cur, autoHiddenKey: nextAuto, dismissedKeys: nextDismissed };
        });
        setUndo(null);
        onSkip(undo.fromSec);
      }
    : undefined;

  useEffect(() => {
    skipActionRef.current = () => {
      if (!realActiveSkip) return;
      setUndo({ fromSec: positionSec, key: segmentKey(realActiveSkip) });
      onSkip(realActiveSkip.endSec);
    };
  });
  useEffect(() => {
    undoActionRef.current = () => undoSkip?.();
  });
  const skipBinding = effectiveBinding("playerSkipSegment", settings.hotkeys ?? {});
  const undoBinding = effectiveBinding("playerUndoSkip", settings.hotkeys ?? {});
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e) || isPlayerInteractionLocked()) return;
      const binding = eventToBinding(e);
      if (binding === skipBinding) {
        e.preventDefault();
        skipActionRef.current();
      } else if (binding === undoBinding) {
        e.preventDefault();
        undoActionRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skipBinding, undoBinding]);

  const dismissUndo = undo ? () => setUndo(null) : undefined;

  if (tenFoot) return <BpSkipPill {...shared} onUndo={undoSkip} onDismissUndo={dismissUndo} />;
  return <SkipPill engine={engine} {...shared} onUndo={undoSkip} onDismissUndo={dismissUndo} />;
}

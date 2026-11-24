import { useEffect, useRef, useState } from "react";
import type { ActionFeedback, ActionIndicatorState } from "@/components/player/action-indicator";

const OSD_MS = 1200;

/** The action HUD shown after a hotkey or crop change; shares its slot and timing with volume and speed. */
export function usePlayerOsd() {
  const [state, setState] = useState<ActionIndicatorState>({ visible: false, feedback: null });
  const timer = useRef<number | null>(null);
  const hide = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    setState((current) => (current.visible ? { ...current, visible: false } : current));
  };
  const flash = (feedback: ActionFeedback) => {
    setState({ visible: true, feedback });
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setState((current) => ({ ...current, visible: false }));
      timer.current = null;
    }, OSD_MS);
  };
  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );
  return { state, flash, hide };
}

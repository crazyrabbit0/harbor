import { type Dispatch, type SetStateAction } from "react";
import {
  DEFAULT_DEFAULT_CONFIG,
  DEFAULT_STREMIO_CONFIG,
  PANEL_META,
  type ControlVariant,
  type PanelCorner,
  type PanelId,
  type PlayerChromeConfig,
  type PlayerControlConfig,
  type PlayerControlId,
  type PlayerSlot,
  type ThemeId,
} from "@/lib/player-chrome";
import { moveControlOrder, moveControlSlot, placeControl } from "./config-helpers";

const THEME_BASELINES: Record<ThemeId, PlayerChromeConfig> = {
  default: DEFAULT_DEFAULT_CONFIG,
  stremio: DEFAULT_STREMIO_CONFIG,
};

export function useChromeEdits(
  setDraft: Dispatch<SetStateAction<PlayerChromeConfig>>,
  selectedId: PlayerControlId | null,
  theme: ThemeId,
) {
  const moveSlot = (dir: -1 | 1) => {
    if (!selectedId) return;
    setDraft((cur) => moveControlSlot(cur, selectedId, dir));
  };

  const moveOrder = (dir: -1 | 1) => {
    if (!selectedId) return;
    setDraft((cur) => moveControlOrder(cur, selectedId, dir));
  };

  const dropControl = (
    id: PlayerControlId,
    slot: PlayerSlot | "hidden",
    beforeId: PlayerControlId | null,
  ) => {
    setDraft((cur) => placeControl(cur, id, slot, beforeId));
  };

  const toggleHidden = () => {
    if (!selectedId) return;
    setDraft((cur) => ({
      ...cur,
      controls: cur.controls.map((c) => (c.id === selectedId ? { ...c, hidden: !c.hidden } : c)),
    }));
  };

  const unhideControl = (id: PlayerControlId) => {
    setDraft((cur) => ({
      ...cur,
      controls: cur.controls.map((c) => (c.id === id ? { ...c, hidden: false } : c)),
    }));
  };

  const resetControl = () => {
    if (!selectedId) return;
    const baseline = THEME_BASELINES[theme].controls.find((c) => c.id === selectedId);
    if (!baseline) return;
    setDraft((cur) => {
      const nextIcons = { ...cur.customIcons };
      for (const k of Object.keys(nextIcons)) {
        if (k === selectedId || k.startsWith(`${selectedId}:`)) delete nextIcons[k];
      }
      return {
        ...cur,
        controls: cur.controls.map((c) => (c.id === selectedId ? { ...baseline } : c)),
        customIcons: nextIcons,
      };
    });
  };

  const setCustomIcon = (id: PlayerControlId, dataUrl: string | null, state?: string) => {
    setDraft((cur) => {
      const nextIcons = { ...cur.customIcons };
      const k = state ? `${id}:${state}` : id;
      if (dataUrl == null) delete nextIcons[k];
      else nextIcons[k] = dataUrl;
      return { ...cur, customIcons: nextIcons };
    });
  };

  const setVariant = (id: PlayerControlId, variant: ControlVariant | null) => {
    setDraft((cur) => ({
      ...cur,
      controls: cur.controls.map((c) => {
        if (c.id !== id) return c;
        const next: PlayerControlConfig = { ...c };
        if (variant == null) delete next.variant;
        else next.variant = variant;
        return next;
      }),
    }));
  };

  const setPanelCorner = (id: PanelId, corner: PanelCorner) => {
    setDraft((cur) => {
      const panels = { ...cur.panels };
      const prev = panels[id];
      panels[id] = { corner, hidden: prev?.hidden ?? false };
      return { ...cur, panels };
    });
  };

  const togglePanelHidden = (id: PanelId) => {
    setDraft((cur) => {
      const panels = { ...cur.panels };
      const prev = panels[id];
      panels[id] = {
        corner: prev?.corner ?? PANEL_META[id].defaultCorner,
        hidden: !prev?.hidden,
      };
      return { ...cur, panels };
    });
  };

  return {
    moveSlot,
    moveOrder,
    dropControl,
    toggleHidden,
    unhideControl,
    resetControl,
    setCustomIcon,
    setVariant,
    setPanelCorner,
    togglePanelHidden,
  };
}

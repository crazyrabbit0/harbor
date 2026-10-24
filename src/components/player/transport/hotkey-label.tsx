import type { ReactNode } from "react";
import {
  effectiveBinding,
  formatHotkeyBinding,
  storedHotkeyOverrides,
  type HotkeyId,
} from "@/lib/hotkeys";

// Reads the settings mirror, so it also works in the layout editor preview, which renders outside the player.
export function hotkeyText(id: HotkeyId): string {
  return formatHotkeyBinding(id, effectiveBinding(id, storedHotkeyOverrides()));
}

/** The key chips used in player menus; one chip per modifier or key, so "Shift + [" reads as two. */
export function KeyChips({
  ids = [],
  keys = [],
  tone = "menu",
}: {
  ids?: HotkeyId[];
  keys?: string[];
  tone?: "menu" | "tip";
}) {
  const combos = [...ids.map(hotkeyText), ...keys].filter(Boolean);
  if (!combos.length) return null;
  const chip =
    tone === "tip"
      ? "border-white/15 bg-white/10 text-white/90"
      : "border-edge-soft bg-canvas/60 text-ink-muted";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {combos.map((combo, i) => (
        <span key={combo} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[10px] opacity-60">/</span>}
          {combo.split(" + ").map((part) => (
            <kbd
              key={part}
              className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border px-1 font-sans text-[11px] font-semibold leading-none ${chip}`}
            >
              {part}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

/** A tooltip label followed by the action's current keys as chips. */
export function withHotkey(label: string, ...ids: HotkeyId[]): ReactNode {
  if (!ids.some((id) => hotkeyText(id))) return label;
  return (
    <span className="inline-flex items-center gap-2">
      <span>{label}</span>
      <KeyChips ids={ids} tone="tip" />
    </span>
  );
}

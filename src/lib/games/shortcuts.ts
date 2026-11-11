import type { GameShortcuts } from "@/lib/generated/games-library-ipc";
export type { GameShortcuts };
export type GameShortcutTarget = "desktop" | "startMenu";

export function shortcutError(reason: unknown) {
  const code = String(reason);
  return `games.setupShortcuts.${code === "shortcut_exists" ? "exists" : code.startsWith("launch_") ? "missing" : code === "shortcut_platform" ? "unsupported" : "error"}`;
}

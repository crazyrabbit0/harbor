import type { Settings } from "./types";

export function effectiveOrderProvider(
  settings: Pick<Settings, "episodeOrderProvider">,
): "tvdb" | "tmdb" {
  return settings.episodeOrderProvider === "tmdb" ? "tmdb" : "tvdb";
}

export function tvdbPanelEnabled(
  settings: Pick<Settings, "episodeOrderProvider" | "tvdbOrderPanel">,
): boolean {
  return settings.tvdbOrderPanel && effectiveOrderProvider(settings) === "tvdb";
}

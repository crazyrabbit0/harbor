import type { AppFeatures } from "@/lib/generated/app-ipc";

/** False for a search entry whose section this build does not render; only the Games display section is feature-gated. */
export function settingsOptionBuilt(
  option: { section: string; anchorTitle?: string },
  features: AppFeatures,
): boolean {
  return features.games || option.anchorTitle !== "Games" || option.section !== "theme";
}

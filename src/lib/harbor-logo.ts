import { useSettingsSelector } from "@/lib/settings";
import { getThemeById } from "@/lib/theme";

export function useHarborLogo(): { mark: string | null; wordmark: string | null } {
  const settings = useSettingsSelector((s) => ({
    customLogoMark: s.customLogoMark,
    customLogoWordmark: s.customLogoWordmark,
    theme: s.theme,
  }));
  const preset = settings.theme.preset !== "custom" ? getThemeById(settings.theme.preset) : null;
  return {
    mark: settings.customLogoMark || preset?.logo?.mark || null,
    wordmark: settings.customLogoWordmark || preset?.logo?.wordmark || null,
  };
}

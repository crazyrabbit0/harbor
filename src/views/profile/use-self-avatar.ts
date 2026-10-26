import { useProfiles } from "@/lib/profiles";
import { useSettingsSelector } from "@/lib/settings";
import { currentAuthor } from "@/lib/theme-auth";

export function useSelfAvatar(): { handle: string | null; avatar: string | undefined } {
  const { activeProfile } = useProfiles();
  const settings = useSettingsSelector((s) => ({ harborAvatar: s.harborAvatar }));
  const author = currentAuthor();
  return {
    handle: author?.handle ?? null,
    avatar: activeProfile?.avatar ?? settings.harborAvatar ?? author?.avatar ?? undefined,
  };
}

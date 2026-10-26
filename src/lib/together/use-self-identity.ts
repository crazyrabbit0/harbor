import { useAuth } from "@/lib/auth";
import { useProfiles } from "@/lib/profiles";
import { useSettingsSelector } from "@/lib/settings";

export function useSelfIdentity(): { avatar: string | null; color: string | null } {
  const { user } = useAuth();
  const settings = useSettingsSelector((s) => ({
    harborAvatar: s.harborAvatar,
    harborColor: s.harborColor,
  }));
  const { activeProfile } = useProfiles();
  return {
    avatar: activeProfile?.avatar ?? settings.harborAvatar ?? user?.avatar ?? null,
    color: settings.harborColor || activeProfile?.color || null,
  };
}

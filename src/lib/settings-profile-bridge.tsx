import { useEffect } from "react";
import { useProfiles } from "./profiles";
import { useSettingsActions } from "./settings";

export function SettingsProfileBridge() {
  const { activeProfile } = useProfiles();
  const { switchProfile } = useSettingsActions();
  useEffect(() => {
    if (activeProfile) switchProfile(activeProfile.id, activeProfile.settingsLinked !== false);
  }, [activeProfile?.id, activeProfile?.settingsLinked, switchProfile]);
  return null;
}

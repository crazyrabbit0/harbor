import { activeStoredProfile, readRoster } from "@/lib/profile-roster";

export function activeProfileId(): string {
  return readRoster().activeId || "default";
}

export function activeProfileIsPrimary(): boolean {
  if (readRoster().profiles.length === 0) return true;
  return activeStoredProfile()?.isPrimary === true;
}

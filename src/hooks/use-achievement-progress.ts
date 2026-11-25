import { useEffect, useState } from "react";
import type { SteamAccount } from "./use-steam-account";
import { steamAccountError, type SteamAchievements } from "@/lib/games/steam-account";

type Progress = {
  identity: string;
  personal: SteamAchievements | null;
  reading: boolean;
  reason: string;
  notOwned: boolean;
};

type LinkedProgress = Pick<Progress, "personal" | "reason" | "notOwned">;

async function readLinkedProgress(
  readLinked: (appId: number) => Promise<SteamAchievements>,
  appId: number,
  linkedId: string,
): Promise<LinkedProgress> {
  try {
    const linked = await readLinked(appId);
    const personal = linked.appId === appId && linked.steamId === linkedId ? linked : null;
    return { personal, reason: "", notOwned: false };
  } catch (error) {
    return {
      personal: null,
      reason: steamAccountError(error),
      notOwned: error === "steam_account_not_owned",
    };
  }
}

/** Read-only progress shared by the detail preview and public achievement list. */
export function useAchievementProgress(
  appId: number,
  profile: string,
  account?: SteamAccount,
  active = true,
  attempt = 0,
) {
  const linkedId = account?.status.connected ? account.status.snapshot?.steamId : undefined;
  const readLinked = account?.achievements;
  const identity = JSON.stringify([profile, appId, linkedId ?? null]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [prevRun, setPrevRun] = useState({ active, identity, attempt, readLinked });
  const changed =
    prevRun.active !== active ||
    prevRun.identity !== identity ||
    prevRun.attempt !== attempt ||
    prevRun.readLinked !== readLinked;
  if (changed) {
    setPrevRun({ active, identity, attempt, readLinked });
    if (active)
      setProgress({ identity, personal: null, reading: true, reason: "", notOwned: false });
  }
  useEffect(() => {
    if (!active) return;
    let current = true;
    void (async () => {
      // Only the linked-account web request: the native Steam client would update presence and playtime.
      const result =
        linkedId && readLinked
          ? await readLinkedProgress(readLinked, appId, linkedId)
          : { personal: null, reason: "", notOwned: false };
      if (current)
        setProgress({
          identity,
          personal: result.personal,
          reading: false,
          reason: result.personal ? "" : result.reason,
          notOwned: result.notOwned,
        });
    })();
    return () => {
      current = false;
    };
  }, [appId, profile, identity, linkedId, readLinked, active, attempt]);
  // Never show the previous game's/account's earned state during an identity change.
  return progress?.identity === identity
    ? progress
    : { personal: null, reading: active, reason: "", notOwned: false };
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { osClass } from "@/lib/platform";
import {
  battleNetAccountError,
  emptyBattleNetAccount,
  type BattleNetAccountStatus,
} from "@/lib/games/battlenet-account";

export function useBattleNetAccount(profile: string, active: boolean) {
  const available = isTauri() && osClass() === "windows";
  const [held, setHeld] = useState({ profile, value: emptyBattleNetAccount(), loaded: false });
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [importing, setImporting] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<{
    profile: string;
    installed: boolean;
    uninstalled: boolean;
  } | null>(null);
  const owner = useRef(profile),
    mounted = useRef(true),
    revision = useRef(0);
  useLayoutEffect(() => {
    owner.current = profile;
  }, [profile]);
  const running = useRef<{ profile: string; request: string } | null>(null),
    lock = useRef(false);
  const stored = held.profile === profile ? held.value : emptyBattleNetAccount();
  const status =
    preferences?.profile === profile
      ? {
          ...stored,
          importInstalled: preferences.installed,
          importUninstalled: preferences.uninstalled,
        }
      : stored;
  const loaded = held.profile === profile && held.loaded;
  const cancel = useCallback(() => {
    const operation = running.current;
    if (!operation) return;
    running.current = null;
    revision.current++;
    lock.current = false;
    void invoke("games_battlenet_cancel", operation).catch(() => {});
    if (mounted.current) {
      setBusy(false);
      setImporting(null);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [cancel]);
  const [prevProfile, setPrevProfile] = useState(profile);
  if (prevProfile !== profile) {
    setPrevProfile(profile);
    setBusy(false);
    setPreferences(null);
    setError(null);
  }
  useEffect(() => {
    cancel();
    revision.current++;
    lock.current = false;
  }, [profile, cancel]);
  const update = useCallback(
    async (command: string, args: Record<string, unknown> = {}) => {
      if (!available || lock.current) return false;
      lock.current = true;
      const serial = ++revision.current;
      setBusy(true);
      setError(null);
      if (command === "games_battlenet_preferences")
        setPreferences({
          profile,
          installed: args.installed as boolean,
          uninstalled: args.uninstalled as boolean,
        });
      if (command === "games_battlenet_import") {
        running.current = { profile, request: args.request as string };
        setImporting(profile);
      }
      const live = () => mounted.current && owner.current === profile;
      return invoke<BattleNetAccountStatus>(command, { profile, ...args })
        .then((value) => {
          if (live() && serial === revision.current) setHeld({ profile, value, loaded: true });
          return serial === revision.current;
        })
        .catch((reason: unknown) => {
          if (live() && serial === revision.current) setError(battleNetAccountError(reason));
          return false;
        })
        .finally(() => {
          if (serial !== revision.current) return;
          running.current = null;
          lock.current = false;
          if (mounted.current) setImporting(null);
          if (live()) {
            setBusy(false);
            setPreferences(null);
          }
        });
    },
    [available, profile],
  );
  const attempted = useRef("");
  useEffect(() => {
    if (!active || !available || loaded || attempted.current === profile) return;
    attempted.current = profile;
    void update("games_battlenet_account");
  }, [active, available, loaded, profile, update]);
  const importAccount = (fresh: boolean) =>
    update("games_battlenet_import", { fresh, request: crypto.randomUUID() });
  return {
    profile,
    available,
    status,
    loaded,
    busy,
    canCancel: busy && importing === profile,
    error,
    cancel,
    connect: () => importAccount(true),
    refresh: () => importAccount(false),
    reload: () => update("games_battlenet_account"),
    disconnect: () => update("games_battlenet_disconnect"),
    preferences: (installed: boolean, uninstalled: boolean) =>
      update("games_battlenet_preferences", { installed, uninstalled }),
    dismissError: () => setError(null),
  };
}
export type BattleNetAccount = ReturnType<typeof useBattleNetAccount>;

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { osClass } from "@/lib/platform";
import { useSteamShortcutLaunch } from "./use-steam-shortcut-launch";
import { useSteamShortcutActivity } from "./use-steam-shortcut-activity";
import type { ShortcutActivityEvent } from "@/lib/games/steam-shortcut-activity";
import type { SteamShortcutScan as WireSteamShortcutScan } from "@/lib/generated/games-launchers-ipc";
import {
  readSteamShortcutSettings,
  selectedShortcutAccount,
  shortcutError,
  steamShortcutGames,
  steamShortcutKey,
  type SteamShortcut,
  type SteamShortcutScan,
  type SteamShortcutSettings,
} from "@/lib/games/steam-shortcuts";

function withArtworkUrls(wire: WireSteamShortcutScan): SteamShortcutScan {
  const value: SteamShortcutScan = { ...wire, games: [] };
  value.games = wire.games.map((game) => ({
    ...game,
    artwork: Object.fromEntries(
      Object.entries(game.artwork ?? {}).flatMap(([key, path]) =>
        typeof path === "string" && path ? [[key, convertFileSrc(path)]] : [],
      ),
    ),
  }));
  return value;
}

function scanEntries(
  value: SteamShortcutScan,
  root: SteamShortcutSettings["root"],
  detailed: boolean,
  started: number,
) {
  const entries: ShortcutActivityEvent[] = [];
  if (detailed) {
    const counts = new Map<number, number>();
    for (const game of value.games)
      counts.set(game.accountId, (counts.get(game.accountId) ?? 0) + 1);
    for (const accountId of value.accounts)
      entries.push({ kind: "account", root, accountId, count: counts.get(accountId) ?? 0 });
  }
  entries.push({
    kind: "scan",
    root,
    count: value.games.length,
    accounts: value.accounts.length,
    elapsed: Math.max(0, Date.now() - started),
    warnings: value.warnings,
  });
  return entries;
}

export function useSteamShortcuts(profile: string, active: boolean) {
  const activity = useSteamShortcutActivity(profile),
    journal = activity.store;
  const available = isTauri() && ["windows", "macos", "linux"].includes(osClass());
  const [state, setState] = useState(() => ({
    profile,
    settings: readSteamShortcutSettings(profile),
    scan: null as SteamShortcutScan | null,
  }));
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [launching, setLaunching] = useState<string | null>(null),
    [launched, setLaunched] = useState<string | null>(null);
  const generation = useRef(0),
    configuration = useRef(0),
    lock = useRef(false),
    launchLock = useRef(false),
    live = useRef(true),
    last = useRef(0);
  const identity = useRef(profile);
  useLayoutEffect(() => {
    identity.current = profile;
  }, [profile]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      generation.current++;
    };
  }, []);
  const [prevProfile, setPrevProfile] = useState(profile);
  if (prevProfile !== profile) {
    setPrevProfile(profile);
    setState({ profile, settings: readSteamShortcutSettings(profile), scan: null });
    setError("");
    setLoading(false);
    setLaunching(null);
    setLaunched(null);
  }
  useEffect(() => {
    configuration.current++;
    generation.current++;
    lock.current = false;
    last.current = 0;
  }, [profile]);
  const settings = state.profile === profile ? state.settings : readSteamShortcutSettings(profile),
    scan = state.profile === profile ? state.scan : null;
  const context = JSON.stringify([profile, settings.root, settings.accountId]),
    currentContext = useRef(context);
  useLayoutEffect(() => {
    currentContext.current = context;
  }, [context]);
  const { root, accountId } = settings;
  const games = useMemo(
    () => steamShortcutGames(scan, { root, accountId }),
    [scan, root, accountId],
  );
  const direct = useSteamShortcutLaunch(
    profile,
    settings.root,
    context,
    available && scan?.directLaunch === true,
    active,
    games,
    journal,
  );
  const refresh = useCallback(async () => {
    if (!available || lock.current || !live.current || currentContext.current !== context) return;
    lock.current = true;
    const request = ++generation.current;
    last.current = Date.now();
    setLoading(true);
    setError("");
    const started = Date.now();
    journal.record({
      kind: "scanStart",
      root: root,
      accountId: accountId ?? undefined,
    });
    const latest = () =>
      live.current && request === generation.current && identity.current === profile;
    await invoke<WireSteamShortcutScan>("games_scan_steam_shortcuts", { root: root })
      .then((wire) => {
        const value = withArtworkUrls(wire);
        if (!latest()) return;
        setState({ profile, settings: { root, accountId }, scan: value });
        journal.recordMany(scanEntries(value, root, journal.getSnapshot().detailed, started));
      })
      .catch((value: unknown) => {
        if (latest()) {
          setError(shortcutError(value));
          journal.record({ kind: "scanError", root: root, code: shortcutError(value) });
        }
      })
      .finally(() => {
        if (request === generation.current) {
          lock.current = false;
          if (live.current) setLoading(false);
        }
      });
  }, [available, profile, context, root, accountId, journal]);
  useEffect(() => {
    if (!active || !available) return;
    const check = () => {
      if (!document.hidden && Date.now() - last.current >= 2000) void refresh();
    };
    check();
    const timer = setInterval(check, 30000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [active, available, refresh]);
  const configure = (next: SteamShortcutSettings) => {
    if (identity.current !== profile) return false;
    try {
      localStorage.setItem(steamShortcutKey(profile), JSON.stringify(next));
    } catch {
      setError("games.shortcuts.storeError");
      return false;
    }
    currentContext.current = JSON.stringify([profile, next.root, next.accountId]);
    configuration.current++;
    generation.current++;
    lock.current = false;
    last.current = 0;
    setError("");
    setLaunching(null);
    setLaunched(null);
    setState((current) => ({
      profile,
      settings: next,
      scan:
        current.profile === profile && next.root === current.settings.root ? current.scan : null,
    }));
    journal.record({ kind: "settings", root: next.root, accountId: next.accountId ?? undefined });
    return true;
  };
  const launch = async (game: SteamShortcut) => {
    if (
      !available ||
      game.appId === null ||
      launchLock.current ||
      direct.launching ||
      direct.running.some((process) => process.id === game.id) ||
      game.state !== "ready" ||
      identity.current !== profile ||
      currentContext.current !== context ||
      !games.some((item) => item.id === game.id && item.state === "ready")
    )
      return;
    const revision = configuration.current;
    const current = () =>
      live.current && identity.current === profile && revision === configuration.current;
    launchLock.current = true;
    setLaunching(game.id);
    setLaunched(null);
    setError("");
    direct.dismissError();
    await invoke("games_launch_steam_shortcut", {
      root: settings.root,
      accountId: game.accountId,
      appId: game.appId,
    })
      .then(() => {
        if (current()) {
          setLaunched(game.id);
          journal.record({
            kind: "steam",
            root: settings.root,
            accountId: game.accountId,
            name: game.name,
          });
        }
      })
      .catch((value: unknown) => {
        if (current()) {
          setError(shortcutError(value));
          journal.record({
            kind: "error",
            root: settings.root,
            accountId: game.accountId,
            name: game.name,
            code: shortcutError(value),
          });
        }
      })
      .finally(() => {
        launchLock.current = false;
        if (current()) setLaunching(null);
      });
  };
  useEffect(() => {
    if (!launched) return;
    const timer = setTimeout(() => setLaunched(null), 5000);
    return () => clearTimeout(timer);
  }, [launched]);
  return {
    profile,
    available,
    settings,
    scan,
    activity,
    accountId: selectedShortcutAccount(scan, settings),
    games,
    loading,
    error: error || direct.error,
    launching: launching ?? direct.launching,
    launched,
    refresh,
    configure,
    launch,
    directAvailable: direct.available,
    directLaunching: direct.launching,
    running: direct.running,
    launchDirect: (game: SteamShortcut) => {
      if (
        live.current &&
        !launchLock.current &&
        identity.current === profile &&
        currentContext.current === context
      ) {
        setError("");
        setLaunched(null);
        void direct.launch(game);
      }
    },
    dismissError: () => {
      setError("");
      direct.dismissError();
    },
  };
}
export type SteamShortcutsLibrary = ReturnType<typeof useSteamShortcuts>;

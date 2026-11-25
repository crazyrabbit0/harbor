import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { customLaunchError } from "@/lib/games/custom-library";
import { shortcutError, type SteamShortcut } from "@/lib/games/steam-shortcuts";
import type { ShortcutActivity, ShortcutActivityEvent } from "@/lib/games/steam-shortcut-activity";

import type { ShortcutProcess } from "@/lib/generated/games-library-ipc";
export type { ShortcutProcess };

function launchErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  return code.startsWith("shortcut_") ? shortcutError(error) : customLaunchError(error);
}

export function useSteamShortcutLaunch(
  profile: string,
  root: string | null,
  context: string,
  enabled: boolean,
  active: boolean,
  games: SteamShortcut[],
  journal: ShortcutActivity,
) {
  const [state, setState] = useState({
    context,
    running: [] as ShortcutProcess[],
    busy: null as string | null,
    error: "",
  });
  const [listener, setListener] = useState({ profile, ready: false });
  const live = useRef(true),
    owner = useRef({ context, revision: 0 }),
    sequence = useRef(0),
    pending = useRef(false),
    finished = useRef(new Set<string>());
  const tracked = useRef(new Map<string, ShortcutActivityEvent>());
  useLayoutEffect(() => {
    if (owner.current.context !== context)
      owner.current = { context, revision: owner.current.revision + 1 };
  }, [context]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      sequence.current++;
    };
  }, []);
  const [prevContext, setPrevContext] = useState(context);
  if (prevContext !== context) {
    setPrevContext(context);
    setState({ context, running: [], busy: null, error: "" });
  }
  useEffect(() => {
    sequence.current++;
  }, [context]);
  const [prevListen, setPrevListen] = useState({ profile, enabled, journal });
  if (
    prevListen.profile !== profile ||
    prevListen.enabled !== enabled ||
    prevListen.journal !== journal
  ) {
    setPrevListen({ profile, enabled, journal });
    setListener({ profile, ready: false });
  }
  useEffect(() => {
    let current = true,
      stop: (() => void) | undefined;
    finished.current.clear();
    tracked.current.clear();
    if (!enabled)
      return () => {
        current = false;
      };
    void listen<ShortcutProcess>("games:shortcut-exit", (event) => {
      if (!current || event.payload.profile !== profile) return;
      const activity = tracked.current.get(event.payload.sessionId);
      if (activity) {
        journal.record({ ...activity, kind: "exit" });
        tracked.current.delete(event.payload.sessionId);
      }
      finished.current.add(event.payload.sessionId);
      if (finished.current.size > 256)
        finished.current.delete(finished.current.values().next().value!);
      setState((previous) => ({
        ...previous,
        running: previous.running.filter(
          (process) => process.sessionId !== event.payload.sessionId,
        ),
      }));
    }).then(
      (unlisten) => {
        if (current) {
          stop = unlisten;
          setListener({ profile, ready: true });
        } else unlisten();
      },
      () => {
        if (current) setState((previous) => ({ ...previous, error: "games.custom.launch_failed" }));
      },
    );
    return () => {
      current = false;
      stop?.();
    };
  }, [profile, enabled, journal]);
  const ready = enabled && listener.profile === profile && listener.ready;
  const refresh = useCallback(async () => {
    if (!ready || owner.current.context !== context || !live.current) return;
    const request = ++sequence.current,
      revision = owner.current.revision;
    await invoke<ShortcutProcess[]>("games_steam_shortcut_running", { profile, root })
      .then((running) => {
        if (live.current && owner.current.revision === revision && request === sequence.current)
          setState((previous) => ({
            ...previous,
            context,
            running: running.filter(
              (process) => process.profile === profile && !finished.current.has(process.sessionId),
            ),
          }));
      })
      // A refresh failure must not invent an exit or enable a duplicate launch.
      .catch(() => {});
  }, [profile, root, context, ready]);
  useEffect(() => {
    if (!active || !ready) return;
    const check = () => {
      if (!document.hidden) void refresh();
    };
    check();
    const timer = setInterval(check, 5000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [active, ready, refresh]);
  const running = state.context === context ? state.running : [];
  const launch = async (game: SteamShortcut) => {
    if (
      !ready ||
      pending.current ||
      owner.current.context !== context ||
      game.state === "missing" ||
      running.some((process) => process.id === game.id) ||
      !games.some(
        (item) =>
          item.id === game.id &&
          item.accountId === game.accountId &&
          item.appId === game.appId &&
          item.executable === game.executable &&
          item.startDirectory === game.startDirectory &&
          item.launchOptions === game.launchOptions,
      )
    )
      return;
    pending.current = true;
    sequence.current++;
    setState((previous) => ({ ...previous, context, busy: game.id, error: "" }));
    const revision = owner.current.revision;
    const current = () => live.current && owner.current.revision === revision;
    await invoke<ShortcutProcess>("games_launch_steam_shortcut_direct", {
      profile,
      root,
      accountId: game.accountId,
      appId: game.appId,
      ...(game.appId === null ? { shortcutId: game.id } : {}),
      reviewed: {
        executable: game.executable,
        startDirectory: game.startDirectory,
        launchOptions: game.launchOptions,
      },
    })
      .then((process) => {
        if (!current()) return;
        sequence.current++;
        const activity: ShortcutActivityEvent = {
          kind: "direct",
          root,
          accountId: game.accountId,
          name: game.name,
        };
        journal.record(activity);
        if (finished.current.has(process.sessionId)) journal.record({ ...activity, kind: "exit" });
        else {
          tracked.current.set(process.sessionId, activity);
          if (tracked.current.size > 256)
            tracked.current.delete(tracked.current.keys().next().value!);
        }
        if (!finished.current.has(process.sessionId))
          setState((previous) => ({
            ...previous,
            context,
            running: [...previous.running.filter((value) => value.id !== game.id), process],
          }));
        void refresh();
      })
      .catch((error: unknown) => {
        if (!current()) return;
        const message = launchErrorMessage(error);
        setState((previous) => ({ ...previous, error: message }));
        journal.record({
          kind: "error",
          root,
          accountId: game.accountId,
          name: game.name,
          code: message,
        });
      })
      .finally(() => {
        pending.current = false;
        if (current()) setState((previous) => ({ ...previous, busy: null }));
      });
  };
  return {
    available: ready,
    running,
    launching: state.context === context ? state.busy : null,
    error: state.context === context ? state.error : "",
    launch,
    refresh,
    dismissError: () => setState((previous) => ({ ...previous, error: "" })),
  };
}

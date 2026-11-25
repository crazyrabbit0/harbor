import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ArchiveSpace } from "@/lib/games/archives";

export function useArchiveSpace(profile: string, token: string, parent: string, active: boolean) {
  const key = JSON.stringify([profile, token, parent]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    attempt: number;
    value?: ArchiveSpace;
    error?: boolean;
  }>();
  const runKey = active && token && parent ? `${key}\0${attempt}` : null;
  const [prevRunKey, setPrevRunKey] = useState(runKey);
  if (prevRunKey !== runKey) {
    setPrevRunKey(runKey);
    if (runKey !== null) setState(undefined);
  }
  useEffect(() => {
    if (!active || !token || !parent) return;
    let current = true;
    const deadline = window.setTimeout(() => {
      if (current) {
        current = false;
        setState({ key, attempt, error: true });
      }
    }, 10000);
    void invoke<ArchiveSpace>("games_archive_space", { profile, token, parent }).then(
      (value) => {
        if (current) {
          clearTimeout(deadline);
          setState({ key, attempt, value });
        }
      },
      () => {
        if (current) {
          clearTimeout(deadline);
          setState({ key, attempt, error: true });
        }
      },
    );
    return () => {
      current = false;
      clearTimeout(deadline);
    };
  }, [profile, token, parent, key, attempt, active]);
  const current = state?.key === key && state.attempt === attempt ? state : undefined;
  return {
    value: current?.value,
    error: current?.error ?? false,
    checking: Boolean(token && parent && !current),
    refresh: () => setAttempt((value) => value + 1),
  };
}

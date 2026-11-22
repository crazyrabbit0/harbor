import { useEffect, useState } from "react";
import { fetchVersionHistory, type VersionEntry } from "@/lib/updater/versions";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; versions: VersionEntry[] };

export function useVersionHistory(enabled: boolean) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const key = `${enabled}:${nonce}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    if (enabled) setState({ status: "loading" });
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchVersionHistory()
      .then((versions) => !cancelled && setState({ status: "ready", versions }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  return { state, reload: () => setNonce((n) => n + 1) };
}

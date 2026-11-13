import { useEffect, useState } from "react";
import {
  handleAvailable,
  localHandleCheck,
  normalizeHandle,
  type HandleCheck,
} from "@/lib/account/handle";

export type HandleStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "error" }
  | HandleCheck;

type RemoteResult = { handle: string; status: HandleStatus };

export function useHandleAvailability(raw: string, enabled: boolean): HandleStatus {
  const [remote, setRemote] = useState<RemoteResult | null>(null);
  const handle = normalizeHandle(raw);
  const [seen, setSeen] = useState({ handle, enabled });
  if (seen.handle !== handle || seen.enabled !== enabled) {
    setSeen({ handle, enabled });
    setRemote(null);
  }
  const active = enabled && handle.length > 0;
  const local = active ? localHandleCheck(handle) : null;

  useEffect(() => {
    if (!active || local) return;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      handleAvailable(handle, ac.signal)
        .then((res) => setRemote({ handle, status: res }))
        .catch(() => {
          if (!ac.signal.aborted) setRemote({ handle, status: { state: "error" } });
        });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [handle, enabled]);

  if (!active) return { state: "idle" };
  if (local) return local;
  return remote?.handle === handle ? remote.status : { state: "checking" };
}

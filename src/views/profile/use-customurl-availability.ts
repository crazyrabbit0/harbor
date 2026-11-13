import { useEffect, useState } from "react";
import { fetchSummary, ProfileNotFound } from "@/lib/social/profile-api";

export type UrlStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "mine";

function localStatus(v: string, ownHandle: string, ownCurrent: string): UrlStatus | null {
  if (!v) return "idle";
  if (!/^[a-z0-9-]{3,24}$/.test(v)) return "invalid";
  if (v === ownHandle.toLowerCase() || v === ownCurrent.toLowerCase()) return "mine";
  return null;
}

export function useCustomUrlAvailability(
  value: string,
  ownHandle: string,
  ownCurrent: string,
): UrlStatus {
  const v = value.trim().toLowerCase();
  const local = localStatus(v, ownHandle, ownCurrent);
  const checkKey = `${value}|${ownHandle}|${ownCurrent}`;
  const [status, setStatus] = useState<UrlStatus>(local ?? "checking");
  const [seenCheckKey, setSeenCheckKey] = useState(checkKey);
  if (seenCheckKey !== checkKey) {
    setSeenCheckKey(checkKey);
    setStatus(local ?? "checking");
  }

  useEffect(() => {
    if (local) return;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      fetchSummary(v, ac.signal)
        .then((s) => setStatus(s.isOwner ? "mine" : "taken"))
        .catch((e) => {
          if (ac.signal.aborted) return;
          setStatus(e instanceof ProfileNotFound ? "available" : "idle");
        });
    }, 400);
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [value, ownHandle, ownCurrent]);

  return status;
}

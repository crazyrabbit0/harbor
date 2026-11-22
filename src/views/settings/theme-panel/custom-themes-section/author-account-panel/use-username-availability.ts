import { useEffect, useState } from "react";
import { checkUsernameAvailable } from "@/lib/theme-auth";

export type Availability = "idle" | "checking" | "available" | "taken" | "error";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export function useUsernameAvailability(username: string, enabled: boolean): Availability {
  const [result, setResult] = useState<{ username: string; status: Availability } | null>(null);
  const trimmed = username.trim();
  const eligible = enabled && USERNAME_RE.test(trimmed);

  useEffect(() => {
    if (!eligible) return;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      checkUsernameAvailable(trimmed, ac.signal)
        .then((ok) => setResult({ username: trimmed, status: ok ? "available" : "taken" }))
        .catch(() => {
          if (!ac.signal.aborted) setResult({ username: trimmed, status: "error" });
        });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [trimmed, eligible]);

  if (!eligible) return "idle";
  return result?.username === trimmed ? result.status : "checking";
}

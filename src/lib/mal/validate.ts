import { safeFetch } from "@/lib/safe-fetch";
import { getSession, setSession } from "./session";
import { ensureRefreshed } from "./auth";

let inflight: Promise<void> | null = null;

const tauriFetch = (input: string, init?: RequestInit): Promise<Response> => safeFetch(input, init);

export function validateMalSession(): Promise<void> {
  if (inflight) return inflight;
  inflight = run().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function run(): Promise<void> {
  const session = getSession();
  if (!session) return;
  try {
    const res = await tauriFetch("https://api.myanimelist.net/v2/users/@me", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (res.status === 401) {
      const refreshed = await ensureRefreshed();
      if (!refreshed) setSession(null);
    }
  } catch {
    if (!navigator.onLine) return;
    setSession(null);
  }
}

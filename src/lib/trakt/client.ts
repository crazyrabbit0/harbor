import { safeFetch } from "@/lib/safe-fetch";
import { TRAKT_API_BASE, TRAKT_API_VERSION, TRAKT_REDIRECT_URI } from "./config";
import { sessionClientId, traktApiKey, traktClientSecretFor } from "./credentials";
import { getSession, setSession } from "./session";
import type { TraktSession } from "./types";

export type TraktRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  authed?: boolean;
};

export class TraktApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Trakt HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

function baseHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "trakt-api-version": TRAKT_API_VERSION,
    "trakt-api-key": traktApiKey(getSession()),
  };
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  created_at: number;
  expires_in: number;
};

async function refreshAccessToken(): Promise<TraktSession | null> {
  const current = getSession();
  if (!current) return null;
  const clientId = sessionClientId(current);
  const secret = traktClientSecretFor(clientId);
  const res = await safeFetch(`${TRAKT_API_BASE}/oauth/token`, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({
      refresh_token: current.refreshToken,
      client_id: clientId,
      ...(secret ? { client_secret: secret } : {}),
      redirect_uri: TRAKT_REDIRECT_URI,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // Only a rejected refresh token ends the session; a 429 or 5xx is retried on the next request.
    if (res.status === 400 || res.status === 401) setSession(null);
    return null;
  }
  const data = (await res.json()) as TokenResponse;
  const next: TraktSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    createdAt: data.created_at,
    expiresIn: data.expires_in,
    username: current.username,
    ...(current.clientId ? { clientId: current.clientId } : {}),
  };
  setSession(next);
  return next;
}

let inflightRefresh: Promise<TraktSession | null> | null = null;
function ensureRefreshed(): Promise<TraktSession | null> {
  if (!inflightRefresh) {
    inflightRefresh = refreshAccessToken().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function doFetch(path: string, opts: TraktRequestOptions): Promise<Response> {
  const headers: Record<string, string> = { ...(baseHeaders() as Record<string, string>) };
  const useAuth = opts.authed !== false;
  if (useAuth) {
    const session = getSession();
    if (session) headers["Authorization"] = `Bearer ${session.accessToken}`;
  }
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };
  return fetch(`${TRAKT_API_BASE}${path}`, init);
}

// Concurrent identical GETs for one token share a request; Home and the watchlist sync both ask at launch.
const inflightGets = new Map<string, Promise<unknown>>();

const writeListeners = new Set<() => void>();

/** Runs after every Trakt write, so caches keyed on activity timestamps re-read them. */
export function onTraktWrite(fn: () => void): () => void {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}

export function traktRequest<T>(path: string, opts: TraktRequestOptions = {}): Promise<T> {
  if ((opts.method ?? "GET") !== "GET")
    return sendRequest<T>(path, opts).finally(() => {
      for (const fn of writeListeners) fn();
    });
  const key = `${opts.authed === false ? "" : (getSession()?.accessToken ?? "")}|${path}`;
  const pending = inflightGets.get(key);
  if (pending) return pending as Promise<T>;
  const p = sendRequest<T>(path, opts).finally(() => {
    inflightGets.delete(key);
  });
  inflightGets.set(key, p);
  return p;
}

async function sendRequest<T>(path: string, opts: TraktRequestOptions): Promise<T> {
  let res = await doFetch(path, opts);

  if (res.status === 401 && opts.authed !== false) {
    const refreshed = await ensureRefreshed();
    if (refreshed) res = await doFetch(path, opts);
  }

  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") ?? "1");
    const waitMs = Math.min(Math.max(retry, 1), 30) * 1000;
    await new Promise((r) => setTimeout(r, waitMs));
    res = await doFetch(path, opts);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TraktApiError(res.status, body);
  }

  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

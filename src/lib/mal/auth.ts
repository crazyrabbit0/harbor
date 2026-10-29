import { safeFetch } from "@/lib/safe-fetch";
import { MAL_AUTHORIZE_URL, MAL_TOKEN_URL } from "./config";
import { extractMalCode, extractMalState } from "./code-input";
import { malClientId } from "./credentials";
import { getSession, setSession } from "./session";
import type { MalSession } from "./types";

// Public client ID of upstream Harbor's MAL app, kept only to refresh sessions it issued.
const LEGACY_MAL_CLIENT_ID = "879be1ac300dc70611e5c828fec7bc18";

export class MalCredentialsMissingError extends Error {
  constructor() {
    super("mal-client-id-missing");
    this.name = "MalCredentialsMissingError";
  }
}

function generateVerifier(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  let result = "";
  for (let i = 0; i < 64; i++) result += chars[array[i] % chars.length];
  return result;
}

let pending: { verifier: string; state: string; clientId: string } | null = null;

// MAL only supports the plain PKCE method, so the challenge is the verifier itself.
export function buildAuthorizeUrl(): string {
  const clientId = malClientId();
  if (!clientId) throw new MalCredentialsMissingError();
  const verifier = generateVerifier();
  const state = generateVerifier().slice(0, 16);
  pending = { verifier, state, clientId };

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    code_challenge: verifier,
    code_challenge_method: "plain",
    state,
  });
  return `${MAL_AUTHORIZE_URL}?${params.toString()}`;
}

export { extractMalCode };

export async function completeAuthorization(pastedCode: string): Promise<MalSession> {
  const code = extractMalCode(pastedCode);
  if (!code) throw new Error("Paste the code from MyAnimeList to continue");
  if (!pending) throw new Error("Session expired. Start over and authorize again.");
  const state = extractMalState(pastedCode);
  if (state && state !== pending.state)
    throw new Error("That code belongs to an older attempt. Use the newest MyAnimeList page.");
  const { verifier, clientId } = pending;
  const tokenData = await exchangeCode(code, verifier, clientId);
  pending = null;

  const userName = await fetchUserName(tokenData.access_token);

  const now = Date.now();
  const session: MalSession = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    createdAt: now,
    expiresAt: now + tokenData.expires_in * 1000,
    userName,
    clientId,
  };
  setSession(session);
  return session;
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

function postToken(body: URLSearchParams): Promise<Response> {
  return safeFetch(MAL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
}

async function exchangeCode(
  code: string,
  codeVerifier: string,
  clientId: string,
): Promise<TokenResponse> {
  const res = await postToken(
    new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    }),
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MAL rejected that code (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as Partial<TokenResponse>;
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number")
    throw new Error("MAL did not return a token. Try authorizing again.");
  return json as TokenResponse;
}

export async function refreshAccessToken(): Promise<MalSession | null> {
  const current = getSession();
  if (!current?.refreshToken) return null;
  try {
    const res = await postToken(
      new URLSearchParams({
        client_id: current.clientId || LEGACY_MAL_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: current.refreshToken,
      }),
    );
    if (!res.ok) {
      // Only a rejected refresh token ends the session; a 429 or 5xx is retried on the next request.
      if (res.status === 400 || res.status === 401) setSession(null);
      return null;
    }
    const data = (await res.json()) as TokenResponse;
    const now = Date.now();
    const next: MalSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      createdAt: now,
      expiresAt: now + data.expires_in * 1000,
      userName: current.userName,
      ...(current.clientId ? { clientId: current.clientId } : {}),
    };
    setSession(next);
    return next;
  } catch {
    // A network error or malformed reply says nothing about the token, so the session stays.
    return null;
  }
}

let inflightRefresh: Promise<MalSession | null> | null = null;

export function ensureRefreshed(): Promise<MalSession | null> {
  if (!inflightRefresh) {
    inflightRefresh = refreshAccessToken().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function fetchUserName(accessToken: string): Promise<string> {
  const res = await safeFetch("https://api.myanimelist.net/v2/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "unknown";
  const json = (await res.json()) as { name?: string };
  return json.name ?? "unknown";
}

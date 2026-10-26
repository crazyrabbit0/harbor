import { safeFetch } from "@/lib/safe-fetch";
import { MAL_API_BASE } from "./config";
import { getSession } from "./session";
import { resolveMalRequestUrl } from "./url";

export class MalApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`MAL HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

// harbor_fetch returns the body in one IPC call; plugin-http streams it in chunks (45 calls for one list page).
function tauriFetch(input: string, init?: RequestInit): Promise<Response> {
  return safeFetch(input, init);
}

export async function malRequest<T>(
  path: string,
  options: { method?: string; body?: URLSearchParams; accessToken?: string } = {},
): Promise<T> {
  const token = options.accessToken ?? getSession()?.accessToken ?? null;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body) headers["Content-Type"] = "application/x-www-form-urlencoded";

  const requestUrl = resolveMalRequestUrl(MAL_API_BASE, path);

  let res = await tauriFetch(requestUrl, {
    method: options.method ?? "GET",
    headers,
    body: options.body?.toString(),
  });

  if (res.status === 401 && !options.accessToken) {
    const { ensureRefreshed } = await import("./auth");
    const refreshed = await ensureRefreshed();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${refreshed.accessToken}`;
      res = await tauriFetch(requestUrl, {
        method: options.method ?? "GET",
        headers,
        body: options.body?.toString(),
      });
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new MalApiError(res.status, body);
  }

  return (await res.json()) as T;
}

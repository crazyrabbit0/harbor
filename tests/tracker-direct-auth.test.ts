// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as traktConfig from "../src/lib/trakt/config.ts";
import * as traktCredentials from "../src/lib/trakt/credentials.ts";
import * as malConfig from "../src/lib/mal/config.ts";
import * as malCodeInput from "../src/lib/mal/code-input.ts";
import * as malCredentials from "../src/lib/mal/credentials.ts";
import * as anilistConfig from "../src/lib/anilist/config.ts";
import * as anilistTokenInput from "../src/lib/anilist/token-input.ts";
import * as simklConfig from "../src/lib/simkl/config.ts";
import * as simklRatingsUrl from "../src/lib/simkl/ratings-url.ts";
import devHosts from "../src/lib/dev-proxy-hosts.json" with { type: "json" };
import viteConfig from "../vite.config.ts";
import { hookHarness, loadModule } from "./helpers/hook-harness.ts";

const { HARBOR_TRAKT_CLIENT_ID, LEGACY_TRAKT_CLIENT_ID } = traktConfig;
const { HARBOR_MAL_CLIENT_ID } = malConfig;
const {
  hasTraktClientId,
  sessionClientId,
  setTraktCredentials,
  traktApiKey,
  traktClientId,
  traktClientSecretFor,
} = traktCredentials;
const { hasMalClientId, malClientId, setMalClientId } = malCredentials;

const session = { accessToken: "a", refreshToken: "r", createdAt: 1, expiresIn: 1, username: null };

type Init = { method?: string; headers?: Record<string, string>; body?: string };

const reply = (status: number, body: unknown = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

// A fake network that records each request and answers from a queue.
function network(replies: ReturnType<typeof reply>[]) {
  const calls: { url: string; init?: Init }[] = [];
  const queue = [...replies];
  const fetch = async (url: string, init?: Init) => {
    calls.push({ url, init });
    return queue.shift() ?? reply(500);
  };
  return { calls, fetch };
}

const endpoint = (url: string) => {
  const { host, pathname } = new URL(url);
  return `${host}${pathname}`;
};

test("Trakt signs in with the fork's app unless settings name another", () => {
  setTraktCredentials("", "");
  assert.equal(traktClientId(), HARBOR_TRAKT_CLIENT_ID);
  assert.equal(traktClientSecretFor(HARBOR_TRAKT_CLIENT_ID), "");
  setTraktCredentials("  mine  ", " secret ");
  assert.equal(traktClientId(), "mine");
  assert.equal(hasTraktClientId(), true);
});

test("the Trakt secret is only sent for the client it belongs to", () => {
  setTraktCredentials("mine", "secret");
  assert.equal(traktClientSecretFor("mine"), "secret");
  assert.equal(traktClientSecretFor(LEGACY_TRAKT_CLIENT_ID), "");
});

test("existing Trakt sessions keep the API key of the app that issued them", () => {
  setTraktCredentials("mine", "");
  assert.equal(sessionClientId(session), LEGACY_TRAKT_CLIENT_ID);
  assert.equal(traktApiKey(session), LEGACY_TRAKT_CLIENT_ID);
  assert.equal(traktApiKey({ ...session, clientId: "mine" }), "mine");
  assert.equal(traktApiKey(null), "mine");
  setTraktCredentials("", "");
  assert.equal(traktApiKey(null), HARBOR_TRAKT_CLIENT_ID);
});

test("MAL signs in with the fork's client unless settings name another", () => {
  setMalClientId("");
  assert.equal(malClientId(), HARBOR_MAL_CLIENT_ID);
  assert.equal(hasMalClientId(), true);
  setMalClientId(" abc ");
  assert.equal(malClientId(), "abc");
  setMalClientId("");
});

test("Trakt device sign-in goes to api.trakt.tv with the fork's client ID", async () => {
  setTraktCredentials("", "");
  const net = network([
    reply(200, {
      device_code: "dc",
      user_code: "UC",
      verification_url: "https://trakt.tv/activate",
      expires_in: 600,
      interval: 5,
    }),
    reply(200, { access_token: "a", refresh_token: "r", created_at: 1, expires_in: 100 }),
  ]);
  const auth = loadModule("src/lib/trakt/device-auth.ts", {
    "@/lib/safe-fetch": { safeFetch: net.fetch },
    "./config": traktConfig,
    "./credentials": traktCredentials,
    "./session": { setSession() {} },
  });

  const device = await auth.requestDeviceCode();
  const result: { kind: string; session: { clientId: string } } = await new Promise((resolve) =>
    auth.pollForToken(device, resolve),
  );

  assert.deepEqual(
    net.calls.map((c) => endpoint(c.url)),
    ["api.trakt.tv/oauth/device/code", "api.trakt.tv/oauth/device/token"],
  );
  for (const call of net.calls) {
    assert.equal(JSON.parse(call.init?.body ?? "{}").client_id, HARBOR_TRAKT_CLIENT_ID);
    assert.equal(call.init?.headers?.["trakt-api-key"], HARBOR_TRAKT_CLIENT_ID);
  }
  assert.equal(result.kind, "authorized");
  assert.equal(result.session.clientId, HARBOR_TRAKT_CLIENT_ID);
});

test("a Trakt 401 refreshes through api.trakt.tv/oauth/token as the session's own app", async () => {
  setTraktCredentials("", "");
  const store: { current: Record<string, unknown> } = { current: { ...session } };
  const api = network([reply(401), reply(200, { ok: true })]);
  const oauth = network([
    reply(200, { access_token: "new", refresh_token: "r2", created_at: 2, expires_in: 100 }),
  ]);
  const client = loadModule(
    "src/lib/trakt/client.ts",
    {
      "@/lib/safe-fetch": { safeFetch: oauth.fetch },
      "./config": traktConfig,
      "./credentials": traktCredentials,
      "./session": {
        getSession: () => store.current,
        setSession: (next: Record<string, unknown>) => (store.current = next),
      },
    },
    { fetch: api.fetch },
  );

  await client.traktRequest("/users/me");

  assert.deepEqual(
    oauth.calls.map((c) => endpoint(c.url)),
    ["api.trakt.tv/oauth/token"],
  );
  const refresh = JSON.parse(oauth.calls[0].init?.body ?? "{}");
  assert.equal(refresh.grant_type, "refresh_token");
  assert.equal(refresh.client_id, LEGACY_TRAKT_CLIENT_ID);
  assert.deepEqual(
    api.calls.map((c) => endpoint(c.url)),
    ["api.trakt.tv/users/me", "api.trakt.tv/users/me"],
  );
  assert.equal(api.calls[1].init?.headers?.["Authorization"], "Bearer new");
});

test("MAL sign-in uses the plain PKCE method against myanimelist.net", async () => {
  setMalClientId("");
  const net = network([
    reply(200, { access_token: "a", refresh_token: "r", expires_in: 3600 }),
    reply(200, { name: "me" }),
  ]);
  let saved: { clientId?: string } | null = null;
  const auth = loadModule("src/lib/mal/auth.ts", {
    "@/lib/safe-fetch": { safeFetch: net.fetch },
    "./config": malConfig,
    "./code-input": malCodeInput,
    "./credentials": malCredentials,
    "./session": { getSession: () => null, setSession: (s: { clientId?: string }) => (saved = s) },
  });

  const authorize = new URL(auth.buildAuthorizeUrl());
  const verifier = authorize.searchParams.get("code_challenge");
  await auth.completeAuthorization(`code=abc&state=${authorize.searchParams.get("state")}`);

  assert.equal(`${authorize.host}${authorize.pathname}`, "myanimelist.net/v1/oauth2/authorize");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "plain");
  assert.equal(authorize.searchParams.get("client_id"), HARBOR_MAL_CLIENT_ID);
  assert.deepEqual(
    net.calls.map((c) => endpoint(c.url)),
    ["myanimelist.net/v1/oauth2/token", "api.myanimelist.net/v2/users/@me"],
  );
  assert.equal(new URLSearchParams(net.calls[0].init?.body).get("code_verifier"), verifier);
  assert.equal(saved?.clientId, HARBOR_MAL_CLIENT_ID);
});

test("AniList sign-in is the implicit grant on anilist.co, with no secret", async () => {
  const auth = loadModule("src/lib/anilist/auth.ts", {
    "./config": anilistConfig,
    "./queries": { fetchViewer: async () => ({ id: 1, name: "me", avatar: null }) },
    "./session": { setSession() {} },
    "./token-input": anilistTokenInput,
  });

  const authorize = new URL(auth.buildAuthorizeUrl());

  assert.equal(`${authorize.host}${authorize.pathname}`, "anilist.co/api/v2/oauth/authorize");
  assert.equal(authorize.searchParams.get("response_type"), "token");
  assert.equal(authorize.searchParams.get("client_id"), anilistConfig.ANILIST_CLIENT_ID);
  assert.equal(authorize.searchParams.has("client_secret"), false);
});

test("Simkl ratings hit api.simkl.com/ratings with one ID per request", () => {
  const timers: Array<() => void> = [];
  const net = network([reply(200, { simkl: { rating: 8.1 } })]);
  const harness = hookHarness(
    "src/lib/simkl/ratings.ts",
    "useSimklCommunityRating",
    {
      "@/lib/safe-fetch": { safeFetch: net.fetch },
      "./client": { isSimklBlocked: () => false, simklRequest: async () => undefined },
      "./activities": { updateCachedRatingByTarget() {}, getCachedRatingByTarget() {} },
      "./config": simklConfig,
      "./ratings-url": simklRatingsUrl,
    },
    {
      window: {
        setTimeout: (fn: () => void) => {
          timers.push(fn);
          return 1;
        },
      },
    },
  );

  harness.render("tt0111161");
  timers[0]();
  harness.unmount();

  const url = new URL(net.calls[0].url);
  assert.equal(`${url.host}${url.pathname}`, "api.simkl.com/ratings");
  assert.equal(url.searchParams.get("imdb"), "tt0111161");
  assert.equal(url.searchParams.get("fields"), "simkl");
  assert.deepEqual(
    [...url.searchParams.keys()].filter((k) => k === "imdb" || k === "mal"),
    ["imdb"],
  );
});

function webSafeFetch() {
  const fetched: string[] = [];
  const api = loadModule(
    "src/lib/safe-fetch.ts",
    {
      "@tauri-apps/api/core": { invoke: async () => ({}) },
      "@tauri-apps/plugin-http": { fetch: async () => new Response("") },
      "./privacy/blocklist": {
        TrackerBlockedError: class extends Error {},
        isBlockedUrl: () => false,
        noteBlocked: () => {},
      },
      "./fetch-bridge-stats": { bridgeOutcome: () => "ok", recordBridge: () => {} },
      "./direct-host-policy": {
        allowDirectHost: () => {},
        classifyDirectFailure: () => ({}),
        clearDirectFailures: () => {},
        directHostFor: () => null,
        noteDirectFailure: () => {},
      },
      "./dev-proxy-hosts.json": { default: devHosts },
      "./fetch-fallback-policy": {
        hasSensitiveRequestHeaders: () => false,
        shouldFallbackToPluginHttp: () => false,
      },
      "./local-network": { isLocalNetworkUrl: () => false },
      "./subtitles/provider-url": {
        isSafeProviderSubtitleUrl: () => true,
        SUBTITLE_PUBLIC_NETWORK_HEADER: "x-public",
      },
    },
    {
      window: { location: { hostname: "localhost" } },
      fetch: async (url: string) => {
        fetched.push(String(url));
        return new Response("");
      },
    },
  );
  return { api, fetched };
}

test("new tracker hosts are proxied for the browser build", async () => {
  const { api, fetched } = webSafeFetch();
  const hosts = [
    "api.trakt.tv",
    "myanimelist.net",
    "api.myanimelist.net",
    "caching.graphql.imdb.com",
  ];

  for (const host of hosts) await api.safeFetch(`https://${host}/v2/x?y=1`);

  assert.deepEqual(
    fetched,
    hosts.map((host) => `/api-proxy/${host}/v2/x?y=1`),
  );
});

test("the vite dev proxy is built from the same host list safe-fetch reads", async () => {
  const config = await (viteConfig as (env: object) => Promise<any>)({
    mode: "development",
    command: "serve",
  });
  const proxy = config.server.proxy;

  assert.deepEqual(
    Object.keys(proxy),
    devHosts.map((host: string) => `/api-proxy/${host}`),
  );
  assert.equal(proxy["/api-proxy/api.trakt.tv"].target, "https://api.trakt.tv");
  assert.equal(
    proxy["/api-proxy/api.trakt.tv"].rewrite("/api-proxy/api.trakt.tv/users/me"),
    "/users/me",
  );
});

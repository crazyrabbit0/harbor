// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as fallbackPolicy from "../src/lib/fetch-fallback-policy.ts";
import { loadModule } from "./helpers/hook-harness.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const CREDENTIAL = "x-harbor-subtitle-credential";

// The real safe-fetch in the Tauri build; every direct-host lookup answers with a host.
function tauriSafeFetch() {
  const invokes: Array<{ cmd: string; args: Record<string, any> }> = [];
  const direct: string[] = [];
  const api = loadModule(
    "src/lib/safe-fetch.ts",
    {
      "@tauri-apps/api/core": {
        invoke: async (cmd: string, payload: { args: Record<string, any> }) => {
          invokes.push({ cmd, args: payload.args });
          return { status: 200, ok: true, body: "", contentType: null };
        },
      },
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
        directHostFor: (url: string) => new URL(url).hostname,
        noteDirectFailure: () => {},
      },
      "./dev-proxy-hosts.json": { default: [] },
      "./fetch-fallback-policy": fallbackPolicy,
      "./local-network": { isLocalNetworkUrl: () => false },
      "./subtitles/provider-url": {
        isSafeProviderSubtitleUrl: () => true,
        SUBTITLE_PUBLIC_NETWORK_HEADER: "x-public",
      },
    },
    {
      window: { __TAURI_INTERNALS__: {} },
      fetch: async (url: string) => {
        direct.push(String(url));
        return new Response("");
      },
    },
  );
  return { api, invokes, direct };
}

test("subtitle credential commands are registered on desktop and mobile", () => {
  const desktop = read("src-tauri/src/lib.rs");
  const mobile = read("src-tauri/src/mobile.rs");
  for (const command of ["subtitle_credential_bind", "subtitle_credentials_clear"]) {
    assert.match(desktop, new RegExp(`subtitle_credentials::${command}`));
    assert.match(mobile, new RegExp(`subtitle_credentials::${command}`));
  }
});

test("safe fetch transports the opaque handle outside outbound headers", async () => {
  const h = tauriSafeFetch();
  await h.api.safeFetch("https://api.opensubtitles.com/x", {
    headers: { [CREDENTIAL]: "handle-1", accept: "application/json" },
  });
  assert.equal(h.invokes.length, 1);
  assert.equal(h.invokes[0].cmd, "harbor_fetch");
  assert.equal(h.invokes[0].args.credentialHandle, "handle-1");
  assert.deepEqual(h.invokes[0].args.headers, { accept: "application/json" });

  const nativeFetch = read("src-tauri/src/http_fetch.rs");
  assert.match(nativeFetch, /credential_handle/);
  assert.match(nativeFetch, /subtitle_credentials::resolve/);
  assert.match(nativeFetch, /subtitle_credentials::apply_to_request/);
  assert.match(nativeFetch, /subtitle_credential = None/);
});

test("URL and Request inputs retain the guarded native fetch path", async () => {
  const h = tauriSafeFetch();
  const url = "https://api.opensubtitles.com/download";
  await h.api.safeFetch(new URL(url), { headers: { [CREDENTIAL]: "handle-url" } });
  await h.api.safeFetch(new Request(url, { headers: { [CREDENTIAL]: "handle-req" } }));
  assert.deepEqual(h.direct, [], "credentialed URL and Request inputs skip the direct path");
  assert.deepEqual(
    h.invokes.map((i) => [i.cmd, i.args.url, i.args.credentialHandle, i.args.headers[CREDENTIAL]]),
    [
      ["harbor_fetch", url, "handle-url", undefined],
      ["harbor_fetch", url, "handle-req", undefined],
    ],
  );

  await h.api.safeFetch(new URL(url));
  await h.api.safeFetch(new Request(url));
  assert.deepEqual(h.direct, [url, url], "plain URL and Request inputs take the direct-host check");
});

test("sensitive requests cannot use the browser direct-host fast path", async () => {
  const h = tauriSafeFetch();
  await h.api.safeFetch("https://torrentio.strem.fun/a", {
    headers: { Authorization: "Bearer secret" },
  });
  await h.api.safeFetch("https://torrentio.strem.fun/b", { headers: { [CREDENTIAL]: "h" } });
  assert.deepEqual(h.direct, []);
  assert.equal(h.invokes.length, 2);

  await h.api.safeFetch("https://torrentio.strem.fun/c");
  assert.deepEqual(h.direct, ["https://torrentio.strem.fun/c"]);
  assert.equal(h.invokes.length, 2);
});

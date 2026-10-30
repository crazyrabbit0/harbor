import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Each public entry point must refuse a blocklisted host before choosing a transport.
function load(isTauri: boolean) {
  const compiled = ts.transpileModule(readFileSync("src/lib/safe-fetch.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const calls: string[] = [];
  class TrackerBlockedError extends Error {}
  let blocked = 0;
  const mocks: Record<string, unknown> = {
    "@tauri-apps/api/core": {
      invoke: async (cmd: string) => {
        calls.push(cmd);
        return { status: 200, ok: true, body: "", contentType: null };
      },
    },
    "@tauri-apps/plugin-http": {
      fetch: async () => {
        calls.push("plugin");
        return new Response("");
      },
    },
    "./privacy/blocklist": {
      TrackerBlockedError,
      isBlockedUrl: (url: string) => url.includes("tracker.example"),
      noteBlocked: () => void blocked++,
    },
    "./fetch-bridge-stats": { bridgeOutcome: () => "ok", recordBridge: () => {} },
    "./direct-host-policy": {
      allowDirectHost: () => {},
      classifyDirectFailure: () => ({}),
      clearDirectFailures: () => {},
      directHostFor: () => null,
      noteDirectFailure: () => {},
    },
    "./dev-proxy-hosts.json": { default: [] },
    "./fetch-fallback-policy": {
      hasSensitiveRequestHeaders: () => false,
      shouldFallbackToPluginHttp: () => false,
    },
    "./local-network": { isLocalNetworkUrl: () => false },
    "./subtitles/provider-url": {
      isSafeProviderSubtitleUrl: () => true,
      SUBTITLE_PUBLIC_NETWORK_HEADER: "x-public",
    },
  };
  const exports: Record<string, any> = {};
  const window = isTauri ? { __TAURI_INTERNALS__: {} } : { location: { hostname: "example.org" } };
  const fetch = async () => {
    calls.push("web");
    return new Response("");
  };
  new Function("require", "exports", "window", "fetch", compiled)(
    (id: string) => {
      assert.ok(Object.hasOwn(mocks, id), `Unexpected import: ${id}`);
      return mocks[id];
    },
    exports,
    window,
    fetch,
  );
  return { api: exports, calls, blockedCount: () => blocked, TrackerBlockedError };
}

for (const isTauri of [true, false]) {
  test(`every entry point refuses a blocklisted host (${isTauri ? "app" : "browser"})`, async () => {
    const h = load(isTauri);
    const url = "https://tracker.example/pixel";
    const attempts = [
      () => h.api.safeFetch(url),
      () => h.api.safeFetch(new URL(url)),
      () => h.api.safeFetchLocal(url),
      () => h.api.safeFetchStream(new URL(url)),
      () => h.api.safeFetchStream(new Request(url)),
      () => h.api.safeFetchLocal(new Request(url)),
      () => h.api.safeFetchBytes(url),
    ];
    if (isTauri) attempts.push(() => h.api.safeFetchBase64(url, {}));
    for (const attempt of attempts) {
      await assert.rejects(attempt(), (e) => e instanceof h.TrackerBlockedError);
    }
    assert.deepEqual(h.calls, [], "no transport ran");
    assert.equal(h.blockedCount(), attempts.length);
  });
}

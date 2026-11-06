// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { loadModule } from "./helpers/hook-harness.ts";
import { simklScrobbleHarness, traktScrobbleHarness } from "./helpers/tracker-scrobble-harness.ts";

const trackers = [
  { name: "simkl", make: simklScrobbleHarness },
  { name: "trakt", make: traktScrobbleHarness },
] as const;

test("pausing playback always tells the tracker", () => {
  for (const { name, make } of trackers) {
    const h = make();
    h.at({ status: "playing", sec: 300 });
    h.at({ status: "paused", sec: 600 });
    assert.deepEqual(
      h.scrobbles.map((s) => s.action),
      ["start", "pause"],
      name,
    );
    assert.equal(h.scrobbles[1].pct, 40, name);
  }
});

test("the Simkl exit send uses a transport that survives teardown", () => {
  const h = simklScrobbleHarness();
  h.at({ status: "playing", sec: 300 });
  h.at({ status: "paused", sec: 1450 });
  h.unmount();
  assert.equal(h.beacons.length, 1);
  assert.equal(h.beacons[0].action, "stop");
  assert.equal(h.beacons[0].keepalive, true);
});

test("the native fetch bridge cannot carry keepalive and caps a request at 30 s", async () => {
  const calls: Array<Record<string, unknown>> = [];
  class TrackerBlockedError extends Error {}
  const api = loadModule(
    "src/lib/safe-fetch.ts",
    {
      "@tauri-apps/api/core": {
        invoke: async (_cmd: string, payload: { args: Record<string, unknown> }) => {
          calls.push(payload.args);
          return { status: 200, ok: true, body: "", contentType: null };
        },
      },
      "@tauri-apps/plugin-http": { fetch: async () => new Response("") },
      "./privacy/blocklist": {
        TrackerBlockedError,
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
    },
    { window: { __TAURI_INTERNALS__: {} }, fetch: async () => new Response("") },
  );
  await api.safeFetch("https://api.simkl.test/scrobble/stop", {
    method: "POST",
    keepalive: true,
    body: "{}",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeoutMs, 30000);
  assert.equal("keepalive" in calls[0], false);
});

test("the Simkl exit send does not queue behind the POST throttle", () => {
  const h = simklScrobbleHarness();
  h.at({ status: "playing", sec: 300 });
  h.at({ status: "paused", sec: 1450 });
  const queuedBefore = h.scrobbles.length;
  h.unmount();
  assert.equal(h.beacons.at(-1)?.action, "stop", "the beacon leaves synchronously");
  assert.equal(h.scrobbles.length, queuedBefore, "no scrobble goes through the queued client");
});

test("Simkl and Trakt agree on when a session is finished", () => {
  for (const { name, make } of trackers) {
    const finishedAt = (sec: number) => {
      const h = make();
      h.at({ status: "playing", sec: 300 });
      h.at({ status: "paused", sec });
      const before = h.scrobbles.length;
      h.unmount();
      const sent = name === "simkl" ? h.beacons : h.scrobbles.slice(before);
      return sent.at(-1)?.action;
    };
    assert.equal(finishedAt(1349), "pause", `${name} below 90%`);
    assert.equal(finishedAt(1350), "stop", `${name} at 90%`);
  }
});

test("Simkl does not write an early EOF directly to watched history", () => {
  const early = simklScrobbleHarness();
  early.at({ status: "playing", sec: 300 });
  early.at({ status: "ended", sec: 600 });
  assert.equal(early.beacons.at(-1)?.action, "stop");
  assert.deepEqual(early.watched, []);
  assert.deepEqual(early.queue(), []);
  const real = simklScrobbleHarness();
  real.at({ status: "playing", sec: 300 });
  real.at({ status: "ended", sec: 1490 });
  assert.equal(real.watched.length, 1);
});

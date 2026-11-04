import "./_localstorage-stub.ts";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { emptySnapshot, initialPlayerSnapshot } from "../src/lib/player/bridge.ts";
import { html5BridgeHarness } from "./helpers/html5-bridge-harness.ts";
import { mpvBridgeHarness } from "./helpers/mpv-bridge-harness.ts";
import { hookHarness } from "./helpers/hook-harness.ts";

test("the initial player snapshot uses the saved volume and mute preference", () => {
  localStorage.setItem("harbor.player.volume.v1", JSON.stringify({ volume: 0.42, muted: true }));
  const snapshot = initialPlayerSnapshot();
  assert.equal(snapshot.volume, 0.42);
  assert.equal(snapshot.muted, true);
  assert.equal(snapshot.status, emptySnapshot.status);
  assert.notEqual(snapshot, emptySnapshot);
});

test("the html5 engine starts from the saved volume and mute preference", () => {
  localStorage.setItem("harbor.player.volume.v1", JSON.stringify({ volume: 0.3, muted: true }));
  const first = html5BridgeHarness().snapshot();
  assert.equal(first.volume, 0.3);
  assert.equal(first.muted, true);
});

test("the mpv engine starts from the saved volume and mute preference", () => {
  const first = mpvBridgeHarness({ volume: 0.25, muted: true }).snapshot();
  assert.equal(first.volume, 0.25);
  assert.equal(first.muted, true);
});

test("the player's React state starts from the saved snapshot before a bridge exists", () => {
  const seeded = { ...emptySnapshot, volume: 0.2, muted: true };
  const noop = () => {};
  const h = hookHarness("src/views/player/hooks/use-player-bridge.ts", "usePlayerBridge", {
    "@/lib/player/bridge": { emptySnapshot, initialPlayerSnapshot: () => seeded },
    "@/lib/player/mpv": { probeMpv: async () => ({ available: false }) },
    "@/lib/player/mpv-tuning": { mergeMpvOptions: () => "" },
    "@/lib/player/anime-src": { metaIsAnime: () => false },
    "./use-anime4k": { anime4kShadersFor: () => [] },
    "@/lib/player/shader-chain": {
      generalShaderChain: () => [],
      generalShaderKey: () => "",
      shaderCompanionOptions: () => "",
    },
    "@/lib/player/playback-clock": { setPlaybackClock: noop, setPlaybackStatus: noop },
    "@/lib/platform": {
      isLinuxDesktop: () => false,
      isMacDesktop: () => false,
      isWindowsDesktop: () => false,
    },
    "@/lib/player/live-src": { isLivePlaybackSrc: () => false },
    "@/lib/player/embed-rect": { readEmbedRect: () => null },
    "@/lib/svp": { svpEnsureRunning: async () => {}, svpStatus: async () => ({}) },
    "@/lib/player/svp-policy": { isSvpActiveForMedia: () => false },
    "../player-utils": { pickBridge: async () => new Promise(noop) },
  });
  const result = h.render({
    bridgeRef: { current: null },
    videoMountRef: { current: null },
    src: { url: "https://media.test/a.mkv", meta: { id: "tt1" } },
    settings: { playerEngine: "auto", playerAnime4kShaders: [] },
  }) as { snap: typeof seeded };
  assert.equal(result.snap, seeded);
});

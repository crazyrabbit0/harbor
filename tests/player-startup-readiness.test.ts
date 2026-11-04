// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { emptySnapshot, initialPlayerSnapshot } from "../src/lib/player/bridge.ts";
import { mpvStartArgs } from "../src/lib/player/mpv-config.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import { html5BridgeHarness } from "./helpers/html5-bridge-harness.ts";
import { flushBridge, mpvBridgeHarness } from "./helpers/mpv-bridge-harness.ts";

const nativeMpv = readFileSync(new URL("../src-tauri/src/mpv.rs", import.meta.url), "utf8");

test("player snapshots expose a resettable first-frame readiness signal", async () => {
  assert.equal(emptySnapshot.firstFrameReady, false);
  assert.equal(initialPlayerSnapshot().firstFrameReady, false);

  const mpv = mpvBridgeHarness();
  await mpv.bridge.load({ url: "first.mkv" });
  mpv.emitEvent({ event: "playback-restart" });
  assert.equal(mpv.snapshot().firstFrameReady, true);
  await mpv.bridge.load({ url: "second.mkv" });
  assert.equal(mpv.snapshot().firstFrameReady, false, "a new load starts unready");

  const html5 = html5BridgeHarness();
  await html5.bridge.load({ url: "https://media.test/a.mp4" });
  html5.video.dispatch("timeupdate");
  assert.equal(html5.snapshot().firstFrameReady, true);
  await html5.bridge.load({ url: "https://media.test/b.mp4" });
  assert.equal(html5.snapshot().firstFrameReady, false);
});

test("first-frame readiness ignores a stale event from the previous media path", async () => {
  assert.match(nativeMpv, /\("path", 20, PropertyKind::String\)/);
  const h = mpvBridgeHarness();
  await h.bridge.load({ url: "first.mkv" });
  h.emit("path", "first.mkv");
  await h.bridge.load({ url: "second.mkv" });
  h.emitEvent({ event: "playback-restart" });
  assert.equal(h.snapshot().firstFrameReady, false, "mpv still reports the old file");
  h.emit("path", "second.mkv");
  h.emitEvent({ event: "playback-restart" });
  assert.equal(h.snapshot().firstFrameReady, true);
});

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });

function loader() {
  let clockPosition = 0;
  const h = hookHarness(
    "src/views/player/cinematic-player-loader.tsx",
    "CinematicPlayerLoader",
    {
      "@/components/harbor-loader": { HarborLoader: "HarborLoader" },
      "@/components/custom-artwork": { CustomArtwork: "CustomArtwork" },
      "@/lib/player/local-url": { isLocalUrl: () => false },
      "@/lib/player/playback-clock": {
        usePlaybackPositionGated: () => clockPosition,
      },
      "@/chrome/topbar": { Topbar: "Topbar" },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/profiles": { useActiveKid: () => false },
      "@/lib/logo": { resolveLogo: async () => undefined },
      "@/lib/settings": {
        useSettingsSelector: (select: (s: unknown) => unknown) => select({ tmdbKey: "" }),
      },
      "@/lib/title-logo": { useTitleLogo: () => undefined },
      "./loader-logo-or-text": { LoaderLogoOrText: "LoaderLogoOrText" },
      "@/lib/torrent/engine-stats": { readinessScore: () => 0 },
      "@/lib/stremio-server": { isBundledEngineUrl: () => false, isLocalEngineUrl: () => false },
      "./stream-loading-bar": { StreamLoadingBar: "StreamLoadingBar" },
      "./use-p2p-preparing-status": { useP2pPreparingStatus: () => null },
      "@/components/hover-preview/scene": { useMedia: () => null },
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    },
    { window: { setTimeout: () => 0, clearTimeout() {}, matchMedia: () => ({ matches: false }) } },
  );
  const showing: boolean[] = [];
  const render = (snap: Record<string, unknown>) =>
    h.render({
      src: { url: "https://media.test/a.mkv", meta: { id: "tt1", name: "Movie" } },
      snap: { ...emptySnapshot, status: "playing", ...snap },
      onCancel() {},
      onShowingChange: (value: boolean) => showing.push(value),
    });
  return {
    render,
    showing,
    advanceClock: (sec: number) => {
      clockPosition = sec;
    },
  };
}

test("the cinematic loader hides on the first frame, never on playback time alone", () => {
  const l = loader();
  l.advanceClock(5);
  assert.notEqual(l.render({ positionSec: 5 }), null, "position without a frame keeps it up");
  assert.equal(l.showing.at(-1), true);
  l.render({ firstFrameReady: true });
  assert.equal(l.showing.at(-1), false);
});

test("user seeks use fast keyframes and step seeks stay exact", async () => {
  const h = mpvBridgeHarness();
  await h.bridge.load({ url: "a.mkv" });
  h.bridge.seek(40, "keyframes");
  h.bridge.seek(50);
  const seeks = h.commands.filter((c) => c.command === "mpv_command" && (c.args.cmd as unknown[])[0] === "seek");
  assert.deepEqual(
    seeks.map((c) => c.args.cmd),
    [
      ["seek", 40, "absolute+keyframes"],
      ["seek", 50, "absolute+exact"],
    ],
  );
  const seekTo: unknown[][] = [];
  const controls = hookHarness(
    "src/views/player/hooks/use-playback-controls.ts",
    "usePlaybackControls",
    {
      "@/lib/player/playback-clock": { getPlaybackPosition: () => 0 },
      "@/lib/player-prefs": { writePlayerPrefs() {} },
      "@/lib/subtitles/subtitle-memory": {},
      "@/lib/player/imported-subs": {},
      "@/lib/subtitles/selected-subtitle-cache": {},
      "@/lib/media-session": { notifyMediaSeeked() {} },
    },
    { performance: { now: () => 0 } },
  ).render({
    bridgeRef: { current: { seek: (...a: unknown[]) => seekTo.push(a) } },
    snapRef: { current: emptySnapshot },
    canControl: true,
    castDevice: null,
  }) as { seekTo: (sec: number) => void };
  controls.seekTo(90);
  assert.deepEqual(seekTo, [[90, "keyframes"]]);
});

test("native startup logs classify sources without printing private playback URLs", () => {
  assert.match(nativeMpv, /start source_kind=\{\}/);
  assert.match(nativeMpv, /loadfile source_kind=\{\}/);
  assert.doesNotMatch(nativeMpv, /start url=\{\}/);
  assert.doesNotMatch(nativeMpv, /loadfile \{\}", args\.url/);
});

test("startup subtitle downloads never block the initial media load", async () => {
  const src = { url: "file:///a.mkv", isLive: false, subtitles: [{ url: "x.srt" }] } as never;
  assert.deepEqual(
    mpvStartArgs({ anime4k: false, hdrToSdr: false }, src, false, "standard").subtitles,
    [],
  );
  const h = mpvBridgeHarness();
  let releaseSub!: () => void;
  h.prepareWith(
    ({ url }) =>
      new Promise((resolve) => {
        releaseSub = () => resolve({ playableUrl: url, format: "srt", cues: [], cleanup() {} });
      }),
  );
  await h.bridge.load({ url: "a.mkv", subtitles: [{ url: "https://subs.test/x.srt", lang: "en" }] });
  assert.ok(h.commands.some((c) => c.command === "mpv_start"), "the load returned before the subtitle");
  assert.ok(!h.commands.some((c) => c.command === "mpv_sub_add"));
  releaseSub();
  await flushBridge();
  assert.ok(h.commands.some((c) => c.command === "mpv_sub_add"), "the subtitle follows the load");

  let reloaded = false;
  void h.bridge
    .load({ url: "b.mkv", subtitles: [{ url: "https://subs.test/y.srt", lang: "en" }] })
    .then(() => {
      reloaded = true;
    });
  await flushBridge();
  assert.equal(reloaded, true, "a reused session does not wait for its subtitles either");
  releaseSub();
});

test("mpv starts each reused media load without an automatically selected subtitle", async () => {
  const h = mpvBridgeHarness();
  await h.bridge.load({ url: "a.mkv" });
  h.commands.length = 0;
  await h.bridge.load({ url: "b.mkv" });
  const order = h.commands.map((c) =>
    c.command === "mpv_command"
      ? String((c.args.cmd as unknown[])[0])
      : c.command === "mpv_set_property"
        ? `${c.args.name}=${c.args.value}`
        : c.command,
  );
  const sid = order.indexOf("sid=no");
  assert.ok(order.indexOf("stop") < sid && sid < order.indexOf("loadfile"), order.join(","));
  const secondary = order.indexOf("secondary-sid=no");
  assert.ok(secondary >= 0 && secondary < order.indexOf("loadfile"));
  const nativeSidReset = nativeMpv.indexOf('mpv.set_property("sid", "no")');
  const nativeLoad = nativeMpv.indexOf('&["loadfile", &args.url, "replace"]');
  assert.ok(nativeSidReset >= 0 && nativeSidReset < nativeLoad);
  assert.match(nativeMpv, /mpv\.set_property\("secondary-sid", "no"\)/);
});

test("mpv capability probing is shared for the application lifetime", async () => {
  const h = mpvBridgeHarness();
  const mpv = h.module;
  const [a, b] = await Promise.all([mpv.probeMpv(), mpv.probeMpv()]);
  await mpv.probeMpv();
  assert.equal(a, b);
  assert.equal(h.commands.filter((c) => c.command === "mpv_probe").length, 1);
});

test("the player and the picker share one resume lookup", async () => {
  const reads: string[] = [];
  const h = hookHarness("src/lib/player/resume-start.ts", "resumeLibraryGetOne", {
    "@/lib/resume": { readResumeEntry: () => null, saveResumeBatch() {} },
    "@/lib/cw-profile": { privateCwProfileId: () => null },
    "@/lib/stremio": {
      libraryGetOne: async (_auth: string, id: string) => (reads.push(id), null),
      episodeFromVideoId: () => null,
    },
  });
  const identity = { metaId: "tt1", authKey: "k", imdbId: null, imdbVerified: false };
  assert.equal(h.exports.isResumeStartReady(identity), false);
  h.exports.prefetchResumeStart(identity);
  await flushPromises();
  assert.equal(h.exports.isResumeStartReady(identity), true);
  await h.exports.resolveStartMs({ ...identity, season: 1, episode: 1, openingVid: null });
  await h.exports.resumeLibraryGetOne("k", "tt1");
  assert.deepEqual(reads, ["tt1"], "the picker's prefetch is reused by the load and sync");
});

test("manual HTTP sources are not killed by the short startup retry timer", () => {
  const run = (instantPlay: boolean) => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const opened: unknown[] = [];
    const noop = () => {};
    const h = hookHarness(
      "src/views/player/hooks/use-auto-retry.ts",
      "useAutoRetry",
      {
        "@/lib/player/playback-clock": {
          getPlaybackBuffered: () => 0,
          getPlaybackPosition: () => 0,
          usePlaybackFlag: (predicate: () => boolean) => predicate(),
        },
        "@/lib/player/playback-end": { isTruncatedEnd: () => false },
        "@/lib/player/local-url": { isLocalUrl: () => false },
        "@/lib/picker-cache": { clearOnePickerCache: noop },
        "@/lib/streams/resolve": { resolveViaDebrids: async () => ({ ok: false }) },
        "@/lib/stream-proxy": { registerStreamProxy: async () => ({ url: "" }) },
        "@/lib/stremio-server": { buildTranscodedUrl: (u: string) => u, probeStremioServer: noop },
        "../player-utils": {
          BLACK_SCREEN_GRACE_MS: 6_000,
          MAX_AUTORETRY_ATTEMPTS: 5,
          NEVER_STARTED_CEILING_MS: 45_000,
          ROOM_STALL_MS: 9_000,
          SLOW_LOAD_MS: 50_000,
          STUCK_AUTORETRY_MS: 18_000,
        },
        "@/lib/torrent/engine-stats": { GENUINE_FAILURE_WINDOW_MS: 30_000 },
      },
      {
        window: {
          setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
          clearTimeout: noop,
          setInterval: () => 0,
          clearInterval: noop,
        },
        console: { warn: noop },
      },
    );
    const args = {
      bridgeRef: { current: null },
      src: { url: "https://media.test/a.mkv", meta: { id: "tt1" } },
      snap: { ...emptySnapshot, status: "loading" },
      stremioServerTranscode: false,
      instantPlay,
      inRoom: false,
      debrids: [],
      selfFrameReadyRef: { current: false },
      openPicker: (...args: unknown[]) => opened.push(args),
      engineFailure: false,
      isP2pEngine: false,
      engineStats: null,
    };
    h.render(args);
    for (const t of timers.filter((t) => t.ms === 18_000)) t.fn();
    const { sourceError } = h.render(args) as { sourceError: unknown };
    return [opened.length, sourceError != null];
  };
  assert.deepEqual(run(false), [0, false], "a manual pick keeps loading without an error");
  assert.deepEqual(run(true), [1, false], "instant play moves on to the next candidate");
});

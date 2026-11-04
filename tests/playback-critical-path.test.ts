// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as cached from "../src/lib/streams/cached.ts";
import * as debridTypes from "../src/lib/debrid/types.ts";
import { defaultVodBufferProperties } from "../src/lib/player/mpv-config.ts";
import { playbackStartupProfile } from "../src/lib/player/startup-profile.ts";
import { DEFAULT } from "../src/lib/settings/defaults.ts";
import { flushPromises, loadModule } from "./helpers/hook-harness.ts";
import { flushBridge, mpvBridgeHarness } from "./helpers/mpv-bridge-harness.ts";
import { pickHandlerHarness } from "./helpers/pick-handler-harness.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const nativeMpv = read("src-tauri/src/mpv.rs");
const streamProxy = read("src-tauri/src/stream_proxy.rs");
const GiB = 1024 * 1024 * 1024;

function resolver(link: Record<string, unknown>) {
  const fetches: Array<{ url: string; method?: string }> = [];
  const api = loadModule("src/lib/streams/resolve.ts", {
    "@/lib/safe-fetch": {
      safeFetch: async (url: string, init: { method?: string }) => {
        fetches.push({ url, method: init?.method });
        return { ok: true, headers: { get: () => "video/x-matroska" } };
      },
    },
    "@/lib/debug": { dwarn() {} },
    "@/lib/download/downloads-store": { completedTorrentDownloadFor: async () => null },
    "./cached": cached,
    "@/lib/debrid/types": debridTypes,
    "@/lib/debrid/playback-preparation": {
      getPreparedDebridLink: async () => null,
      invalidatePreparedDebridLink() {},
    },
    "@/lib/torrent/local-engine": {},
    "@/lib/torrent/stremio-stream": {
      directTorrentEnabled: () => false,
      engineP2pEligible: () => false,
      isHostedTorrentServerUrl: () => false,
      localTorrentAllowed: () => false,
    },
    "@/lib/stremio-server": {},
    "./episode-file": { matchEpisodeFileIndex: () => -1 },
  });
  const debrid = {
    slug: "realdebrid",
    playableUrl: async () => ({ ok: true, data: link }),
  };
  return { resolveStream: api.resolveStream, debrid, fetches };
}

const signal = () => new AbortController().signal;
const cachedStream = { infoHash: "abc", cached: { realdebrid: true }, size: 4 * GiB };

test("debrid resolution exposes exact-URL size evidence instead of issuing a duplicate HEAD", async () => {
  const sized = resolver({ url: "https://cdn.test/a.mkv", filesize: 4 * GiB });
  const r = await sized.resolveStream(cachedStream, [sized.debrid], signal(), true);
  assert.deepEqual(r.readiness, {
    exactUrlValidated: true,
    method: "provider-size",
    sizeBytes: 4 * GiB,
  });
  assert.deepEqual(sized.fetches, [], "no HEAD for a provider-sized link");

  const stub = resolver({ url: "https://cdn.test/error.mp4", filesize: 20 * 1024 * 1024 });
  const rejected = await stub.resolveStream(cachedStream, [stub.debrid], signal(), true);
  assert.equal(rejected.ok, false, "a tiny link for a large release is an error video");

  const unsized = resolver({ url: "https://cdn.test/b.mkv" });
  const plain = await unsized.resolveStream(cachedStream, [unsized.debrid], signal(), true);
  assert.deepEqual(plain.readiness, {
    exactUrlValidated: false,
    method: "not-checked",
    sizeBytes: null,
  });
  assert.deepEqual(unsized.fetches, []);
});

test("only a user commitment skips the web-page probe of an extensionless addon URL", async () => {
  const stream = { url: "https://addon.test/play/123", cached: {} };
  const committed = resolver({});
  assert.equal((await committed.resolveStream(stream, [], signal(), true)).via, "direct");
  assert.deepEqual(committed.fetches, []);
  const automatic = resolver({});
  await automatic.resolveStream(stream, [], signal(), false);
  assert.deepEqual(automatic.fetches, [{ url: stream.url, method: "HEAD" }]);
});

test("the picker preflights only debrid links without exact-URL evidence", async () => {
  const debridLink = (readiness?: unknown) =>
    pickHandlerHarness({
      resolve: async () => ({
        ok: true,
        via: "realdebrid",
        data: { url: "https://cdn.test/a.mkv" },
        readiness,
      }),
      preflight: async () => ({ ok: true }),
    });
  const validated = debridLink({ exactUrlValidated: true });
  validated.api.onPlay({ infoHash: "abc" });
  await flushPromises();
  assert.deepEqual(validated.preflights, []);
  assert.equal(validated.opened.length, 1);

  const unknown = debridLink({ exactUrlValidated: false });
  unknown.api.onPlay({ infoHash: "abc" });
  await flushPromises();
  assert.deepEqual(unknown.preflights, ["https://cdn.test/a.mkv"]);
  assert.equal(unknown.opened.length, 1);

  const direct = pickHandlerHarness({
    resolve: async () => ({ ok: true, via: "direct", data: { url: "https://addon.test/a.mkv" } }),
    redirect: async () => "https://addon.test/a.mkv",
    preflight: async () => ({ ok: true }),
  });
  direct.api.onPlay({ url: "https://addon.test/a.mkv" });
  await flushPromises();
  assert.deepEqual(direct.preflights, [], "a direct addon URL goes straight to the player");
  assert.equal(direct.opened.length, 1);
});

function preflight(responses: Array<Record<string, unknown> | null>) {
  const timers: number[] = [];
  let fetches = 0;
  const respond = async () => {
    const r = responses[Math.min(fetches++, responses.length - 1)];
    if (!r) throw new Error("network down");
    const headers = (r.headers ?? {}) as Record<string, string>;
    return {
      ok: r.status === 200 || r.status === 206,
      body: null,
      ...r,
      headers: { get: (k: string) => headers[k] ?? null },
    };
  };
  const api = loadModule(
    "src/lib/streams/preflight.ts",
    { "@tauri-apps/plugin-http": { fetch: respond }, "@/lib/safe-fetch": { safeFetch: respond } },
    {
      window: {
        __TAURI_INTERNALS__: {},
        setTimeout: (_fn: () => void, ms: number) => timers.push(ms),
        clearTimeout() {},
      },
    },
  );
  return {
    check: api.preflightCheck as (u: string) => Promise<any>,
    timers,
    fetches: () => fetches,
  };
}

test("unknown debrid links receive one short probe and transient failures are not memoized", async () => {
  const down = preflight([null, { status: 206, headers: { "Content-Range": `bytes 0-1/${GiB}` } }]);
  assert.deepEqual(await down.check("https://cdn.test/a"), {
    ok: false,
    reason: "unreachable",
    sizeBytes: null,
  });
  assert.equal(down.fetches(), 1, "a failed probe is not retried");
  assert.deepEqual(down.timers, [1200]);
  assert.equal((await down.check("https://cdn.test/a")).ok, true, "the failure was not memoized");
  await down.check("https://cdn.test/a");
  assert.equal(down.fetches(), 2, "a success is memoized");

  const failing = preflight([{ status: 503 }]);
  await failing.check("https://cdn.test/b");
  await failing.check("https://cdn.test/b");
  assert.equal(failing.fetches(), 2, "http errors are retried on the next play");

  const stub = preflight([{ status: 206, headers: { "Content-Range": "bytes 0-1/1000" } }]);
  assert.equal((await stub.check("https://cdn.test/c")).reason, "stub");
  await stub.check("https://cdn.test/c");
  assert.equal(stub.fetches(), 1, "a stub is memoized");
});

test("Windows embedded mpv is retained across compatible VOD bitrate profiles", async () => {
  const run = async (release: boolean, nextLive: boolean) => {
    const opts = { anime4k: false, hdrToSdr: false, embed: true, getEmbedRect: () => rect };
    const rect = {
      cssLeft: 0,
      cssTop: 0,
      cssWidth: 800,
      cssHeight: 450,
      cssViewW: 800,
      cssViewH: 450,
    };
    const h = mpvBridgeHarness(undefined, opts);
    h.invokeWith(async (command) => (command === "mpv_release_media" ? release : undefined));
    const first = h.createBridge(opts);
    await first.load({ url: "https://cdn.test/a.mkv", startupProfile: "standard" });
    first.destroy();
    await flushBridge();
    h.commands.length = 0;
    const next = h.createBridge(opts);
    await next.load({
      url: "https://cdn.test/b.mkv",
      startupProfile: "high-bitrate",
      isLive: nextLive,
    });
    await flushBridge();
    const names = h.commands.map((c) => c.command);
    next.destroy();
    await flushBridge();
    return names;
  };
  const kept = await run(true, false);
  assert.ok(!kept.includes("mpv_start"), "a different bitrate profile reuses the session");
  const restored = kept.indexOf("mpv_restore_media_surface");
  assert.ok(restored > 0, "the hidden media surface is restored");
  assert.ok(kept.lastIndexOf("mpv_set_geometry") > restored, "geometry is reapplied after restore");
  assert.ok((await run(true, true)).includes("mpv_start"), "live after VOD starts a new session");
  assert.ok((await run(false, false)).includes("mpv_start"), "a failed release starts fresh");
});

test("native mpv exposes the release and restore commands the retained session needs", () => {
  assert.match(nativeMpv, /pub async fn mpv_release_media/);
  assert.match(nativeMpv, /pub async fn mpv_restore_media_surface/);
  assert.match(nativeMpv, /mpv\.command\("stop", &\[\]\)/);
  assert.match(nativeMpv, /set_embedded_mpv_children_visible\(&app, false\)/);
});

test("playback timing is local-only and contains no media URLs or account identifiers", () => {
  const logs: string[] = [];
  const marks: string[] = [];
  const api = loadModule(
    "src/lib/perf/playback-trace.ts",
    { "@/lib/debug": { dlog: (line: string) => logs.push(line) } },
    {
      performance: {
        now: () => 0,
        mark: (name: string) => marks.push(name),
        measure() {},
      },
    },
  );
  const id = api.beginPlaybackTrace("debrid");
  for (const milestone of ["resolve-start", "resolve-ready", "player-opened", "first-frame"]) {
    api.markPlaybackTrace(id, milestone);
  }
  api.finishPlaybackTrace(id, "ready");
  api.markPlaybackTrace(id, "first-frame");
  assert.equal(marks.length, 6, "a finished trace takes no more marks");
  assert.ok(marks.every((m) => m.startsWith(`harbor:playback:${id}:`)));
  assert.equal(logs.length, 6);
  for (const line of logs) {
    assert.match(
      line,
      /^\[perf\]\[playback\] [a-z0-9]+-[a-z0-9]+ (committed source=\w+|[\w-]+ elapsed_ms=\d+|ready source=\w+ total_ms=\d+)$/,
    );
  }
});

function preparation() {
  let now = 0;
  const calls: string[] = [];
  const api = loadModule(
    "src/lib/debrid/playback-preparation.ts",
    { "./types": debridTypes },
    { Date: { now: () => now } },
  );
  const debrid = (slug = "realdebrid") => ({
    slug,
    playableUrl: async (magnet: string) => {
      calls.push(magnet);
      return { ok: true, data: { url: `https://cdn.test/${magnet.slice(-4)}` } };
    },
  });
  const stream = (n: number, verified = true) => ({
    infoHash: `hash${String(n).padStart(4, "0")}`,
    cacheVerified: { realdebrid: verified },
  });
  return {
    api,
    calls,
    debrid,
    stream,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("early debrid preparation is explicit, verified, bounded, and expires", async () => {
  assert.equal(DEFAULT.instantPlaybackPreparation, false);
  const p = preparation();
  const rd = p.debrid();
  const prep = (streams: unknown[], d = rd) =>
    p.api.prepareCachedDebridStreams(streams, [d], undefined, signal());
  await prep([p.stream(1, false), { ...p.stream(2), url: "https://addon.test/x" }]);
  assert.deepEqual(p.calls, [], "unverified and URL streams are never prepared");

  await prep([p.stream(1)]);
  assert.equal(
    (await p.api.getPreparedDebridLink(p.stream(1), rd, undefined, signal())).url,
    "https://cdn.test/0001",
  );
  assert.equal(
    await p.api.getPreparedDebridLink(p.stream(1), p.debrid(), undefined, signal()),
    null,
    "a different account client never shares the link",
  );
  p.api.invalidatePreparedDebridLink(p.stream(1), rd);
  assert.equal(await p.api.getPreparedDebridLink(p.stream(1), rd, undefined, signal()), null);

  await prep([p.stream(3)]);
  p.advance(2 * 60 * 1000);
  assert.equal(
    await p.api.getPreparedDebridLink(p.stream(3), rd, undefined, signal()),
    null,
    "links expire after two minutes",
  );

  const aborted = new AbortController();
  aborted.abort();
  await p.api.prepareCachedDebridStreams([p.stream(4)], [rd], undefined, aborted.signal);
  assert.equal(p.calls.length, 2);
});

test("early debrid preparation is rate limited per minute and per hour", async () => {
  const p = preparation();
  const rd = p.debrid();
  for (let i = 0; i < 8; i++)
    await p.api.prepareCachedDebridStreams([p.stream(i)], [rd], undefined, signal());
  assert.equal(p.calls.length, 6, "six per minute");
  for (let minute = 1; p.calls.length < 40 && minute < 10; minute++) {
    p.advance(61 * 1000);
    for (let i = 0; i < 8; i++) {
      await p.api.prepareCachedDebridStreams(
        [p.stream(minute * 100 + i)],
        [rd],
        undefined,
        signal(),
      );
    }
  }
  assert.equal(p.calls.length, 30, "thirty per hour");
});

test("committed debrid playback bypasses the local proxy unless request headers require it", async () => {
  const run = (headers?: Record<string, string>, intent = "play") => {
    const h = pickHandlerHarness({
      intent,
      resolve: async () => ({
        ok: true,
        via: "realdebrid",
        data: { url: "https://cdn.test/a.mkv", headers },
        readiness: { exactUrlValidated: true },
      }),
    });
    h.api.onPlay({ infoHash: "abc" });
    return flushPromises().then(() => h);
  };
  const plain = await run();
  assert.deepEqual(plain.proxies, []);
  assert.equal(plain.opened[0].url, "https://cdn.test/a.mkv");
  const headed = await run({ Referer: "https://addon.test" });
  assert.deepEqual(
    headed.proxies,
    [["https://cdn.test/a.mkv", { Referer: "https://addon.test" }]],
    "no prebuffer request",
  );
  assert.equal(headed.opened[0].url, "http://127.0.0.1:1/proxy");
  assert.equal(headed.opened[0].proxySessionId, "proxy-1");
  const download = await run({ Referer: "https://addon.test" }, "download");
  assert.deepEqual(download.proxies, []);
  assert.equal(download.downloads[0].url, "https://cdn.test/a.mkv");

  const registered: unknown[] = [];
  const proxy = loadModule("src/lib/stream-proxy.ts", {
    "@tauri-apps/api/core": {
      invoke: async (_name: string, payload: { args: unknown }) => {
        registered.push(payload.args);
        return { session_id: "s", url: "u" };
      },
    },
  });
  await proxy.registerStreamProxy("https://cdn.test/a", undefined, { prebufferBytes: 2048 });
  await proxy.registerStreamProxy("https://cdn.test/a", undefined, { prebufferBytes: 0 });
  assert.deepEqual(registered, [
    { url: "https://cdn.test/a", headers: {}, prebufferBytes: 2048 },
    { url: "https://cdn.test/a", headers: {} },
  ]);
});

test("proxy prebuffering never blocks the real player request", () => {
  assert.match(streamProxy, /PREBUFFER_MAX_BYTES: usize = 2 \* 1024 \* 1024/);
  assert.match(streamProxy, /status != StatusCode::PARTIAL_CONTENT/);
  assert.match(streamProxy, /PrebufferState::Loading \| PrebufferState::Failed => return None/);
  assert.doesNotMatch(streamProxy, /receiver\.changed\(\)\.await/);
  assert.match(streamProxy, /served playback prefix id=\{id\}/);
  assert.doesNotMatch(streamProxy, /playback prefix.*url|url=.*playback prefix/i);
});

test("startup buffering is staged and adapts without lowering media quality", () => {
  assert.equal(playbackStartupProfile({ size: 12 * GiB - 1 }), "standard");
  assert.equal(playbackStartupProfile({ size: 12 * GiB }), "high-bitrate");
  for (const resolution of ["2160p", "2160", "4320p", "4K", "8k", "UHD"]) {
    assert.equal(playbackStartupProfile({ resolution }), "high-bitrate", resolution);
  }
  assert.equal(playbackStartupProfile({ source: "BluRay REMUX" }), "high-bitrate");
  assert.equal(playbackStartupProfile({ title: "Movie.1080p.x264" }), "standard");
  assert.equal(playbackStartupProfile({ title: "Show.S01E04K.1080p" }), "standard");
  assert.equal(playbackStartupProfile({ title: "The.4Kings.2019.1080p" }), "standard");
  assert.match(nativeMpv, /startup_profile: Option<String>/);
  assert.match(nativeMpv, /if high_bitrate \{ "32MiB" \} else \{ "16MiB" \}/);
  const maxBytes = (profile: "standard" | "high-bitrate", phase: "startup" | "steady") =>
    new Map(defaultVodBufferProperties(profile, phase)).get("demuxer-max-bytes");
  assert.equal(maxBytes("standard", "startup"), "128MiB");
  assert.equal(maxBytes("high-bitrate", "startup"), "256MiB");
  assert.equal(maxBytes("standard", "steady"), "512MiB");
  assert.equal(maxBytes("high-bitrate", "steady"), "768MiB");
  assert.match(nativeMpv, /"cache-pause-initial", "no"/);
});

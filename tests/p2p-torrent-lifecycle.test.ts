// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as cached from "../src/lib/streams/cached.ts";
import * as debridTypes from "../src/lib/debrid/types.ts";
import * as filename from "../src/lib/download/filename.ts";
import { skipsPreflight } from "../src/lib/streams/link-readiness.ts";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";
import { pickHandlerHarness } from "./helpers/pick-handler-harness.ts";
import { componentHarness, findElement, stubModule } from "./helpers/component-harness.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const engine = read("src-tauri/src/torrent_engine.rs");
const streamRoute = read("src-tauri/src/torrent_engine/stream_route.rs");
const dhtBoot = read("src-tauri/src/torrent_engine/dht_boot.rs");
const HASH = "a".repeat(40);
const OTHER = "b".repeat(40);
const PENDING = "harbor-internal.torrent.pending-delete.v1";

test("selecting a torrent file does not start peer transfer", () => {
  const start = engine.indexOf("pub async fn torrent_engine_select");
  const end = engine.indexOf("pub async fn torrent_engine_stats", start);
  assert.ok(start >= 0 && end > start, "torrent_engine_select block is missing");
  const select = engine.slice(start, end);
  assert.match(select, /update_only_files_bounded\(&session, &handle, &only\)/);
  assert.doesNotMatch(select, /session\.unpause\(/);
});

test("the local HTTP stream request starts a paused torrent on demand", () => {
  assert.match(streamRoute, /if handle\.is_paused\(\)/);
  assert.match(streamRoute, /session\.unpause\(&handle\)\.await/);
});

test("persisted torrents are paused at startup and before a clean shutdown", () => {
  const prePause = engine.indexOf("mark_persisted_torrents_paused(&dir)");
  const restore = engine.indexOf("new_session(&dir, true, true, true");
  assert.ok(prePause >= 0 && restore > prePause, "session JSON must be paused before restore");
  assert.match(
    engine,
    /record\.insert\("is_paused"\.to_string\(\), serde_json::Value::Bool\(true\)\)/,
  );
  assert.match(engine, /pause_all_torrents\(&session\)\.await;/);
  const shutdown = engine.slice(
    engine.indexOf("async fn finish_session_stop"),
    engine.indexOf("pub async fn stop_async"),
  );
  assert.match(shutdown, /pause_all_torrents\(&session\)\.await;/);
  assert.match(shutdown, /session\.stop\(\)\.await;/);
});

/** Real local-engine.ts with a scripted native engine and manual timers. */
function localEngine(remove: (hash: string) => boolean = () => true) {
  const store = new Map<string, string>();
  const timers = new Map<number, { fn: () => void; ms: number }>();
  const calls: string[] = [];
  let id = 0;
  const api = loadModule(
    "src/lib/torrent/local-engine.ts",
    {
      "@tauri-apps/api/core": {
        invoke: async (name: string, args: { infoHash?: string; deleteFiles?: boolean }) => {
          calls.push(`${name} ${args?.infoHash ?? ""}${args?.deleteFiles ? " delete" : ""}`.trim());
          if (name === "torrent_engine_remove" && !remove(args.infoHash!)) throw new Error("busy");
          if (name === "torrent_engine_status") return { ready: true };
          if (name === "torrent_engine_list") return [{ infoHash: HASH }];
        },
      },
      "./full-download": { stopFullDownload: (h: string) => calls.push(`stop-full ${h}`) },
    },
    {
      window: {
        __TAURI_INTERNALS__: {},
        setTimeout: (fn: () => void, ms: number) => (timers.set(++id, { fn, ms }), id),
        clearTimeout: (i: number) => timers.delete(i),
      },
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
      console: { warn() {} },
    },
  );
  const fire = async (ms?: number) => {
    for (const [i, t] of timers) {
      if (ms != null && t.ms !== ms) continue;
      timers.delete(i);
      t.fn();
    }
    await flushPromises();
  };
  const removed = () => calls.filter((c) => c.startsWith("torrent_engine_remove"));
  const pending = () => JSON.parse(store.get(PENDING) ?? "[]");
  return { api, calls, removed, pending, timers, fire };
}

test("abandoned torrents are removed only while nobody owns them, with retries", async () => {
  const e = localEngine();
  e.api.retainTorrentUsage(HASH, "download:1");
  e.api.scheduleAbandonedTorrentRemoval(HASH, 0);
  await e.fire();
  assert.deepEqual(e.removed(), [], "an owned torrent is never abandoned");

  let failures = 2;
  const retry = localEngine(() => failures-- <= 0);
  retry.api.scheduleAbandonedTorrentRemoval(HASH, 0);
  assert.deepEqual(retry.pending(), [HASH], "the delete survives a restart until it lands");
  await retry.fire(0);
  await retry.fire(750);
  await retry.fire(2000);
  assert.deepEqual(retry.removed(), Array(3).fill(`torrent_engine_remove ${HASH} delete`));
  assert.deepEqual(retry.pending(), []);

  const claimed = localEngine(() => false);
  claimed.api.scheduleAbandonedTorrentRemoval(HASH, 0);
  await claimed.fire(0);
  claimed.api.retainTorrentUsage(HASH, "player:1", { preservePendingDelete: true });
  await claimed.fire(750);
  assert.equal(claimed.removed().length, 1, "a retry stops once a player claims the torrent");
});

test("players and downloads share a torrent, which pauses only when every owner paused", async () => {
  const e = localEngine();
  e.api.retainTorrentUsage(HASH, "download:1");
  e.api.retainTorrentUsage(HASH, "player:1");
  e.api.pauseTorrentUsage(HASH, "download:1");
  assert.ok(!e.calls.includes(`torrent_engine_pause ${HASH}`), "the player still streams");
  e.api.releaseTorrentUsage(HASH, "player:1");
  await flushPromises();
  assert.ok(e.calls.includes(`torrent_engine_pause ${HASH}`), "only paused owners remain");
  e.api.releaseTorrentUsage(HASH, "download:1", { deleteFiles: true });
  await e.fire(1200);
  assert.deepEqual(e.removed(), [`torrent_engine_remove ${HASH} delete`]);
});

test("a player handoff keeps a prepared torrent until the player claims it or times out", async () => {
  const e = localEngine();
  e.api.beginTorrentPlaybackHandoff(HASH);
  assert.deepEqual(e.pending(), [HASH], "an unclaimed handoff is deleted after a crash");
  e.api.scheduleAbandonedTorrentRemoval(HASH, 0);
  await e.fire(0);
  assert.deepEqual(e.removed(), [], "the handoff owns the torrent");
  e.api.retainTorrentUsage(HASH, "player:1", { preservePendingDelete: true });
  e.api.claimTorrentPlaybackHandoff(HASH);
  await e.fire(60000);
  assert.deepEqual(e.removed(), [], "a claimed handoff never times out into a removal");
  e.api.confirmTorrentUsage(HASH);
  assert.deepEqual(e.pending(), [], "first frame confirms the torrent");
  e.api.releaseTorrentUsage(HASH, "player:1");
  await e.fire(1200);
  assert.deepEqual(e.removed(), [`torrent_engine_remove ${HASH}`], "the claim left no owner");

  const kept = localEngine();
  kept.api.beginTorrentPlaybackHandoff(HASH);
  kept.api.retainTorrentUsage(HASH, "player:1", { preservePendingDelete: true });
  kept.api.claimTorrentPlaybackHandoff(HASH);
  kept.api.confirmTorrentUsage(HASH);
  kept.api.releaseTorrentUsage(HASH, "player:1", { removeWhenUnused: false });
  await kept.fire(60000);
  await kept.fire(0);
  assert.deepEqual(
    kept.removed(),
    [],
    "a torrent kept in the background outlives the claimed handoff",
  );

  const slow = localEngine();
  slow.api.beginTorrentPlaybackHandoff(OTHER);
  await slow.fire(60000);
  await slow.fire(0);
  assert.deepEqual(slow.removed(), [`torrent_engine_remove ${OTHER} delete`]);
});

test("a delete that fails stays pending for the next launch", async () => {
  const e = localEngine(() => false);
  await e.api.torrentEngineRemove(HASH, true);
  assert.deepEqual(e.pending(), [HASH]);
  await e.api.torrentEngineRemove(OTHER, false);
  assert.deepEqual(e.pending(), [HASH], "keeping files needs no pending delete");
});

test("pending deletes are reconciled with the engine after a restart", async () => {
  const e = localEngine();
  e.api.scheduleAbandonedTorrentRemoval(HASH, 99999);
  e.api.scheduleAbandonedTorrentRemoval(OTHER, 99999);
  await e.api.flushPendingTorrentRemovals();
  assert.deepEqual(e.removed(), [`torrent_engine_remove ${HASH} delete`]);
  assert.deepEqual(e.pending(), [], "a torrent the engine no longer has is forgotten");
});

/** Real resolve.ts with a scripted local engine; returns the engine calls. */
function p2pResolver(engineOptions: {
  managed?: boolean;
  select?: boolean;
  completed?: unknown;
  selectGate?: Promise<unknown>;
}) {
  const calls: string[] = [];
  const api = loadModule("src/lib/streams/resolve.ts", {
    "@/lib/safe-fetch": { safeFetch: async () => ({ ok: false }) },
    "@/lib/debug": { dwarn() {} },
    "@/lib/download/downloads-store": {
      completedTorrentDownloadFor: async (...args: unknown[]) => {
        calls.push(`completed ${JSON.stringify(args)}`);
        return engineOptions.completed ?? null;
      },
    },
    "./cached": cached,
    "@/lib/debrid/types": debridTypes,
    "@/lib/debrid/playback-preparation": {
      getPreparedDebridLink: async () => null,
      invalidatePreparedDebridLink() {},
    },
    "@/lib/torrent/local-engine": {
      beginTorrentPlaybackHandoff: (h: string) => calls.push(`handoff ${h}`),
      lastEngineAddError: () => null,
      scheduleAbandonedTorrentRemoval: (h: string, ms: number) => calls.push(`abandon ${h} ${ms}`),
      torrentEngineAdd: async () => {
        calls.push("add");
        return {
          info_hash: HASH,
          already_managed: engineOptions.managed === true,
          stream_base: "http://127.0.0.1:9/stream",
          files: [{ idx: 0, name: "a.mkv", length: 1 }],
        };
      },
      torrentEngineSelect: async () => {
        await engineOptions.selectGate;
        return engineOptions.select !== false;
      },
    },
    "@/lib/torrent/stremio-stream": {
      directTorrentEnabled: () => true,
      engineP2pEligible: () => true,
      isHostedTorrentServerUrl: () => false,
      isVideoFile: () => true,
      localTorrentAllowed: () => true,
      trackersFromSources: () => [],
    },
    "@/lib/stremio-server": {
      remoteStreamServerStrict: () => false,
      remoteStreamServerUrl: () => null,
    },
    "./episode-file": { matchEpisodeFileIndex: () => -1 },
  });
  return { resolveStream: api.resolveStream, calls };
}

const p2pStream = {
  infoHash: HASH,
  fileIdx: 0,
  cached: {},
  subtitles: [{ url: "s.srt", lang: "en" }],
};

test("a P2P resolve hands its new torrent to the player, or cleans it up when it fails", async () => {
  const ok = p2pResolver({});
  const r = await ok.resolveStream(p2pStream, [], new AbortController().signal, true, true);
  assert.equal(r.via, "p2p");
  assert.equal(r.data.url, `http://127.0.0.1:9/stream/${HASH}/0`);
  assert.deepEqual(ok.calls.slice(1), ["add", `handoff ${HASH}`]);

  const badSelect = p2pResolver({ select: false });
  await badSelect.resolveStream(p2pStream, [], new AbortController().signal, true, true);
  assert.deepEqual(
    badSelect.calls.slice(1),
    ["add", `abandon ${HASH} 0`],
    "a failed selection is retryable",
  );

  const managed = p2pResolver({ managed: true, select: false });
  await managed.resolveStream(p2pStream, [], new AbortController().signal, true, true);
  assert.deepEqual(managed.calls.slice(1), ["add"], "a torrent another owner added is left alone");
});

test("cancelling a P2P resolve removes only the torrent it created", async () => {
  const run = async (managed: boolean) => {
    let release!: () => void;
    const selectGate = new Promise<void>((r) => (release = r));
    const resolver = p2pResolver({ managed, selectGate });
    const ac = new AbortController();
    const done = resolver.resolveStream(p2pStream, [], ac.signal, true, true);
    await flushPromises();
    ac.abort();
    release();
    await done;
    return resolver.calls.filter((c) => c.startsWith("abandon"));
  };
  assert.deepEqual(
    await run(false),
    [`abandon ${HASH} undefined`, `abandon ${HASH} 0`],
    "the abort schedules removal, and the failed handoff removes it at once",
  );
  assert.deepEqual(await run(true), []);
});

test("completed P2P downloads are reused before any torrent is added", async () => {
  const completed = { path: "D:/a.mkv", torrentFileIdx: 3, totalBytes: 9, streamLabel: "1080p" };
  const reuse = p2pResolver({ completed });
  const hint = { season: 1, episode: 2 };
  const r = await reuse.resolveStream(
    p2pStream,
    [],
    new AbortController().signal,
    true,
    true,
    hint,
  );
  assert.equal(r.via, "local-download");
  assert.deepEqual(r.data, {
    url: "D:/a.mkv",
    fileIdx: 3,
    filesize: 9,
    notWebReady: true,
    filename: "1080p",
    subtitles: [{ url: "s.srt", lang: "en", id: undefined }],
  });
  assert.deepEqual(reuse.calls, [`completed ${JSON.stringify([HASH, 0, hint])}`]);
  assert.equal(skipsPreflight(r), true, "a local file is never probed");

  const download = p2pResolver({ completed });
  await download.resolveStream(
    p2pStream,
    [],
    new AbortController().signal,
    true,
    true,
    hint,
    true,
    false,
  );
  assert.ok(
    !download.calls.some((c) => c.startsWith("completed")),
    "a new download never reuses itself",
  );
});

function downloadsStore(files: Set<string>) {
  const engineCalls: string[] = [];
  const store = new Map<string, string>();
  const api = loadModule(
    "src/lib/download/downloads-store.ts",
    {
      "@tauri-apps/api/path": { downloadDir: async () => "D:/dl" },
      "@tauri-apps/plugin-fs": {
        exists: async (p: string) => files.has(p),
        mkdir: async () => {},
        remove: async () => {},
      },
      "@tauri-apps/plugin-opener": { revealItemInDir: async () => {} },
      react: { useSyncExternalStore: () => [] },
      "./filename": filename,
      "./video-download": {
        startDownload: () => ({ promise: new Promise(() => {}), abort() {} }),
      },
      "@/lib/platform": { isWindowsDesktop: () => false },
      "@/lib/torrent/local-engine": {
        localEngineStreamRef: (url: string) => {
          const m = url.match(/\/stream\/([a-f0-9]{40})\/(\d+)$/);
          return m ? { infoHash: m[1], fileIdx: Number(m[2]) } : null;
        },
        pauseTorrentUsage: (h: string, o: string) => engineCalls.push(`pause ${o}`),
        releaseTorrentUsage: (h: string, o: string, opts: unknown) =>
          engineCalls.push(`release ${o} ${JSON.stringify(opts)}`),
        retainTorrentUsage: (h: string, o: string) => engineCalls.push(`retain ${o}`),
        torrentEnginePause: async () => {},
        torrentEngineSelectSet: async () => {},
      },
    },
    {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
      crypto: {
        randomUUID: (() => {
          let n = 0;
          return () => `id${++n}`;
        })(),
      },
    },
  );
  return { api, engineCalls, store };
}

test("downloads own their torrent, deduplicate, and record its exact identity", async () => {
  const d = downloadsStore(new Set());
  const meta = { id: "tt1", name: "Movie" };
  const url = `http://127.0.0.1:9/stream/${HASH}/4`;
  const id = await d.api.enqueueDownload({ meta, url, destinationPath: "E:/movie.mkv" });
  assert.equal(await d.api.enqueueDownload({ meta, url }), id, "an active download is reused");
  const item = d.api.downloadsSnapshot()[0];
  assert.deepEqual(
    [item.path, item.torrentInfoHash, item.torrentFileIdx],
    ["E:/movie.mkv", HASH, 4],
  );
  assert.deepEqual(d.engineCalls, [`retain download:${id}`]);
  d.api.pauseDownload(id);
  d.api.cancelDownload(id);
  assert.deepEqual(d.engineCalls.slice(1), [
    `pause download:${id}`,
    `release download:${id} {"deleteFiles":true}`,
  ]);
});

test("a completed torrent download is found by exact hash, file and episode", async () => {
  const path = (n: number) => `D:/dl/${n}.mkv`;
  const items = [
    { n: 1, idx: 1, season: 1, episode: 1, status: "done" },
    { n: 2, idx: 2, season: 1, episode: 2, status: "done" },
    { n: 3, idx: 3, season: 1, episode: 3, status: "error" },
    { n: 4, idx: 4, season: 1, episode: 4, status: "done", hash: OTHER },
  ].map((i) => ({
    id: `d${i.n}`,
    metaId: "tt1",
    path: path(i.n),
    url: "",
    status: i.status,
    season: i.season,
    episode: i.episode,
    startedAt: i.n,
    torrentInfoHash: (i.hash ?? HASH).toUpperCase(),
    torrentFileIdx: i.idx,
  }));
  const d = downloadsStore(new Set([path(1), path(2), path(3), path(4)]));
  d.store.set("harbor.downloads.v1", JSON.stringify(items));
  const find = (fileIdx?: number, hint?: unknown) =>
    d.api.completedTorrentDownloadFor(HASH, fileIdx, hint).then((m: any) => m?.id ?? null);
  assert.equal(await find(2), "d2");
  assert.equal((await d.api.completedTorrentDownloadFor(` ${HASH.toUpperCase()}`, 2))?.id, "d2");
  assert.equal(await find(3), null, "an unfinished download is not reused");
  assert.equal(await find(4), null, "another torrent's file is not reused");
  assert.equal(await find(undefined, { season: 1, episode: 1 }), "d1");
  assert.equal(await find(undefined, { season: 1, episode: 9 }), null);
  assert.equal(await find(), null, "an ambiguous pack needs a file or episode");
  const gone = downloadsStore(new Set());
  gone.store.set("harbor.downloads.v1", JSON.stringify(items));
  assert.equal(
    await gone.api.completedTorrentDownloadFor(HASH, 2),
    null,
    "a deleted file is not reused",
  );
});

test("the player download button uses the persistent Downloads store", async () => {
  const enqueued: unknown[] = [];
  const cancelled: string[] = [];
  let downloads: unknown[] = [];
  const h = hookHarness("src/views/player/hooks/use-video-download.ts", "useVideoDownload", {
    "@tauri-apps/api/path": { downloadDir: async () => "D:/dl" },
    "@tauri-apps/plugin-dialog": { save: async () => "E:/picked.mkv" },
    "@/lib/i18n": { t: (s: string) => s },
    "@/lib/download/downloads-store": {
      cancelDownload: (id: string) => cancelled.push(id),
      enqueueDownload: async (args: unknown) => (enqueued.push(args), "id1"),
      revealDownload: async () => {},
      useDownloads: () => downloads,
    },
    "@/lib/download/filename": filename,
    "@/lib/settings": {
      useSettingsSelector: (select: (s: unknown) => unknown) => select({ downloadDir: "" }),
    },
    "@/lib/platform": { isWindowsDesktop: () => false },
  });
  const args = {
    url: "https://cdn.test/a.mkv",
    meta: { id: "tt1", name: "Movie" },
    headers: { Referer: "x" },
  };
  await h.render(args).start();
  assert.deepEqual(enqueued, [
    {
      meta: args.meta,
      episode: undefined,
      url: args.url,
      headers: args.headers,
      destinationPath: "E:/picked.mkv",
    },
  ]);
  downloads = [
    {
      id: "id1",
      metaId: "tt1",
      url: args.url,
      season: null,
      episode: null,
      status: "downloading",
      ratio: 0.5,
      receivedBytes: 1,
      totalBytes: 2,
    },
  ];
  const state = h.render(args);
  assert.equal(state.status.kind, "downloading");
  state.cancel();
  assert.deepEqual(cancelled, ["id1"]);
});

function playerMedia(settings: Record<string, unknown>) {
  const calls: string[] = [];
  const noop = () => {};
  const autoSync = { status: "idle", offer: null };
  const h = hookHarness("src/views/player/hooks/use-player-media.ts", "usePlayerMedia", {
    "@/lib/auth": {},
    "@/lib/download-text": { downloadText: noop },
    "@/lib/subtitles/extract": { getCuesAnySource: noop },
    "@/lib/subtitles/serialize": { toSrt: noop },
    "@/lib/platform": { isWindowsDesktop: () => false },
    "@/lib/player/sub-format": { isAssTrack: () => false, isImageSubTrack: () => false },
    "@/lib/player/imported-subs": { clearImportedSubs: noop },
    "@/lib/player-volume": { readPlayerVolume: () => ({ volume: 1, muted: false }) },
    "@/lib/player-actions": { setPlayerActions: noop },
    "@/lib/settings": {},
    "@/lib/simkl/scrobble-hook": { useSimklScrobble: noop },
    "@/lib/trakt/scrobble-hook": { useTraktScrobble: noop },
    "@/lib/media-server/progress-sync": { useMediaServerProgress: noop },
    "@/lib/torrent/local-engine": {
      claimTorrentPlaybackHandoff: () => calls.push("claim"),
      confirmTorrentUsage: () => calls.push("confirm"),
      localEngineStreamRef: (url: string) =>
        url.includes("/stream/") ? { infoHash: HASH, fileIdx: 0 } : null,
      releaseTorrentUsage: (_h: string, _o: string, opts: unknown) =>
        calls.push(`release ${JSON.stringify(opts)}`),
      retainTorrentUsage: (_h: string, _o: string, opts: unknown) =>
        calls.push(`retain ${JSON.stringify(opts)}`),
    },
    "@/lib/torrent/full-download": {
      startFullDownload: () => calls.push("full"),
      stopAllFullDownloads: noop,
      stopFullDownload: () => calls.push("stop-full"),
    },
    "./use-exit-snapshot": { useExitSnapshot: () => ({ captureExitSnapshot: noop }) },
    "./use-power-inhibit": { usePowerInhibit: noop },
    "./use-resume-autosave": { useResumeAutosave: noop },
    "./use-stremio-sync": { useStremioSync: noop },
    "./use-sub-drop": { useSubDrop: () => null },
    "./use-sub-style-apply": { useSubStyleApply: noop },
    "./use-ass-normalize": { useAssNormalize: () => null },
    "./use-track-autoload": { useTrackAutoload: () => ({}) },
    "./use-translation-auto-select": { useTranslationAutoSelect: noop },
    "./use-secondary-sub": { useSecondarySub: noop },
    "./use-auto-sync": { useAutoSync: () => autoSync },
    "@/components/player/autosync/autosync-store": { publishAutoSync: noop },
    "./use-video-download": { useVideoDownload: () => ({ start: noop }) },
    "./use-webview-memory": { useWebviewMemory: noop },
    "@/lib/player/captions-popout-state": { useCaptionsPopoutOpen: () => false },
    "@/lib/subtitles/sdh-filter": { sdhFilterAllowed: () => true },
  });
  const render = (snap: Record<string, unknown>) =>
    h.render({
      src: { url: `http://127.0.0.1:9/stream/${HASH}/0`, meta: { id: "tt1", name: "Movie" } },
      snap: { ...emptySnapshot, ...snap },
      engine: "mpv",
      settings: { streamCacheRetentionHours: 24, deleteWatchedDownloads: false, ...settings },
      authKey: null,
      bridgeRef: { current: null },
      bridgeReady: false,
      bridgeKey: 1,
      svpActive: false,
      videoMountRef: { current: null },
      toggleFullscreen: noop,
      castActiveRef: { current: false },
    });
  return { calls, render, unmount: () => h.unmount() };
}

test("the player owns its torrent before full downloading and purges a stream that never played", () => {
  const never = playerMedia({ torrentFullDownload: true });
  never.render({});
  assert.deepEqual(never.calls, ['retain {"preservePendingDelete":true}', "claim", "full"]);
  never.unmount();
  assert.deepEqual(never.calls.slice(3), [
    "stop-full",
    'release {"deleteFiles":true,"removeWhenUnused":true}',
  ]);

  const played = playerMedia({ keepStreamDownloadsInBackground: true });
  played.render({});
  played.render({ firstFrameReady: true });
  assert.ok(played.calls.includes("confirm"), "the first frame confirms the torrent");
  played.unmount();
  assert.equal(played.calls.at(-1), 'release {"deleteFiles":false,"removeWhenUnused":false}');
});

test("failed P2P preparation stays retryable and the picker reports the P2P phase", async () => {
  const fail = (code: string) => {
    const h = pickHandlerHarness({ resolve: async () => ({ ok: false, code }) });
    h.api.onPlay({ infoHash: HASH });
    return flushPromises().then(() => h.failed.length);
  };
  assert.equal(await fail("engine-no-peers"), 0);
  assert.equal(await fail("engine-not-ready"), 0);
  assert.equal(await fail("all-debrids-failed"), 1);

  const p2p = pickHandlerHarness({
    p2pEligible: true,
    resolve: async () => ({ ok: false, code: "x" }),
  });
  p2p.api.onPlay({ infoHash: HASH, cached: {} }, true, true);
  assert.equal((p2p.resolving[0] as { p2p: boolean }).p2p, true);
  const debrid = pickHandlerHarness({
    p2pEligible: false,
    resolve: async () => ({ ok: false, code: "x" }),
  });
  debrid.api.onPlay({ infoHash: HASH, cached: {} }, true, true);
  assert.equal((debrid.resolving[0] as { p2p: boolean }).p2p, false);
});

test("raw torrent downloads use the same P2P classification as the picker", async () => {
  const run = (intent: string, prefer: boolean) => {
    const h = pickHandlerHarness({
      intent,
      preferP2pDownload: prefer,
      resolve: async () => ({ ok: false, code: "x" }),
    });
    h.api.onPlay({ infoHash: HASH, cached: {} });
    return h.resolveCalls[0];
  };
  const forceP2p = (args: unknown[]) => args[4];
  assert.equal(forceP2p(run("download", true)), true);
  assert.equal(forceP2p(run("download", false)), false);
  assert.equal(forceP2p(run("play", true)), false, "only downloads take the P2P preference");
  assert.equal(run("download", false)[7], false, "a download never resolves to a finished one");
  assert.equal(run("play", false)[7], true);
});

function seasonPack(added: unknown, allowed = true) {
  const calls: string[] = [];
  const enqueued: string[] = [];
  const api = loadModule("src/lib/download/season-download.ts", {
    "@/lib/auto-download/resolve": {},
    "@/lib/debrid/types": debridTypes,
    "@/lib/streams/resolve": {
      resolveStream: async (_s: unknown, _d: unknown, _sig: unknown, ...rest: unknown[]) => {
        calls.push(`resolve ${JSON.stringify(rest)}`);
        return { ok: true, data: { url: `https://cdn.test/${calls.length}` } };
      },
    },
    "@/lib/streams/episode-file": {
      matchEpisodeFileIndex: (names: string[], ep: { episode: number }) =>
        names.findIndex((n) => n.includes(`E0${ep.episode}`)),
    },
    "@/lib/local-library": { isVideoFile: () => true },
    "@/lib/torrent/stremio-stream": {
      localTorrentAllowed: () => allowed,
      trackersFromSources: () => [],
    },
    "@/lib/torrent/local-engine": {
      torrentEngineAdd: async () => (calls.push("add"), added),
      torrentEngineSelectSet: async (_h: string, idx: number[]) => calls.push(`select ${idx}`),
    },
    "@/lib/download/downloads-store": {
      activeDownloadFor: () => null,
      enqueueDownload: async (a: { url: string }) => enqueued.push(a.url),
    },
    "./season-pack": {
      seasonPackFileMatchesEpisode: () => true,
      streamForSeasonPackEpisode: (s: unknown) => s,
    },
  });
  const episodes = [1, 2, 3].map((episode) => ({ season: 1, episode }));
  const run = () =>
    api.downloadSeasonFromPack({
      meta: { id: "tt1" },
      episodes,
      stream: { infoHash: HASH },
      streamLabel: null,
      debrids: [],
      signal: new AbortController().signal,
    });
  return { run, calls, enqueued };
}

test("P2P season packs use one atomic torrent before concurrent debrid fallback", async () => {
  const files = ["S01E01.mkv", "S01E02.mkv", "S01E03.mkv"].map((name, idx) => ({ idx, name }));
  const pack = seasonPack({ info_hash: HASH, stream_base: "http://e/stream", files });
  assert.deepEqual(await pack.run(), { total: 3, queued: 3, failed: 0 });
  assert.deepEqual(pack.calls, ["add", "select 0,1,2"]);
  assert.deepEqual(
    pack.enqueued,
    [0, 1, 2].map((i) => `http://e/stream/${HASH}/${i}`),
  );
  const shared = seasonPack({
    info_hash: HASH,
    stream_base: "http://e/stream",
    files: [{ idx: 0, name: "S01E01E02.mkv" }],
  });
  assert.deepEqual(
    await shared.run(),
    { total: 3, queued: 1, failed: 2 },
    "one file is queued once",
  );

  const fallback = seasonPack(null);
  assert.deepEqual(await fallback.run(), { total: 3, queued: 3, failed: 0 });
  assert.equal(fallback.calls.filter((c) => c === "add").length, 1, "the engine is tried once");
  assert.deepEqual(
    fallback.calls.filter((c) => c.startsWith("resolve")).map((c) => JSON.parse(c.slice(8))),
    [1, 2, 3].map((episode) => [true, false, { season: 1, episode }, true]),
    "committed, not forced to P2P, with a finished-download lookup",
  );
  assert.deepEqual((await seasonPack(null, false).run()).queued, 3);
});

test("slow P2P discovery reports its real phase and a recoverable failure", () => {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const h = hookHarness(
    "src/views/play-picker/auto-play-transition.tsx",
    "AutoPlayTransition",
    {
      "@/components/harbor-loader": { HarborLoader: "HarborLoader" },
      "@/lib/dead-streams": { consumeRecentStubEvent: () => null },
      "@/lib/profiles": { useActiveKid: () => false },
      "@/lib/providers/kitsu": { parseKitsuId: () => null },
      "@/lib/streams/anime-identity-core": { splitFranchiseDisplaySeason: () => null },
      "./logo-or-text": { LogoOrText: "LogoOrText" },
      "@/lib/i18n": { useT: () => (s: string) => s },
      "react/jsx-runtime": {
        jsx: (type: unknown, props: any) => ({ type, props }),
        jsxs: (type: unknown, props: any) => ({ type, props }),
      },
    },
    {
      window: {
        setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
        clearTimeout() {},
      },
    },
  );
  type N = { type: unknown; props: any };
  const all = (n: unknown): N[] =>
    Array.isArray(n)
      ? n.flatMap(all)
      : n && typeof n === "object"
        ? [n as N, ...all((n as N).props?.children)]
        : [];
  h.render({ meta: { name: "Movie" }, resolving: true, p2p: false, onCancel() {} });
  assert.deepEqual(timers, [], "a debrid resolve never shows the P2P phases");
  const props = { meta: { name: "Movie" }, resolving: true, p2p: true, onCancel() {} };
  const caption = () => all(h.render(props)).find((n) => n.type === "HarborLoader")!.props.caption;
  assert.equal(caption(), "Connecting");
  assert.deepEqual(
    timers.map((t) => t.ms),
    [6000, 25000],
  );
  timers[0].fn();
  assert.equal(caption(), "P2P · Searching sources…");
  timers[1].fn();
  assert.equal(caption(), "P2P · Stream is taking a while");
  const cancel = all(h.render(props)).find((n) => n.props?.onClick === props.onCancel)!;
  assert.ok([cancel.props.children].flat().includes("Choose another source"));
});

/** Runs the real `MagnetCard` against a scripted local engine. */
function magnetCard(added: Record<string, unknown> | null) {
  const removals: Array<[string, number]> = [];
  const events: string[] = [];
  const opened: Array<{ url: string }> = [];
  const h = componentHarness(
    "src/components/search/magnet-card.tsx",
    "MagnetCard",
    {
      "lucide-react": stubModule(),
      "@/components/icons/play-filled": stubModule(),
      "parse-torrent-title": { parse: () => ({ title: "" }) },
      "@/lib/stremio-server": {
        awaitCastServerReady: async () => true,
        remoteStreamServerUrl: () => null,
      },
      "@/lib/torrent/magnet": {
        parseMagnet: () => ({ infoHash: HASH, trackers: [], name: "Movie.2020.mkv" }),
      },
      "@/lib/torrent/stremio-stream": {
        buildTorrentStreamUrl: () => "unused",
        createAndListFiles: async () => null,
        isVideoFile: (f: { name: string }) => f.name.endsWith(".mkv"),
      },
      "@/lib/torrent/local-engine": {
        lastEngineAddError: () => null,
        scheduleAbandonedTorrentRemoval: (hash: string, ms: number) => removals.push([hash, ms]),
        torrentEngineAdd: async () => added,
        torrentEngineSelect: async () => void events.push("select"),
      },
      "@/lib/search": { searchCinemeta: async () => ({ movies: [], series: [] }) },
      "@/lib/cinemeta": { meta: async () => null },
      "./result-poster": stubModule(),
      "@/lib/view": {
        useViewActions: () => ({
          openPlayer: (src: { url: string }) => (events.push("open"), opened.push(src)),
        }),
      },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/release-info": { releaseYear: () => NaN },
    },
    { window: { __TAURI_INTERNALS__: {} } },
  );
  const tree = h.render({
    raw: `magnet:?xt=urn:btih:${HASH}`,
    onClose: () => events.push("close"),
  });
  const play = findElement(tree, (el) => el.type === "button")!;
  return {
    play: async () => (play.props.onClick(), await flushPromises()),
    h,
    removals,
    events,
    opened,
  };
}

const engineFiles = (...names: string[]) =>
  names.map((name, idx) => ({ idx, name, length: 1000 - idx }));

test("closing magnet setup removes a newly-created torrent before player handoff", async () => {
  const fresh = magnetCard({
    info_hash: OTHER,
    stream_base: "http://127.0.0.1:11470",
    files: engineFiles("a.mkv", "b.mkv"),
  });
  await fresh.play();
  assert.deepEqual(fresh.removals, [], "nothing is removed while the file list is open");
  fresh.h.unmount();
  assert.deepEqual(fresh.removals, [[OTHER, 0]], "closing the picker removes the torrent it added");

  const owned = magnetCard({
    info_hash: OTHER,
    stream_base: "http://127.0.0.1:11470",
    files: engineFiles("a.mkv", "b.mkv"),
    already_managed: true,
  });
  await owned.play();
  owned.h.unmount();
  assert.deepEqual(owned.removals, [], "a torrent another owner manages is left alone");

  const single = magnetCard({
    info_hash: OTHER,
    stream_base: "http://127.0.0.1:11470",
    files: engineFiles("movie.mkv", "sample.txt"),
  });
  await single.play();
  assert.deepEqual(
    single.events,
    ["select", "close", "open"],
    "the card closes before the player opens",
  );
  assert.equal(single.opened[0].url, `http://127.0.0.1:11470/${OTHER}/0`);
  single.h.unmount();
  assert.deepEqual(single.removals, [], "the player owns the torrent once it opens");

  const empty = magnetCard({
    info_hash: OTHER,
    stream_base: "http://127.0.0.1:11470",
    files: engineFiles("readme.txt"),
  });
  await empty.play();
  assert.deepEqual(empty.removals, [[OTHER, 0]], "a torrent with no video is removed at once");
  empty.h.unmount();
  assert.equal(empty.removals.length, 1);
});

test("failed P2P preparation is discarded in the native engine", () => {
  assert.match(engine, /async fn wait_for_torrent_initialization/);
  assert.match(engine, /discard_on_failure/);
  assert.match(
    engine,
    /session\s+\.delete\(TorrentIdOrHash::Hash\(handle\.info_hash\(\)\), true\)/,
  );
  assert.match(engine, /wait_for_torrent_initialization\(session, &handle, !already_managed\)/);
  assert.match(engine, /wait_for_torrent_initialization\(&session, &h, !already_managed\)/);
});

test("existing torrent preparation is reused without repeating magnet discovery", () => {
  const addStart = engine.indexOf("pub async fn torrent_engine_add");
  const seedStart = engine.indexOf("dht_boot::seed_peers", addStart);
  const existingLookup = engine.indexOf("session.get(TorrentIdOrHash::Hash(info_hash))", addStart);
  assert.ok(existingLookup > addStart && existingLookup < seedStart);
  assert.match(dhtBoot, /pub\(crate\) fn info_hash_from_magnet/);
});

test("torrent file selection has a bounded recoverable wait", () => {
  assert.match(engine, /const FILE_SELECTION_TIMEOUT_SECS: u64 = 12/);
  assert.match(engine, /async fn update_only_files_bounded/);
  assert.match(engine, /"torrent file selection timed out"/);
});

test("local P2P streaming supports media-player byte ranges", () => {
  assert.match(streamRoute, /parse_range\(value, len\)/);
  assert.match(streamRoute, /len\.saturating_sub\(suffix_len\)/);
  assert.match(streamRoute, /inclusive_end\.saturating_add\(1\)\.min\(len\)/);
  assert.match(streamRoute, /bytes \*\/\{len\}/);
});

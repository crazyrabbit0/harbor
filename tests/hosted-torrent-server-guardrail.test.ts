// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import * as cached from "../src/lib/streams/cached.ts";
import * as debridTypes from "../src/lib/debrid/types.ts";
import { isHostedTorrentServerUrl } from "../src/lib/torrent/stremio-stream.ts";
import { loadModule } from "./helpers/hook-harness.ts";

const HASH = "0123456789abcdef0123456789abcdef01234567";
const HOSTED = `https://streaming.strem.io/${HASH}/0`;
const ENGINE = `http://127.0.0.1:9/stream/${HASH}/0`;

/** Real resolve.ts with the real hosted-server check and a local engine that serves or declines. */
function resolver(engineServes: boolean) {
  const calls: string[] = [];
  const api = loadModule("src/lib/streams/resolve.ts", {
    "@/lib/safe-fetch": { safeFetch: async () => ({ ok: false }) },
    "@/lib/debug": { dwarn() {} },
    "@/lib/download/downloads-store": { completedTorrentDownloadFor: async () => null },
    "./cached": cached,
    "@/lib/debrid/types": debridTypes,
    "@/lib/debrid/playback-preparation": {
      getPreparedDebridLink: async () => null,
      invalidatePreparedDebridLink() {},
    },
    "@/lib/torrent/local-engine": {
      beginTorrentPlaybackHandoff() {},
      lastEngineAddError: () => null,
      scheduleAbandonedTorrentRemoval() {},
      torrentEngineAdd: async () => {
        calls.push("engine");
        if (!engineServes) return null;
        return {
          info_hash: HASH,
          already_managed: false,
          stream_base: "http://127.0.0.1:9/stream",
          files: [{ idx: 0, name: "a.mkv", length: 1 }],
        };
      },
      torrentEngineSelect: async () => true,
    },
    "@/lib/torrent/stremio-stream": {
      directTorrentEnabled: () => true,
      engineP2pEligible: () => true,
      isHostedTorrentServerUrl,
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
  const resolve = (url: string) =>
    api.resolveStream(
      { infoHash: HASH, fileIdx: 0, url, cached: {} },
      [],
      new AbortController().signal,
      true,
    );
  return { resolve, calls };
}

test("a torrent url pointed at a hosted streaming server is recognised", () => {
  assert.equal(isHostedTorrentServerUrl(`https://streaming.strem.io/${HASH}/0`), true);
  assert.equal(
    isHostedTorrentServerUrl(`https://strem.io/${HASH}/-1?tr=udp%3A%2F%2Ftracker`),
    true,
  );
  assert.equal(isHostedTorrentServerUrl(`http://192.168.1.50:11470/${HASH}/2`), true);
});

test("Harbor's own engine and ordinary direct links are left alone", () => {
  assert.equal(isHostedTorrentServerUrl(`http://127.0.0.1:11470/${HASH}/0`), false);
  assert.equal(isHostedTorrentServerUrl(`http://localhost:11470/${HASH}/0`), false);
  assert.equal(isHostedTorrentServerUrl("https://dl.real-debrid.example/d/TOKEN/Movie.mkv"), false);
  assert.equal(isHostedTorrentServerUrl(`https://addon.example/${HASH}/0`), false);
  assert.equal(isHostedTorrentServerUrl("not a url"), false);
  assert.equal(isHostedTorrentServerUrl(undefined), false);
});

test("resolve tries the torrent engine before it hands a hosted server url to the player", async () => {
  const r = resolver(true);
  const result = await r.resolve(HOSTED);
  assert.equal(result.via, "p2p");
  assert.equal(result.data.url, ENGINE);
  assert.deepEqual(r.calls, ["engine"]);

  const plain = resolver(true);
  const direct = await plain.resolve("https://dl.real-debrid.example/d/TOKEN/Movie.mkv");
  assert.equal(direct.via, "direct", "an ordinary link with a hash goes straight to the player");
  assert.deepEqual(plain.calls, []);
});

test("the guardrail still falls through to the addon url when the engine declines", async () => {
  const r = resolver(false);
  const result = await r.resolve(HOSTED);
  assert.deepEqual(r.calls, ["engine"]);
  assert.equal(
    result.ok,
    true,
    "a hosted server url must stay reachable when the engine cannot serve the torrent",
  );
  assert.equal(result.via, "direct");
  assert.equal(result.data.url, HOSTED);
});

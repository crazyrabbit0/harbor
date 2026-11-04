// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { downloadPlayerSrc } from "../src/lib/download/player-src.ts";
import { localPlayerSrc } from "../src/lib/local-library/player-src.ts";
import { subtitleStreamDescriptor } from "../src/lib/subtitles/provider-label.ts";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { hookHarness } from "./helpers/hook-harness.ts";

test("local and downloaded playback carry the exact filename into subtitle search", () => {
  const local = localPlayerSrc({
    id: "local-1",
    path: "D:\\Shows\\Show.S01E03.BluRay.mkv",
    filename: "Show.S01E03.BluRay.mkv",
    title: "Show",
    year: 2025,
    type: "show",
    season: 1,
    episode: 3,
    subtitlePaths: ["D:\\Shows\\Show.S01E03.BluRay.ar.srt"],
    addedAt: 1,
  });
  assert.equal(subtitleStreamDescriptor(local.streamRef), "Show.S01E03.BluRay.mkv");
  assert.deepEqual(local.subtitles, [
    {
      url: "D:\\Shows\\Show.S01E03.BluRay.ar.srt",
      lang: "ar",
      trustedSource: true,
    },
  ]);

  const downloaded = downloadPlayerSrc(
    { id: "tt1234567", type: "series", name: "Show" },
    { season: 1, episode: 3 },
    {
      id: "download-1",
      path: "D:\\Downloads\\Show.S01E03.WEB-DL.mkv",
      title: "Show",
      status: "done",
      startedAt: 1,
    },
  );
  assert.equal(subtitleStreamDescriptor(downloaded.streamRef), "Show.S01E03.WEB-DL.mkv");
});

test("debrid playback retains the resolver-selected episode filename", () => {
  const picker = readFileSync(
    new URL("../src/views/play-picker/use-pick-handler.ts", import.meta.url),
    "utf8",
  );
  const episodePanel = readFileSync(
    new URL("../src/components/player/episode-panel/index.tsx", import.meta.url),
    "utf8",
  );

  assert.match(picker, /resolvedFilename:\s*[\s\S]{0,100}r\.data\.filename/);
  assert.match(episodePanel, /resolvedFilename:\s*[\s\S]{0,100}r\.data\.filename/);
});

test("an in-player stream swap keeps the resolver's episode filename and file index", async () => {
  const noop = () => {};
  const h = hookHarness(
    "src/views/player/hooks/use-stream-switcher.ts",
    "useStreamSwitcher",
    {
      "@/lib/player/playback-clock": {
        getPlaybackPosition: () => 0,
        usePlaybackFlag: () => false,
      },
      "@/lib/picker-cache": { pinPickerCache: noop, unpinPickerCache: noop },
      "@/lib/resume": { readResumeMs: () => 0 },
      "@/lib/dead-streams": { SHORT_PLAYBACK_SEC: 180 },
      "@/lib/playback-history": { savePlayback: noop },
      "@/lib/streams/resolve": {
        resolveStream: async () => ({
          ok: true,
          via: "debrid",
          data: { url: "https://debrid.test/f", filename: "Show.S01E03.mkv", fileIdx: 3 },
        }),
      },
      "@/lib/stream-proxy": { registerStreamProxy: noop, unregisterStreamProxy: noop },
      "@/lib/player/startup-profile": { playbackStartupProfile: () => undefined },
      "@/lib/streams/playback-redirect": { resolvePlaybackRedirect: noop },
    },
    { window: { setTimeout: () => 1, clearTimeout: noop } },
  );
  const bridge = { load: async () => {}, play: async () => {} };
  const args = {
    bridgeRef: { current: bridge },
    src: { url: "https://a.test/1", meta: { id: "tt1", name: "Show" }, episode: undefined },
    snap: emptySnapshot,
    debrids: [],
  };
  const stream = {
    infoHash: "abc",
    fileIdx: 0,
    behaviorHints: { filename: "Season.Pack.mkv" },
    addonId: "addon",
  };
  await h.render(args).onSwitchStream(stream);
  const live = h.render(args).liveStreamRef;
  assert.equal(subtitleStreamDescriptor(live), "Show.S01E03.mkv");
  assert.equal(live.fileIdx, 3);
});

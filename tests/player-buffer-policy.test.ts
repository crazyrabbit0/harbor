// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import type { Settings } from "../src/lib/settings/types.ts";
import { compileMpvOptions, svpMpvLines } from "../src/lib/player/mpv-tuning.ts";
import { resolvePlaybackDownloadedFraction } from "../src/lib/player/playback-clock.ts";
import { playbackStartupProfile } from "../src/lib/player/startup-profile.ts";
import { effectContaining, sourceCallback } from "./helpers/source-callback.ts";

test("only the P2P engine reports whole-file download progress", () => {
  assert.equal(
    resolvePlaybackDownloadedFraction({
      isP2pEngine: true,
      streamProgress: 50,
      streamLen: 100,
    }),
    0.5,
  );
  assert.equal(
    resolvePlaybackDownloadedFraction({
      isP2pEngine: false,
      streamProgress: 100,
      streamLen: 100,
    }),
    0,
  );
  assert.equal(
    resolvePlaybackDownloadedFraction({
      isP2pEngine: true,
      streamProgress: 50,
      streamLen: 0,
    }),
    0,
  );
});

// player.tsx is too large to load, so only its download-progress effect runs with `scope`.
test("a fully downloaded local file is reported as cached immediately, not buffering", () => {
  const run = (isLocalSrc: boolean) => {
    const reported: number[] = [];
    const effect = sourceCallback(
      "src/views/player.tsx",
      effectContaining("resolvePlaybackDownloadedFraction("),
      {
        src: { url: "https://cdn/x/master.m3u8/hlsv2/", isLive: false, meta: { id: "tt1" } },
        isP2pEngine: false,
        isLocalSrc,
        engineStats: null,
        snap: { durationSec: 100 },
        setPlaybackDownloaded: (value: number) => reported.push(value),
        resolvePlaybackDownloadedFraction,
        getPlaybackPosition: () => 0,
        getPlaybackBuffered: () => 0,
        subscribePlaybackClock: () => () => {},
      },
    );
    effect();
    return reported;
  };
  assert.deepEqual(run(true), [1], "a local file is fully cached at once");
  assert.deepEqual(run(false), [0], "a remote HLS stream reports nothing cached");
});

test("bigger buffer mode increases Harbor defaults and waits for a useful reserve", () => {
  const settings = {
    mpvQuality: "balanced",
    mpvHwdec: "auto",
    mpvBufferBoost: true,
    mpvDownmixStereo: false,
    audioDevice: "auto",
    playerDisplayPanel: "standard",
    playerHdrToSdr: true,
    mpvTweaks: {},
  } as unknown as Settings;

  const options = compileMpvOptions(settings).split("\n");
  assert.ok(options.includes("cache=yes"));
  assert.ok(options.includes("cache-secs=600"));
  assert.ok(options.includes("demuxer-max-bytes=1GiB"));
  assert.ok(options.includes("demuxer-readahead-secs=600"));
  assert.ok(options.includes("cache-pause-initial=yes"));
  assert.ok(options.includes("cache-pause-wait=10"));
  assert.ok(!options.includes("demuxer-max-bytes=150MiB"));
  assert.ok(!options.includes("demuxer-readahead-secs=20"));
});

test("SVP uses a removable labeled VapourSynth filter", () => {
  const settings = { svpVpyPath: "/home/user/.local/share/harbor/svp/svp.vpy" } as Settings;
  const options = svpMpvLines(settings, true).split("\n");
  assert.equal(
    options[0],
    "vf=@harbor-svp:vapoursynth=[/home/user/.local/share/harbor/svp/svp.vpy]",
  );
  assert.ok(options.includes("hwdec=auto-copy"));
});

test("high-bitrate releases receive a distinct startup profile", () => {
  const standard = playbackStartupProfile({ resolution: "1080p", source: "WEB-DL", size: 4e9 });
  const highResolution = playbackStartupProfile({ resolution: "4K", source: "BluRay" });
  const largeRemux = playbackStartupProfile({ resolution: "1080p", source: "REMUX", size: 18e9 });

  assert.equal(standard, "standard");
  assert.equal(highResolution, "high-bitrate");
  assert.equal(largeRemux, "high-bitrate");
});

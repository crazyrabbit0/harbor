// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  defaultVodBufferProperties,
  hasCustomBufferPolicy,
  hdrToSdrProperties,
  mpvReuseConfigKey,
  mpvStartArgs,
} from "../src/lib/player/mpv-config.ts";

const props = (list: Array<[string, string]>) => Object.fromEntries(list);

test("HDR-to-SDR tone maps to BT.1886 and uses infinite contrast only on OLED", () => {
  const lcd = props(hdrToSdrProperties(true, false));
  assert.equal(lcd["tone-mapping"], "spline");
  assert.equal(lcd["target-trc"], "bt.1886");
  assert.equal(lcd["target-prim"], "bt.709");
  assert.equal(lcd["target-contrast"], "auto");
  assert.equal(props(hdrToSdrProperties(true, true))["target-contrast"], "inf");
});

test("turning HDR-to-SDR off resets every property it sets", () => {
  const on = hdrToSdrProperties(true, false).map(([name]) => name);
  const off = props(hdrToSdrProperties(false, true));
  assert.deepEqual(Object.keys(off), on);
  assert.equal(off["tone-mapping"], "auto");
  assert.equal(off["target-contrast"], "auto");
  assert.equal(off["hdr-contrast-recovery"], "0");
});

test("start args keep subtitles out of startup and send the separate display only when not embedded", () => {
  const display = { id: "2" } as never;
  const src = {
    url: "file:///a.mkv",
    startAtSec: 42,
    isLive: false,
    headers: { Referer: "x" },
  } as never;
  const separate = mpvStartArgs(
    { anime4k: false, hdrToSdr: true, separateDisplay: display, cacheDir: "  D:/cache " },
    src,
    true,
    "high-bitrate",
  );
  assert.deepEqual(separate.subtitles, []);
  assert.equal(separate.startAtSec, 42);
  assert.equal(separate.separateDisplay, display);
  assert.equal(separate.separateCoverTaskbar, true);
  assert.equal(separate.cacheDir, "D:/cache");
  assert.equal(separate.startupProfile, "high-bitrate");
  assert.equal(separate.renderer, "gpu-next");
  const embedded = mpvStartArgs(
    { anime4k: false, hdrToSdr: true, embed: true, separateDisplay: display },
    src,
    false,
    "standard",
  );
  assert.equal(embedded.separateDisplay, null);
  assert.equal(embedded.hdrToSdr, false);
});

test("the reuse key changes with render options but not with the embed rect callback", () => {
  const base = { anime4k: false, hdrToSdr: true, embed: true };
  assert.equal(
    mpvReuseConfigKey({ ...base, getEmbedRect: () => null }, true),
    mpvReuseConfigKey(base, true),
  );
  assert.notEqual(mpvReuseConfigKey(base, true), mpvReuseConfigKey(base, false));
  assert.notEqual(
    mpvReuseConfigKey(base, true),
    mpvReuseConfigKey({ ...base, cacheDir: "D:/c" }, true),
  );
});

test("custom cache options in extra mpv options turn off Harbor's buffer phases", () => {
  assert.equal(hasCustomBufferPolicy("demuxer-max-bytes=1GiB"), true);
  assert.equal(hasCustomBufferPolicy("hwdec=auto\ncache-secs=60"), true);
  assert.equal(hasCustomBufferPolicy("hwdec=auto"), false);
  assert.equal(hasCustomBufferPolicy(undefined), false);
  const startup = props(defaultVodBufferProperties("standard", "startup"));
  const steady = props(defaultVodBufferProperties("high-bitrate", "steady"));
  assert.equal(startup["demuxer-max-bytes"], "128MiB");
  assert.equal(steady["demuxer-max-bytes"], "768MiB");
  assert.equal(steady["cache-secs"], "300");
});

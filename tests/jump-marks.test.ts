// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

const at = (p: string) => new URL(`../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");

const g = globalThis as unknown as { window?: unknown };
g.window ??= globalThis;
const marks = await import("../src/lib/player/jump-marks.ts");

test("jump marks flash, pin and notify listeners", async () => {
  let calls = 0;
  const off = marks.subscribeJumpMarks(() => calls++);
  marks.setJumpMarksPinned(true);
  assert.deepEqual(marks.getJumpMarks(), { pinned: true, flashing: false });
  marks.setJumpMarksPinned(true);
  assert.equal(calls, 1, "an unchanged state does not notify");
  marks.setJumpMarksPinned(false);
  marks.flashJumpMarks(20);
  assert.equal(marks.getJumpMarks().flashing, true);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(marks.getJumpMarks().flashing, false);
  off();
});

test("the jump key flashes the marks and the seek bar follows them", () => {
  assert.match(
    read("src/views/player/hooks/use-keyboard-shortcuts.ts"),
    /if \(digit != null\) \{\s*e\.preventDefault\(\);\s*flashJumpMarks\(\);/,
  );
  assert.match(read("src/components/player/transport/seek-bar.tsx"), /useJumpMarksVisible\(\)/);
});

test("the player chrome stays up while the jump marks show", () => {
  const timers = new Map<number, () => void>();
  let id = 0;
  const target = { addEventListener() {}, removeEventListener() {} };
  const hidden: boolean[] = [];
  const h = hookHarness(
    "src/views/player/hooks/use-chrome-visibility.ts",
    "useChromeVisibility",
    {
      "@/lib/player/playback-clock": {
        getSeekHovering: () => false,
        subscribeSeekHovering: () => () => {},
      },
      "@/lib/player/jump-marks": marks,
      "@/lib/player/chrome-hold": {
        isPlayerChromeHeld: () => false,
        subscribePlayerChromeHold: () => () => {},
      },
      "../player-utils": {
        CHROME_HIDE_MS_PAUSED: 4000,
        CHROME_HIDE_MS_PLAYING: 2500,
        CHROME_HIDE_MS_RESUME: 1000,
      },
    },
    {
      window: {
        ...target,
        setTimeout: (fn: () => void) => (timers.set(++id, fn), id),
        clearTimeout: (i: number) => timers.delete(i),
      },
      document: {
        ...target,
        documentElement: { toggleAttribute() {}, setAttribute() {}, removeAttribute() {} },
      },
    },
  );
  const params = {
    playing: true,
    drawMode: false,
    pipMode: false,
    setChromeHidden: (v: boolean) => hidden.push(v),
    keyboardPauseShowsControls: false,
  };
  h.render(params);
  assert.equal(timers.size, 1, "playing arms the hide timer");
  marks.setJumpMarksPinned(true);
  assert.equal(timers.size, 0, "showing the marks cancels the hide");
  assert.equal(h.render(params).chromeVisible, true);
  assert.equal(hidden.at(-1), false);
  marks.setJumpMarksPinned(false);
  assert.equal(timers.size, 1, "hiding the marks re-arms the hide");
  h.unmount();
});

test("the 0-9 frames are prefetched once the source opens, not on hover", async () => {
  const prefetched: Array<[number[], number]> = [];
  const h = hookHarness("src/views/player/hooks/use-trickplay.ts", "useTrickplay", {
    "@/lib/stremio-server": { isBundledEngineUrl: (u: string) => u.includes("127.0.0.1") },
    "@/lib/trickplay": {
      setTrickplayState() {},
      trickplayPrefetch: async (times: number[], bucket: number) => {
        prefetched.push([times, bucket]);
      },
      trickplaySetUrl: async () => {},
      trickplaySpawnEager: async () => {},
      trickplayStop: async () => {},
    },
    "@/lib/player/jump-marks": marks,
  });
  const args = { url: "https://media.test/a.mkv", enabled: true, prefetchDurationSec: 1000.7 };
  h.render(args);
  await flushPromises();
  assert.equal(prefetched.length, 0, "nothing before the source is ready");
  h.render(args);
  assert.deepEqual(prefetched, [[marks.jumpTargets(1000), marks.JUMP_FRAME_BUCKET_SEC]]);
  h.render({ ...args, prefetchDurationSec: 0 });
  assert.equal(prefetched.length, 1, "no prefetch while the digits are hidden");

  const torrent = { ...args, url: "http://127.0.0.1:11470/x/0" };
  h.render(torrent);
  await flushPromises();
  h.render(torrent);
  assert.equal(prefetched.length, 1, "torrent sources only show buffered frames");

  const src = read("src/components/player/transport/extra-controls.tsx");
  assert.match(src, /<JumpFrame time=\{at\} \/>/);
  assert.match(src, /onTrickplayPrefetched\(/);
  assert.doesNotMatch(src, /trickplayGet\(/);
  const player = read("src/views/player.tsx");
  assert.match(player, /prefetchDurationSec: jumpDigitsShown \? snap\.durationSec : 0/);
  const rust = read("src-tauri/src/thumbs.rs");
  assert.match(rust, /pub async fn thumbs_prefetch/);
  assert.match(rust, /Semaphore::new\(PREFETCH_PARALLEL\)/);
  assert.match(read("src-tauri/src/lib.rs"), /thumbs::thumbs_prefetch,/);
});

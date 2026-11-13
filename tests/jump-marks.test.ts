// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import { named, ofType, treeHarness } from "./helpers/tree-render.ts";

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

/** Renders the jump-digits control, child components included, against a fake thumbnail cache. */
function jumpDigits(duration = 1000) {
  const cache = new Map<number, string>();
  const prefetchListeners = new Set<() => void>();
  const pinned: boolean[] = [];
  const jumps: number[] = [];
  const h = treeHarness(
    "src/components/player/transport/extra-controls.tsx",
    {
      "lucide-react": named,
      "@/lib/i18n": {
        useT: () => (key: string, vars?: Record<string, string>) =>
          vars ? `${key}|${JSON.stringify(vars)}` : key,
      },
      "@/lib/player/playback-clock": { usePlaybackPositionGated: () => 0 },
      "@/lib/player/chrome-hold": { usePlayerChromeHold() {} },
      "@/lib/player/jump-marks": {
        ...marks,
        setJumpMarksPinned: (on: boolean) => pinned.push(on),
      },
      "@/lib/seek-step": {
        CLIP_LENGTH_OPTIONS: [],
        nudgeStep: () => 1,
        sanitizeClipLength: (n: number) => n,
      },
      "@/lib/trickplay": {
        onTrickplayPrefetched: (cb: () => void) => (
          prefetchListeners.add(cb),
          () => prefetchListeners.delete(cb)
        ),
        thumbCacheGet: (bucket: number) => cache.get(bucket),
      },
      "@/lib/settings": { useSettingsSelector: () => ({}), useSettingsUpdate: () => () => {} },
      "@/lib/settings/defaults": { DEFAULT: {} },
      "./transport-utils": { fmtTime: (s: number) => `t${s}` },
      "./hotkey-label": {
        hotkeyText: () => "",
        KeyChips: "KeyChips",
        withHotkey: (l: string) => l,
      },
      "./tooltip": { Tooltip: ({ children }: { children: unknown }) => children },
    },
    {
      globals: {
        window: { addEventListener() {}, removeEventListener() {}, innerWidth: 1200 },
      },
    },
  );
  const ctx = {
    extras: { onJump: (at: number) => jumps.push(at) },
    durationSec: duration,
    isLiveChannel: false,
    Button: "Button",
    iconSize: 18,
  };
  const render = () =>
    h.render({ type: h.exports.ExtraControl, props: { id: "jump-digits", ctx } });
  return { render, cache, prefetchListeners, pinned, jumps };
}

test("the jump grid shows the prefetched frames and fills in when a prefetch lands", () => {
  const j = jumpDigits();
  ofType(j.render(), "Button")[0].props.onClick();
  const targets = marks.jumpTargets(1000);
  const bucketOf = (at: number) => Math.round(at / marks.JUMP_FRAME_BUCKET_SEC);
  j.cache.set(bucketOf(targets[3]), "frame-3.jpg");
  const cells = (tree: unknown) =>
    ofType(tree, "button").filter((el) => el.props.role === "menuitem");
  const imgs = (tree: unknown) => ofType(tree, "img").map((el) => el.props.src);
  let tree = j.render();
  assert.equal(cells(tree).length, 10, "one cell per digit");
  assert.deepEqual(imgs(tree), ["frame-3.jpg"], "only a cached frame is drawn");
  assert.ok(j.prefetchListeners.size > 0, "each cell waits for the prefetch");
  j.cache.set(bucketOf(targets[7]), "frame-7.jpg");
  for (const listener of j.prefetchListeners) listener();
  tree = j.render();
  assert.deepEqual(imgs(tree).sort(), ["frame-3.jpg", "frame-7.jpg"]);
  cells(tree)[7].props.onClick();
  assert.deepEqual(j.jumps, [targets[7]]);
  assert.equal(cells(j.render()).length, 0, "choosing a frame closes the grid");
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

  const player = read("src/views/player.tsx");
  assert.match(player, /prefetchDurationSec: jumpDigitsShown \? snap\.durationSec : 0/);
  const rust = read("src-tauri/src/thumbs.rs");
  assert.match(rust, /pub async fn thumbs_prefetch/);
  assert.match(rust, /Semaphore::new\(PREFETCH_PARALLEL\)/);
  assert.match(read("src-tauri/src/lib.rs"), /thumbs::thumbs_prefetch,/);
});

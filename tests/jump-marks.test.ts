// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const at = (p: string) => new URL(`../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");

test("jump marks flash, pin and notify listeners", async () => {
  const g = globalThis as unknown as { window?: unknown };
  g.window ??= globalThis;
  const marks = await import("../src/lib/player/jump-marks.ts");
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

test("the jump key flashes the marks and the seek bar and chrome follow them", () => {
  assert.match(
    read("src/views/player/hooks/use-keyboard-shortcuts.ts"),
    /if \(digit != null\) \{\s*e\.preventDefault\(\);\s*flashJumpMarks\(\);/,
  );
  assert.match(read("src/components/player/transport/seek-bar.tsx"), /useJumpMarksVisible\(\)/);
  assert.match(read("src/views/player/hooks/use-chrome-visibility.ts"), /subscribeJumpMarks\(/);
});

test("the 0-9 frames are prefetched in parallel when the source opens, not on hover", () => {
  const src = read("src/components/player/transport/extra-controls.tsx");
  assert.match(src, /<JumpFrame time=\{at\} \/>/);
  assert.match(src, /onTrickplayPrefetched\(/);
  assert.doesNotMatch(src, /trickplayGet\(/);
  const hook = read("src/views/player/hooks/use-trickplay.ts");
  assert.match(hook, /trickplayPrefetch\(jumpTargets\(dur\), JUMP_FRAME_BUCKET_SEC\)/);
  const player = read("src/views/player.tsx");
  assert.match(player, /prefetchDurationSec: jumpDigitsShown \? snap\.durationSec : 0/);
  const rust = read("src-tauri/src/thumbs.rs");
  assert.match(rust, /pub async fn thumbs_prefetch/);
  assert.match(rust, /Semaphore::new\(PREFETCH_PARALLEL\)/);
  assert.match(read("src-tauri/src/lib.rs"), /thumbs::thumbs_prefetch,/);
});

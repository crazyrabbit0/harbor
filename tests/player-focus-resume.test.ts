// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

type Activity = { focused: boolean; minimized: boolean };

function setup() {
  const handlers: Array<(e: { payload: Activity }) => void> = [];
  const calls: string[] = [];
  const snap = { current: { status: "playing" } };
  const bridge = {
    pause: () => {
      calls.push("pause");
      snap.current = { status: "paused" };
    },
    play: async () => {
      calls.push("play");
    },
  };
  const h = hookHarness(
    "src/views/player/hooks/use-pause-on-inactive.ts",
    "usePauseOnInactive",
    {
      "@tauri-apps/api/event": {
        listen: async (_name: string, fn: (e: { payload: Activity }) => void) => {
          handlers.push(fn);
          return () => {};
        },
      },
      "@/lib/settings": {
        useSettingsSelector: (select: (s: unknown) => unknown) =>
          select({ pauseMinimized: true, pauseUnfocused: true }),
      },
    },
    { window: { __TAURI_INTERNALS__: {}, dispatchEvent() {} } },
  );
  h.render({ bridgeRef: { current: bridge }, snapRef: snap });
  const send = (payload: Activity) => handlers.forEach((fn) => fn({ payload }));
  return { calls, snap, send };
}

test("returning focus resumes playback that Harbor auto-paused", async () => {
  const { calls, snap, send } = setup();
  await flushPromises();
  send({ focused: false, minimized: false });
  assert.deepEqual(calls, ["pause"]);
  // The snapshot can lag behind mpv after focus returns, so a stale "paused" must not block the resume.
  assert.equal(snap.current.status, "paused");
  send({ focused: true, minimized: false });
  assert.deepEqual(calls, ["pause", "play"]);
  send({ focused: true, minimized: false });
  assert.deepEqual(calls, ["pause", "play"], "only one resume per auto-pause");
});

test("focus returning after a user pause does not resume", async () => {
  const { calls, snap, send } = setup();
  await flushPromises();
  snap.current = { status: "paused" };
  send({ focused: false, minimized: true });
  send({ focused: true, minimized: false });
  assert.deepEqual(calls, []);
});

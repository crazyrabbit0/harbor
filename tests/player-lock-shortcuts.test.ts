// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises } from "./helpers/hook-harness.ts";
import { keyboardShortcutsHarness as setup } from "./helpers/keyboard-shortcuts-harness.ts";

test("player hotkeys and taskbar buttons do nothing while the screen is locked", async () => {
  const h = setup();
  await flushPromises();
  h.lock(true);
  assert.equal(h.key("keydown", { key: "m", code: "KeyM" }), true, "a locked key is swallowed");
  h.key("keydown", { key: " ", code: "Space" });
  h.key("keyup", { key: " ", code: "Space" });
  h.taskbar("toggle");
  h.taskbar("forward");
  h.taskbar("mute");
  assert.deepEqual(h.calls, []);

  h.lock(false);
  h.key("keydown", { key: "m", code: "KeyM" });
  h.taskbar("forward");
  h.taskbar("toggle");
  assert.deepEqual(h.calls, ["mute", "seek 10", "toggle"]);
});

test("a play/pause hold that started before locking releases without toggling", async () => {
  const h = setup();
  await flushPromises();
  h.key("keydown", { key: " ", code: "Space" });
  h.lock(true);
  h.key("keyup", { key: " ", code: "Space" });
  h.lock(false);
  h.key("keyup", { key: " ", code: "Space" });
  assert.deepEqual(h.calls, [], "the tap was cancelled by the lock, not replayed after it");
});

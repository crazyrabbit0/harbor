// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises } from "./helpers/hook-harness.ts";
import { autoSyncHarness as setup } from "./helpers/autosync-harness.ts";

test("auto-fire happens once per media item and language, not on every track switch", async () => {
  const { runs, render } = setup();
  render("https://media.test/a.mkv", { id: "1", lang: "en" });
  await flushPromises();
  assert.deepEqual(runs, [false], "the automatic pass is the low-effort one");
  render("https://media.test/a.mkv", { id: "2", lang: "fr" });
  await flushPromises();
  assert.equal(runs.length, 2, "a new language fires once");
  render("https://media.test/a.mkv", { id: "3", lang: "en" });
  await flushPromises();
  assert.equal(runs.length, 2, "another track in an already fired language does not refire");
  render("https://media.test/b.mkv", { id: "3", lang: "en" });
  await flushPromises();
  assert.equal(runs.length, 3, "a new media item starts over");
});

test("a manual (forced) run starts fresh and tries hard immediately", async () => {
  const { runs, render } = setup();
  const track = { id: "1", lang: "en" };
  render("https://media.test/a.mkv", track);
  await flushPromises();
  assert.equal(render("https://media.test/a.mkv", track).status, "declined");
  render("https://media.test/a.mkv", track).run();
  assert.equal(
    render("https://media.test/a.mkv", track).status,
    "analyzing",
    "a forced run shows analyzing instead of retrying silently",
  );
  await flushPromises();
  assert.deepEqual(runs, [false, true]);
});

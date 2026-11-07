// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises } from "./helpers/hook-harness.ts";
import { continueCardHarness } from "./helpers/continue-card-harness.ts";

const series = {
  _id: "tt100",
  type: "series",
  name: "Fixture",
  state: { season: 1, episode: 2, video_id: "tt100:1:2", timeOffset: 100, duration: 1000 },
};

test("Continue Watching keeps source selection, direct play, and details as separate actions", async () => {
  const h = continueCardHarness();
  const [card, play, details] = h.buttons(h.render({ item: series }));
  card.props.onClick();
  await flushPromises();
  assert.deepEqual(h.calls.openPicker.at(-1)?.slice(1), [
    { season: 1, episode: 2 },
    { autoPlay: false, resume: false },
  ]);
  let stopped = false;
  play.props.onClick({ stopPropagation: () => (stopped = true) });
  await flushPromises();
  assert.equal(stopped, true);
  assert.deepEqual(h.calls.openPicker.at(-1)?.[2], { autoPlay: true, resume: true });
  assert.equal(h.calls.openMeta.length, 0);
  details.props.onClick();
  assert.equal(h.calls.openPicker.length, 2);
  const [meta, hint] = h.calls.openMeta.at(-1) as [{ id: string }, unknown];
  assert.equal(meta.id, "tt100");
  assert.deepEqual(hint, { episodeHint: { season: 1, episode: 2 }, exact: false });
});

test("Continue Watching re-resolves addon metadata when authentication changes", () => {
  const h = continueCardHarness();
  const tree = h.render({ item: series });
  h.buttons(tree)[0].props.ref.current = {};
  h.render({ item: series });
  assert.equal(h.calls.resolveMeta.length, 0, "an unchanged card does not refetch");
  h.setAuthKey("auth-b");
  h.render({ item: series });
  assert.deepEqual(h.calls.resolveMeta, [["auth-b", "series", "tt100"]]);
  h.render({ item: series });
  assert.equal(h.calls.resolveMeta.length, 1);
});

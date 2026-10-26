import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { startStatsPoll } from "../src/lib/torrent/stats-poll.ts";

type Doc = EventTarget & { hidden: boolean };

function fakeDocument(): Doc {
  const doc = new EventTarget() as Doc;
  doc.hidden = false;
  (globalThis as { document?: unknown }).document = doc;
  return doc;
}

function advance(t: TestContext, ms: number): void {
  for (let i = 0; i < ms / 500; i += 1) t.mock.timers.tick(500);
}

test("polls every second for 10 s, then every 3 s", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  fakeDocument();
  let calls = 0;
  const stop = startStatsPoll(() => {
    calls += 1;
  });
  assert.equal(calls, 1, "first poll runs at once");
  advance(t, 10_000);
  assert.equal(calls, 11);
  advance(t, 3_000);
  assert.equal(calls, 12);
  advance(t, 9_000);
  assert.equal(calls, 15);
  stop();
  advance(t, 30_000);
  assert.equal(calls, 15, "no poll after stop");
});

test("pauses while hidden and polls at once when shown again", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const doc = fakeDocument();
  let calls = 0;
  const stop = startStatsPoll(() => {
    calls += 1;
  });
  doc.hidden = true;
  doc.dispatchEvent(new Event("visibilitychange"));
  advance(t, 60_000);
  assert.equal(calls, 1, "no polls while hidden");
  doc.hidden = false;
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 2, "refreshes at once when shown");
  advance(t, 3_000);
  assert.equal(calls, 3);
  stop();
});

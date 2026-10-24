// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub";
import {
  applyRemoteWatched,
  isManuallyWatched,
  remoteWatchedKeys,
  subscribeManualWatched,
} from "../src/lib/manual-watched";

test("applyRemoteWatched writes and notifies only when the remote state changes something", () => {
  let notified = 0;
  const stop = subscribeManualWatched(() => notified++);
  const writes: string[] = [];
  const setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k: string, v: string) => {
    writes.push(k);
    setItem(k, v);
  };
  try {
    applyRemoteWatched("tt1", [{ season: 1, episode: 2 }], []);
    assert.equal(isManuallyWatched("tt1", 1, 2), true);
    assert.deepEqual([...remoteWatchedKeys("tt1")], ["1:2"]);
    assert.equal(notified, 1);

    writes.length = 0;
    applyRemoteWatched("tt1", [{ season: 1, episode: 2 }], []);
    assert.deepEqual(writes, []);
    assert.equal(notified, 1);

    applyRemoteWatched("tt1", [], [{ season: 1, episode: 2 }]);
    assert.equal(isManuallyWatched("tt1", 1, 2), false);
    assert.deepEqual([...remoteWatchedKeys("tt1")], []);
    assert.equal(notified, 2);
  } finally {
    localStorage.setItem = setItem;
    stop();
  }
});

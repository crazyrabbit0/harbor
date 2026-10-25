// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import {
  clearPlayback,
  readPlayback,
  recentlyPlayed,
  savePlayback,
  subscribePlayback,
} from "../src/lib/playback-history.ts";
import {
  listLocalCw,
  saveLocalCw,
  subscribeLocalCw,
  type LocalCwEntry,
} from "../src/lib/local-cw.ts";

const cw = (positionMs: number, over: Partial<LocalCwEntry> = {}): LocalCwEntry => ({
  id: "tt1",
  type: "series",
  name: "Show",
  season: 1,
  episode: 2,
  positionMs,
  durationMs: 3_000_000,
  t: 1_000_000,
  ...over,
});

test("a playback tick that only refreshes savedAt and stream fields notifies no listener", () => {
  localStorage.clear();
  savePlayback("tt9", { title: "Movie", parsedTitle: "Movie", infoHash: "aa" });
  let calls = 0;
  const off = subscribePlayback(() => calls++);
  savePlayback("tt9", { title: "Movie", parsedTitle: "Movie", infoHash: "bb" });
  assert.equal(calls, 0);
  assert.equal(readPlayback("tt9")?.infoHash, "bb");
  off();
});

test("a new title or a removed entry notifies playback listeners", () => {
  localStorage.clear();
  savePlayback("tt9", { title: "Movie", parsedTitle: "Movie" });
  let calls = 0;
  const off = subscribePlayback(() => calls++);
  savePlayback("tt8", { title: "Other", parsedTitle: "Other" });
  assert.equal(calls, 1);
  assert.equal(recentlyPlayed().ids.has("tt8"), true);
  clearPlayback("tt8");
  assert.equal(calls, 2);
  off();
});

test("local CW skips notifying while progress stays inside the same visible step", () => {
  localStorage.clear();
  saveLocalCw(cw(600_000));
  let calls = 0;
  const off = subscribeLocalCw(() => calls++);
  saveLocalCw(cw(604_000, { t: 1_004_000 }));
  assert.equal(calls, 0);
  assert.equal(listLocalCw(false)[0].positionMs, 604_000, "the position is still written");
  saveLocalCw(cw(640_000, { t: 1_040_000 }));
  assert.equal(calls, 1, "a 1% step redraws the progress bar");
  off();
});

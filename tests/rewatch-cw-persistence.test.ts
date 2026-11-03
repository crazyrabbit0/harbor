// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  playbackParams,
  playbackPersistenceHarness,
} from "./helpers/playback-persistence-harness.ts";

function watchMovie(position: number, watchedBefore: boolean) {
  const h = playbackPersistenceHarness();
  const marks: Array<[string, boolean]> = [];
  const cleared: unknown[][] = [];
  let watched = watchedBefore;
  h.dependencies.isMovieWatchedLocal = () => watched;
  h.dependencies.setMovieWatchedLocal = (id: string, value: boolean) => {
    watched = value;
    marks.push([id, value]);
  };
  h.dependencies.clearLocalCw = (...args: unknown[]) => cleared.push(args);
  const base = playbackParams();
  const p = {
    ...base,
    src: {
      meta: { id: "tt200", type: "movie", name: "Test movie" },
      url: "https://media.test/m.mkv",
    },
    season: undefined,
    episode: undefined,
    resolvedImdbId: "tt200",
  };
  h.render(p);
  h.render({
    ...p,
    snap: { ...p.snap, status: "playing", positionSec: position, durationSec: 6000 },
  });
  h.clock(position);
  h.tick();
  return { h, marks, cleared };
}

test("a signed-out movie rewatch keeps updating its local Continue Watching entry", () => {
  const { h, marks } = watchMovie(600, true);
  assert.deepEqual(marks, [["tt200", false]], "the rewatch clears the local watched mark");
  const entry = h.localCw.at(-1);
  assert.equal(entry?.id, "tt200");
  assert.equal(entry?.type, "movie");
  assert.equal(entry?.positionMs, 600000);
});

test("finishing a movie clears the local Continue Watching entry", () => {
  const { h, marks, cleared } = watchMovie(5400, false);
  assert.deepEqual(marks, [["tt200", true]]);
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0][0], "tt200");
  assert.equal(h.localCw.length, 0, "a finished movie writes no Continue Watching entry");
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import { buildActivityFeed } from "../src/lib/social/activity-feed.ts";
import {
  listWatchEvents,
  recordWatchEvent,
  subscribeWatchEvents,
  type WatchEvent,
} from "../src/lib/watch-events.ts";
import { hookHarness } from "./helpers/hook-harness.ts";
import { markWatchedHarness } from "./helpers/mark-watched-harness.ts";
import {
  playbackParams,
  playbackPersistenceHarness,
} from "./helpers/playback-persistence-harness.ts";

const baseFeed = { cw: [], ratings: [], favorites: [], mangaFavorites: [] };

test("recent activity no longer derives only from the resume list", () => {
  const feed = buildActivityFeed({
    ...baseFeed,
    cw: [{ id: "tt2", type: "series", name: "Resumed", progress: 0.4, at: 10 } as any],
    watchEvents: [{ id: "tt1", type: "series", name: "Finished", season: 1, episode: 2, at: 5 }],
  });

  assert.deepEqual(
    feed.map((item) => [item.kind, item.metaId]),
    [
      ["watched", "tt2"],
      ["finished", "tt1"],
    ],
  );
});

test("completion events are marked finished and keep the episode label", () => {
  const feed = buildActivityFeed({
    ...baseFeed,
    watchEvents: [
      { id: "tt1", type: "series", name: "Show", season: 3, episode: 4, at: 3 },
      { id: "kitsu:7", type: "series", name: "Anime", season: 1, episode: 2, at: 2 },
      { id: "tt9", type: "movie", name: "Film", at: 1 },
    ],
  });

  assert.deepEqual(
    feed.map((item) => [item.kind, item.mediaType, item.subtitle]),
    [
      ["finished", "series", "S3 E4"],
      ["finished", "anime", "S1 E2"],
      ["finished", "movie", undefined],
    ],
  );
});

test("finishing playback records a watch event for every content type", () => {
  const play = (meta: Record<string, unknown>, position: number, season?: number) => {
    const h = playbackPersistenceHarness();
    const base = playbackParams(season, season ? 1 : undefined);
    const p = { ...base, src: { ...base.src, meta } };
    h.render(p);
    h.render({
      ...p,
      snap: { ...p.snap, status: "playing", positionSec: position, durationSec: 1000 },
    });
    h.clock(position);
    h.tick();
    return h.watchEvents;
  };

  const series = play({ id: "tt100", type: "series", name: "Show" }, 900, 2);
  const movie = play({ id: "tt200", type: "movie", name: "Film" }, 900);
  const anime = play({ id: "kitsu:5", type: "anime", name: "Anime" }, 900, 1);
  const unfinished = play({ id: "tt100", type: "series", name: "Show" }, 300, 2);

  assert.deepEqual(
    series.map((e) => [e.id, e.type, e.season, e.episode]),
    [["tt100", "series", 2, 1]],
  );
  assert.deepEqual(
    movie.map((e) => [e.id, e.type]),
    [["tt200", "movie"]],
  );
  assert.deepEqual(
    anime.map((e) => [e.id, e.type]),
    [["kitsu:5", "series"]],
  );
  assert.deepEqual(unfinished, []);
});

test("mark as watched records an event for both movies and shows", async () => {
  const { mod, watchEvents } = markWatchedHarness();

  await mod.markMetaWatched({ id: "tt1", type: "movie", name: "Film" });
  await mod.markMetaWatched({ id: "tt2", type: "series", name: "Show", videos: [] });

  assert.deepEqual(
    watchEvents.map((e) => [e.id, e.type]),
    [
      ["tt1", "movie"],
      ["tt2", "series"],
    ],
  );
});

test("the sync hook re-pushes when a watch event lands", () => {
  const feeds: any[] = [];
  let events: WatchEvent[] = [];
  let notify = () => {};
  const watchEvent: WatchEvent = { id: "tt1", type: "movie", name: "Film", at: 1 };
  // The stores hand back the same references between renders, so only a real change busts the memo.
  const stable = { cw: [], ratings: [], imports: [], favorites: new Map(), manga: new Map() };
  const harness = hookHarness("src/lib/social/use-activity-sync.ts", "useActivitySync", {
    "@/lib/theme-auth": { currentAuthor: () => null, subscribeAuthor: () => () => {} },
    "@/lib/continue-watching": { useContinueWatching: () => stable.cw },
    "@/lib/ratings/store": { useMyRatings: () => stable.ratings },
    "@/lib/ratings/import/receipts": {
      listImports: () => stable.imports,
      subscribeImports: () => () => {},
    },
    "@/lib/media-favorites": { useMediaFavorites: () => ({ items: stable.favorites }) },
    "@/lib/manga-favorites": { useMangaFavorites: () => ({ items: stable.manga }) },
    "@/lib/watch-events": {
      listWatchEvents: () => events,
      subscribeWatchEvents: (fn: () => void) => {
        notify = fn;
        return () => {};
      },
    },
    "./activity-feed": {
      buildActivityFeed: (input: { watchEvents: WatchEvent[] }) => {
        feeds.push(input.watchEvents);
        return [];
      },
      pushActivity: async () => {},
      sameFeed: () => false,
    },
  });

  harness.render();
  events = [watchEvent];
  notify();
  harness.render();

  assert.deepEqual(feeds, [[], [watchEvent]]);
});

const event = (id: string, over: Partial<WatchEvent> = {}): WatchEvent => ({
  id,
  type: "series",
  name: `Show ${id}`,
  season: 1,
  episode: 1,
  at: 1,
  ...over,
});

test("the watch log keeps only the newest 40 events", () => {
  localStorage.clear();
  for (let i = 0; i < 45; i++) recordWatchEvent(event(`tt${i}`));
  const events = listWatchEvents();
  assert.equal(events.length, 40);
  assert.equal(events[0].id, "tt44");
  assert.equal(events.at(-1)?.id, "tt5");
});

test("an unreadable or non-array log reads as empty", () => {
  localStorage.clear();
  localStorage.setItem("harbor.watchevents.v1", "{not json");
  assert.deepEqual(listWatchEvents(), []);
  localStorage.setItem("harbor.watchevents.v1", JSON.stringify({ id: "tt1" }));
  assert.deepEqual(listWatchEvents(), []);
});

test("re-finishing the same episode replaces rather than duplicates", () => {
  localStorage.clear();
  recordWatchEvent(event("tt1", { at: 1 }));
  recordWatchEvent(event("tt1", { episode: 2, at: 2 }));
  recordWatchEvent(event("tt1", { at: 3 }));
  const events = listWatchEvents();
  assert.deepEqual(
    events.map((e) => [e.episode, e.at]),
    [
      [1, 3],
      [2, 2],
    ],
  );
});

test("events without an id or name are ignored and subscribers hear real writes", () => {
  localStorage.clear();
  let calls = 0;
  const off = subscribeWatchEvents(() => calls++);
  recordWatchEvent(event("", {}));
  recordWatchEvent(event("tt1", { name: "" }));
  assert.equal(calls, 0);
  recordWatchEvent(event("tt1"));
  assert.equal(calls, 1);
  off();
  recordWatchEvent(event("tt2"));
  assert.equal(calls, 1);
  assert.equal(listWatchEvents().length, 2);
});

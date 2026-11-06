import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  dedupeSearchTracks,
  filterSearchMode,
  mergeSearchTracks,
  moveSearchCursor,
  nextSearchLimit,
  searchTrackKey,
  NOW_SEARCH_CEILING,
  NOW_SEARCH_PAGE,
} from "../src/lib/music/now-search.ts";
import * as nowSearchModule from "../src/lib/music/now-search.ts";
import type { MusicTrack } from "../src/lib/music/types.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

function track(over: Partial<MusicTrack> & { id: string }): MusicTrack {
  return {
    connectorId: "catalog",
    title: "Song",
    artist: "Artist",
    artwork: "https://cdn.example/a.jpg",
    durationSeconds: 180,
    durationLabel: "3:00",
    ...over,
  };
}

function page(count: number, offset = 0): MusicTrack[] {
  return Array.from({ length: count }, (_, index) => track({ id: `t${offset + index}` }));
}

test("pagination asks for one more page while the source keeps filling the window", () => {
  assert.equal(nextSearchLimit(NOW_SEARCH_PAGE, NOW_SEARCH_PAGE), NOW_SEARCH_PAGE * 2);
  assert.equal(nextSearchLimit(NOW_SEARCH_PAGE * 2, NOW_SEARCH_PAGE * 2), NOW_SEARCH_PAGE * 3);
  assert.equal(nextSearchLimit(NOW_SEARCH_PAGE * 3, NOW_SEARCH_PAGE * 3), NOW_SEARCH_PAGE * 4);
});

test("pagination stops when the source returns fewer rows than it was allowed", () => {
  assert.equal(nextSearchLimit(NOW_SEARCH_PAGE, NOW_SEARCH_PAGE - 1), null);
  assert.equal(nextSearchLimit(NOW_SEARCH_PAGE, 0), null);
  assert.equal(nextSearchLimit(NOW_SEARCH_PAGE * 2, NOW_SEARCH_PAGE), null);
});

test("pagination stops at the ceiling instead of growing forever", () => {
  assert.equal(nextSearchLimit(NOW_SEARCH_CEILING, NOW_SEARCH_CEILING), null);
  assert.equal(nextSearchLimit(NOW_SEARCH_CEILING + NOW_SEARCH_PAGE, NOW_SEARCH_CEILING * 2), null);
});

test("pagination never grows past the ceiling in a single step", () => {
  const stepped = nextSearchLimit(NOW_SEARCH_CEILING - 1, NOW_SEARCH_CEILING);
  assert.ok(stepped !== null && stepped <= NOW_SEARCH_CEILING);
});

test("pagination refuses a limit below one page", () => {
  assert.equal(nextSearchLimit(0, 0), null);
  assert.equal(nextSearchLimit(Number.NaN, 24), null);
});

test("a video-only page stops paging immediately because the video endpoint caps itself", () => {
  assert.equal(nextSearchLimit(NOW_SEARCH_PAGE, 12), null);
});

test("mode filtering splits songs from music videos on mediaKind", () => {
  const rows = [
    track({ id: "a" }),
    track({ id: "b", mediaKind: "audio" }),
    track({ id: "c", mediaKind: "video" }),
  ];
  assert.deepEqual(
    filterSearchMode(rows, "songs").map((item) => item.id),
    ["a", "b"],
  );
  assert.deepEqual(
    filterSearchMode(rows, "videos").map((item) => item.id),
    ["c"],
  );
});

test("an untagged track counts as a song, which is what searchTyped actually returns", () => {
  assert.equal(filterSearchMode([track({ id: "a" })], "songs").length, 1);
  assert.equal(filterSearchMode([track({ id: "a" })], "videos").length, 0);
});

test("dedupe keys on connector and source identity, not the row position", () => {
  const rows = [
    track({ id: "a", connectorId: "youtube", sourceId: "vid1" }),
    track({ id: "b", connectorId: "youtube", sourceId: "vid1" }),
    track({ id: "a", connectorId: "deezer" }),
  ];
  assert.deepEqual(dedupeSearchTracks(rows).map(searchTrackKey), ["youtube:vid1", "deezer:a"]);
});

test("a wider window merges without duplicating the page already on screen", () => {
  const first = page(24);
  const second = page(48);
  const merged = mergeSearchTracks(first, second);
  assert.equal(merged.length, 48);
  assert.deepEqual(
    merged.slice(0, 24).map((item) => item.id),
    first.map((item) => item.id),
  );
  assert.equal(new Set(merged.map(searchTrackKey)).size, 48);
});

test("merging a window that added nothing leaves the list untouched", () => {
  const first = page(24);
  const merged = mergeSearchTracks(first, page(24));
  assert.equal(merged.length, 24);
});

test("merging keeps the order the user is already reading", () => {
  const previous = [track({ id: "a" }), track({ id: "b" })];
  const incoming = [track({ id: "b" }), track({ id: "a" }), track({ id: "c" })];
  assert.deepEqual(
    mergeSearchTracks(previous, incoming).map((item) => item.id),
    ["a", "b", "c"],
  );
});

test("arrow keys walk the rows and stop at both ends", () => {
  assert.equal(moveSearchCursor(-1, 1, 3), 0);
  assert.equal(moveSearchCursor(0, 1, 3), 1);
  assert.equal(moveSearchCursor(2, 1, 3), 2);
  assert.equal(moveSearchCursor(0, -1, 3), 0);
  assert.equal(moveSearchCursor(-1, -1, 3), 2);
  assert.equal(moveSearchCursor(0, 1, 0), -1);
});

const CSS = readFileSync("src/components/music/music-now-search.css", "utf8");

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

type Page = { tracks: MusicTrack[]; next: string | null };

/** Runs the real MusicNowSearch with a scripted catalog, a fake debounce timer and observer. */
function nowSearch(videoPages: (() => Promise<Page>)[] = []) {
  const timers: (() => void)[] = [];
  const observers: { options: { root: unknown }; fire: () => void; observed: unknown[] }[] = [];
  const typed: number[] = [];
  const videoCalls: unknown[][] = [];
  const list = { querySelector: () => null };
  const sentinel = {};
  const element = (type: unknown, props: N["props"]) => {
    if (props.ref && props.className === "music-now-search-list") props.ref.current = list;
    if (props.ref && props.className === "music-now-search-sentinel") props.ref.current = sentinel;
    if (props.ref && type === "input") props.ref.current = { focus() {} };
    return { type, props };
  };
  class FakeObserver {
    observed: unknown[] = [];
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void, options: any) {
      observers.push({
        options,
        observed: this.observed,
        fire: () => callback([{ isIntersecting: true }]),
      });
    }
    observe(node: unknown) {
      this.observed.push(node);
    }
    disconnect() {}
  }
  const h = hookHarness(
    "src/components/music/music-now-search.tsx",
    "MusicNowSearch",
    {
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, n) => String(n) }),
      "@/components/poster": { Poster: "Poster" },
      "./music-now-playing-mark": { MusicTrackPlaybackMark: "MusicTrackPlaybackMark" },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/music/catalog": {
        searchTyped: async (_value: string, limit: number) => {
          typed.push(limit);
          return { tracks: page(limit) };
        },
      },
      "@/lib/music/player": { enqueueMusic() {}, playMusic: async () => {} },
      "@/lib/music/search-ranking": { rankMusicSearch: () => null },
      "@/lib/music/video-pages": {
        searchMusicVideoPage: (...args: unknown[]) => {
          videoCalls.push(args);
          return videoPages[videoCalls.length - 1]();
        },
      },
      "@/lib/music/now-search": nowSearchModule,
      "./music-media-badge": { MusicMediaBadge: "MusicMediaBadge" },
      "./music-now-search.css": {},
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    },
    {
      setTimeout: (fn: () => void) => timers.push(fn),
      clearTimeout() {},
      IntersectionObserver: FakeObserver,
    },
  );
  const render = () => h.render({ onClose() {} }) as unknown;
  const settle = async () => {
    render();
    await flushPromises();
    return render();
  };
  const type = async (value: string) => {
    all(render())
      .find((n) => n.type === "input")!
      .props.onChange({ target: { value } });
    render();
    timers.shift()!();
    return settle();
  };
  return { render, settle, type, observers, typed, videoCalls, list, sentinel };
}

const videos = (count: number) =>
  page(count).map((item) => ({ ...item, mediaKind: "video" as const }));

function listRule(): string {
  const at = CSS.indexOf("\n.music-now-search-list {");
  assert.notEqual(at, -1, "the results list lost its own rule");
  return CSS.slice(at, CSS.indexOf("}", at));
}

test("the observer root actually clips, or every page loads at once without a scroll", () => {
  const list = listRule();
  assert.match(list, /overflow-y:\s*auto/);
  assert.match(
    list,
    /max-height:\s*min\(/,
    "a flex-only height leaves the list unclipped, so the sentinel is always intersecting",
  );
});

test("the sentinel is measured against the list, not the viewport, and loads the next page", async () => {
  const s = nowSearch();
  await s.type("song");
  assert.deepEqual(s.typed, [NOW_SEARCH_PAGE]);
  const observer = s.observers.at(-1)!;
  assert.equal(observer.options.root, s.list, "the observer root is the results list");
  assert.deepEqual(observer.observed, [s.sentinel]);
  observer.fire();
  await s.settle();
  assert.deepEqual(s.typed, [NOW_SEARCH_PAGE, NOW_SEARCH_PAGE * 2]);
});

test("a page never lands past the end of the list it scrolls in", () => {
  assert.match(listRule(), /overscroll-behavior:\s*contain/);
});

test("video mode follows the provider continuation instead of increasing a fixed search cap", async () => {
  const s = nowSearch([
    async () => ({ tracks: videos(12), next: "cursor-2" }),
    async () => {
      throw new Error("offline");
    },
    async () => ({ tracks: videos(12), next: null }),
  ]);
  const tree = s.render();
  all(tree)
    .find((n) => n.type === "button" && n.props.children === "music.now.videos")!
    .props.onClick();
  await s.type("song");
  assert.deepEqual(s.videoCalls[0], ["song", false, null]);
  s.observers.at(-1)!.fire();
  const failed = await s.settle();
  assert.deepEqual(s.videoCalls[1], ["song", false, "cursor-2"], "the next page uses its cursor");
  all(failed)
    .find((n) => n.type === "button" && n.props.className === "music-now-search-retry")!
    .props.onClick();
  await s.settle();
  assert.deepEqual(s.videoCalls[2], ["song", false, "cursor-2"], "a retry keeps the cursor");
  assert.deepEqual(s.typed, [], "video mode never asks the capped song search");
});

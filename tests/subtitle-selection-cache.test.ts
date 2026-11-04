// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { selectedSubtitleCacheName } from "../src/lib/subtitles/selected-subtitle-cache.ts";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

test("selected subtitle cache paths are stable per content, release, and subtitle", () => {
  const choice = {
    source: "https://cdn.example.test/subtitles/arabic.zip?token=secret",
    provider: "SubSource",
    subId: "subsource:42",
  };
  const first = selectedSubtitleCacheName("tt123|1|2", "torrent:abc:0", choice, "srt");
  const again = selectedSubtitleCacheName("tt123|1|2", "torrent:abc:0", choice, "srt");
  const otherEpisode = selectedSubtitleCacheName("tt123|1|3", "torrent:abc:0", choice, "srt");

  assert.equal(first, again);
  assert.notEqual(first, otherEpisode);
  assert.match(first, /^selected-[a-f0-9]{8}\.srt$/);
  assert.doesNotMatch(first, /token|secret|subsource/i);
});

type Listener = (snap: typeof emptySnapshot) => void;

function setup() {
  const store = new Map<string, unknown>();
  const cached: Array<{ mediaKey: string; playableUrl: string; cues: unknown }> = [];
  const listeners = new Set<Listener>();
  let playable = "";
  const bridge = {
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSelectedTrackUrl: () => playable,
    getSelectedTrackCues: () => [{ start: 0, end: 1, text: playable }],
    setSubtitleTrack() {},
  };
  const h = hookHarness(
    "src/views/player/hooks/use-playback-controls.ts",
    "usePlaybackControls",
    {
      "@/lib/player/playback-clock": { getPlaybackPosition: () => 0 },
      "@/lib/player-prefs": { writePlayerPrefs() {} },
      "@/lib/subtitles/subtitle-memory": {
        rememberedFromChoice: (c: Record<string, unknown>) => ({ source: c.source }),
        readRememberedSub: (key: string) => store.get(key) ?? null,
        writeRememberedSub: (key: string, sub: object) => {
          const remembered = { ...sub };
          store.set(key, remembered);
          return remembered;
        },
        subtitleSourceIsLocal: (s?: string) => !!s && !/^(https?|blob|data):/i.test(s),
      },
      "@/lib/player/imported-subs": { hasImportedSubTitle: () => false },
      "@/lib/subtitles/selected-subtitle-cache": {
        cacheSelectedSubtitle: async (input: (typeof cached)[number]) => {
          cached.push(input);
          return null;
        },
      },
      "@/lib/media-session": { notifyMediaSeeked() {} },
    },
    { window: { setTimeout: () => 1, clearTimeout() {} } },
  );
  const render = (mediaKey: string) =>
    h.render({
      bridgeRef: { current: bridge },
      snapRef: { current: emptySnapshot },
      metaId: "tt100",
      mediaKey,
      subtitleStreamKey: "torrent:abc:0",
      inRoom: false,
      isHost: false,
      hasStarted: true,
      canControl: true,
      castDevice: null,
    }) as { rememberSubChoice: (choice: Record<string, unknown> | null) => void };
  const select = (id: string, url: string) => {
    playable = `asset://${id}`;
    const snap = { ...emptySnapshot, subtitleTracks: [{ id, url, selected: true }] };
    for (const fn of listeners) fn(snap as typeof emptySnapshot);
  };
  return { render, select, cached, listeners };
}

test("a manual external choice caches the bytes of the track that becomes selected", async () => {
  const { render, select, cached } = setup();
  const url = "https://subs.test/en.srt";
  render("tt100|1|1").rememberSubChoice({ id: "7", url, lang: "en", external: true });
  select("6", "https://subs.test/other.srt");
  assert.equal(cached.length, 0, "a different selection is not cached");
  select("7", url);
  await flushPromises();
  assert.equal(cached.length, 1);
  assert.equal(cached[0].playableUrl, "asset://7");
  assert.deepEqual(cached[0].cues, [{ start: 0, end: 1, text: "asset://7" }]);
});

test("only the latest choice is cached, and a new item drops a pending one", async () => {
  const { render, select, cached, listeners } = setup();
  const controls = render("tt100|1|1");
  controls.rememberSubChoice({ id: "7", url: "https://subs.test/en.srt", external: true });
  controls.rememberSubChoice({ id: "8", url: "https://subs.test/fr.srt", external: true });
  select("7", "https://subs.test/en.srt");
  select("8", "https://subs.test/fr.srt");
  await flushPromises();
  assert.deepEqual(
    cached.map((c) => c.playableUrl),
    ["asset://8"],
  );

  render("tt100|1|1").rememberSubChoice({
    id: "9",
    url: "https://subs.test/de.srt",
    external: true,
  });
  render("tt100|1|2");
  assert.equal(listeners.size, 0, "changing item stops waiting for the old selection");
});

test("a local imported subtitle is remembered but never copied", () => {
  const { render, cached, listeners } = setup();
  render("tt100|1|1").rememberSubChoice({
    id: "3",
    source: "C:\\Subs\\movie.en.srt",
    external: true,
    imported: true,
  });
  assert.equal(listeners.size, 0);
  assert.equal(cached.length, 0);
});

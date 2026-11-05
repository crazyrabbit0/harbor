// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { downloadPlayerSrc } from "../src/lib/download/player-src.ts";
import { localPlayerSrc } from "../src/lib/local-library/player-src.ts";
import { subtitleStreamDescriptor } from "../src/lib/subtitles/provider-label.ts";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import { pickHandlerHarness } from "./helpers/pick-handler-harness.ts";

test("local and downloaded playback carry the exact filename into subtitle search", () => {
  const local = localPlayerSrc({
    id: "local-1",
    path: "D:\\Shows\\Show.S01E03.BluRay.mkv",
    filename: "Show.S01E03.BluRay.mkv",
    title: "Show",
    year: 2025,
    type: "show",
    season: 1,
    episode: 3,
    subtitlePaths: ["D:\\Shows\\Show.S01E03.BluRay.ar.srt"],
    addedAt: 1,
  });
  assert.equal(subtitleStreamDescriptor(local.streamRef), "Show.S01E03.BluRay.mkv");
  assert.deepEqual(local.subtitles, [
    {
      url: "D:\\Shows\\Show.S01E03.BluRay.ar.srt",
      lang: "ar",
      trustedSource: true,
    },
  ]);

  const downloaded = downloadPlayerSrc(
    { id: "tt1234567", type: "series", name: "Show" },
    { season: 1, episode: 3 },
    {
      id: "download-1",
      path: "D:\\Downloads\\Show.S01E03.WEB-DL.mkv",
      title: "Show",
      status: "done",
      startedAt: 1,
    },
  );
  assert.equal(subtitleStreamDescriptor(downloaded.streamRef), "Show.S01E03.WEB-DL.mkv");
});

const debridResolved = async () => ({
  ok: true,
  via: "realdebrid",
  data: { url: "https://debrid.test/f", filename: "Show.S01E03.mkv", fileIdx: 3 },
  readiness: { exactUrlValidated: true },
});
const packStream = {
  infoHash: "abc",
  fileIdx: 0,
  behaviorHints: { filename: "Season.Pack.mkv" },
  addonId: "addon",
};

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

// Picks a stream for another episode from the in-player episode panel; returns the replaced source.
async function episodePanelPick() {
  const replaced: any[] = [];
  const noop = () => {};
  const episode = { season: 1, episode: 3 };
  const h = hookHarness("src/components/player/episode-panel/index.tsx", "EpisodePanel", {
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    "lucide-react": { ChevronDown: "ChevronDown", X: "X" },
    "@/components/harbor-loader": { HarborLoader: "HarborLoader" },
    "@/lib/debrid/registry": { useDebridClients: () => [{ slug: "realdebrid" }] },
    "@/lib/debrid/playback-preparation": { invalidatePreparedDebridLink: noop },
    "@/lib/settings": {
      useSettings: () => ({ settings: { instantPlay: false }, update: noop }),
    },
    "@/lib/spoilers": { spoilerMaskFor: () => undefined },
    "@/lib/stream-proxy": { registerStreamProxy: noop, unregisterStreamProxy: noop },
    "@/lib/streams/preflight": { preflightCheck: async () => ({ ok: true }) },
    "@/lib/streams/link-readiness": { skipsPreflight: () => true },
    "@/lib/streams/resolve": { resolveStream: debridResolved },
    "@/lib/perf/playback-trace": {
      beginPlaybackTrace: () => "trace",
      finishPlaybackTrace: noop,
      markPlaybackTrace: noop,
    },
    "@/lib/view": {
      usePlayerNavigation: () => ({
        openPicker: noop,
        replacePlayerSrc: (src: unknown) => replaced.push(src),
      }),
    },
    "@/lib/providers/kitsu": { parseKitsuId: () => null },
    "@/lib/streams/anime-identity-core": { splitFranchiseDisplaySeason: () => null },
    "@/lib/queue": { useQueue: () => [] },
    "./queue-up-next": { QueueUpNext: "QueueUpNext" },
    "@/lib/local-library/playback": {
      playLocalAware: (options: { playStream: () => void }) => options.playStream(),
    },
    "@/lib/local-library/player-src": { localPlayerSrc: noop },
    "@/lib/i18n": { useT: () => (s: string) => s },
    "./episode-row": { EpisodeRow: "EpisodeRow" },
    "@/views/detail/season-stepper": { SeasonStepper: "SeasonStepper" },
    "./season-picker": { SeasonPicker: "SeasonPicker" },
    "./streams-view": { StreamsView: "StreamsView" },
    "./use-season-browser": {
      useSeasonBrowser: () => ({
        seasons: [1],
        season: 1,
        setSeason: noop,
        episodes: [episode],
        loading: false,
        imdbRatings: new Map(),
        absoluteFor: () => undefined,
      }),
    },
  });
  const props = {
    open: true,
    onClose: noop,
    meta: { id: "tt1", type: "series", name: "Show" },
    currentEpisode: undefined,
  };
  all(h.render(props))
    .find((n) => n.type === "EpisodeRow")!
    .props.onPlay();
  await all(h.render(props))
    .find((n) => n.type === "StreamsView")!
    .props.onPick(packStream);
  return replaced;
}

test("debrid playback retains the resolver-selected episode filename", async () => {
  const picker = pickHandlerHarness({ resolve: debridResolved });
  picker.api.onPlay(packStream);
  await flushPromises();
  assert.equal(picker.opened.length, 1);
  assert.equal(subtitleStreamDescriptor(picker.opened[0].streamRef), "Show.S01E03.mkv");
  assert.equal(picker.opened[0].streamRef.fileIdx, 3);

  const replaced = await episodePanelPick();
  assert.equal(replaced.length, 1);
  assert.equal(subtitleStreamDescriptor(replaced[0].streamRef), "Show.S01E03.mkv");
  assert.equal(replaced[0].streamRef.fileIdx, 3);
});

test("an in-player stream swap keeps the resolver's episode filename and file index", async () => {
  const noop = () => {};
  const h = hookHarness(
    "src/views/player/hooks/use-stream-switcher.ts",
    "useStreamSwitcher",
    {
      "@/lib/player/playback-clock": {
        getPlaybackPosition: () => 0,
        usePlaybackFlag: () => false,
      },
      "@/lib/picker-cache": { pinPickerCache: noop, unpinPickerCache: noop },
      "@/lib/resume": { readResumeMs: () => 0 },
      "@/lib/dead-streams": { SHORT_PLAYBACK_SEC: 180 },
      "@/lib/playback-history": { savePlayback: noop },
      "@/lib/streams/resolve": {
        resolveStream: async () => ({
          ok: true,
          via: "debrid",
          data: { url: "https://debrid.test/f", filename: "Show.S01E03.mkv", fileIdx: 3 },
        }),
      },
      "@/lib/stream-proxy": { registerStreamProxy: noop, unregisterStreamProxy: noop },
      "@/lib/player/startup-profile": { playbackStartupProfile: () => undefined },
      "@/lib/streams/playback-redirect": { resolvePlaybackRedirect: noop },
    },
    { window: { setTimeout: () => 1, clearTimeout: noop } },
  );
  const bridge = { load: async () => {}, play: async () => {} };
  const args = {
    bridgeRef: { current: bridge },
    src: { url: "https://a.test/1", meta: { id: "tt1", name: "Show" }, episode: undefined },
    snap: emptySnapshot,
    debrids: [],
  };
  const stream = {
    infoHash: "abc",
    fileIdx: 0,
    behaviorHints: { filename: "Season.Pack.mkv" },
    addonId: "addon",
  };
  await h.render(args).onSwitchStream(stream);
  const live = h.render(args).liveStreamRef;
  assert.equal(subtitleStreamDescriptor(live), "Show.S01E03.mkv");
  assert.equal(live.fileIdx, 3);
});

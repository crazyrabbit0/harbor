// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as cached from "../src/lib/streams/cached.ts";
import * as debridTypes from "../src/lib/debrid/types.ts";
import * as mode from "../src/lib/streams/mode.ts";
import * as quality from "../src/components/player/stream-switcher/quality.ts";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";
import { pickHandlerHarness } from "./helpers/pick-handler-harness.ts";
import { all, jsx, names } from "./helpers/plugin-ui-tree.ts";

const HASH = "a".repeat(40);
const torrent = { infoHash: HASH, cached: {}, inLibrary: {}, addonId: "torrentio", title: "Film" };
const direct = {
  url: "https://cdn.test/film.mkv",
  cached: {},
  inLibrary: {},
  addonId: "direct",
  title: "Film",
};

test("a stream with an infoHash can always reach the torrent engine", async () => {
  const allowed = async (streamMode: "both" | "addons" | "p2p", stream: object) => {
    const h = pickHandlerHarness({ streamMode });
    h.api.onPlay(stream);
    await flushPromises();
    return h.resolveCalls[0][6];
  };
  assert.equal(await allowed("addons", torrent), true, "addons mode is not a torrent kill switch");
  assert.equal(await allowed("addons", direct), false);
  assert.equal(await allowed("both", direct), true);
});

test("the P2P consent prompt is not suppressed by the source preference", () => {
  // An addon url marked uncached still asks, since playing it starts a torrent.
  const marked = { ...torrent, url: "https://addon.test/resolve/film" };
  for (const streamMode of ["both", "addons"] as const) {
    const h = pickHandlerHarness({
      streamMode,
      p2pAutoConsent: false,
      cached: false,
      p2pEligible: true,
      uncachedMarker: true,
    });
    h.api.onPlay(marked);
    assert.equal(h.resolveCalls.length, 0, streamMode);
    assert.deepEqual(h.rerender().p2pConfirm, { stream: marked, forceP2p: true }, streamMode);
  }
});

// The picker view is too large to load; its one filtering line stays a text check.
test("the full picker filters through the shared stream-mode policy", () => {
  const picker = readFileSync(new URL("../src/views/play-picker.tsx", import.meta.url), "utf8");
  assert.ok(picker.includes("let all = filterStreamsByMode(candidatePool, settings.streamMode);"));
});

function bigPictureStreams(streamMode: string) {
  const settings = {
    streamMode,
    preferredLanguages: [],
    preferredAudioLangs: [],
    customStreamFilters: [],
    activeStreamFilterId: null,
    streamSort: "harbor",
  };
  const h = hookHarness("src/views/big-picture/bp-stream-filters.ts", "useBpStreamFilters", {
    "@/components/player/stream-switcher/quality": quality,
    "@/lib/settings": { useSettings: () => ({ settings, update() {} }) },
    "@/lib/streams/addon-detect": { isAddonRanked: () => false },
    "@/lib/streams/custom-filters": { isFilterEmpty: () => true, matchesCustomFilter: () => true },
    "@/lib/streams/mode": mode,
    "@/views/play-picker/picker-utils": {
      addonInstanceKey: (s: any) => s.addonId,
      buildAddonOptions: () => [],
      isWatchHub: () => false,
      hasInstantMarker: () => false,
      needsDownload: () => false,
      normalizeLangCode: (s: string) => s,
      orderByAddonNative: (s: unknown[]) => s,
      streamMatchesLangs: () => true,
    },
    "@/views/play-picker/stream-facets": {
      FACET_DIMS: [],
      facetOptions: () => [],
      matchesFacets: () => true,
    },
  });
  return h.render({
    result: { picker: { all: [torrent, direct] }, raw: { addon: [] } },
    addons: [],
    debrids: [],
    isCached: () => false,
    isAnimeRequest: false,
    hostMatch: null,
    pinned: null,
    addonLogoFor: () => null,
  }).streams;
}

test("Big Picture filters through the shared stream-mode policy", () => {
  assert.deepEqual(bigPictureStreams("addons"), [direct]);
  assert.deepEqual(bigPictureStreams("p2p"), [torrent]);
  assert.deepEqual(bigPictureStreams("both"), [torrent, direct]);
});

function switcherStreams(streamMode: string) {
  const h = hookHarness(
    "src/components/player/stream-switcher.tsx",
    "StreamSwitcher",
    {
      "react/jsx-runtime": jsx,
      "lucide-react": names,
      "@/components/addon-logo": { addonLogoMap: () => new Map() },
      "@/components/host-source-banner": names,
      "@/components/hover-tooltip": names,
      "@/lib/addon-store": { fetchInstalledAddons: () => new Promise(() => {}) },
      "@/lib/addons": { userAddons: () => new Promise(() => {}) },
      "@/lib/auth": { useAuth: () => ({ authKey: null }) },
      "@/lib/picker-cache": {
        peekPickerCache: () => ({
          result: { picker: { all: [torrent, direct] }, rejected: [] },
          meta: {},
        }),
        subscribePickerCache: () => () => {},
      },
      "@/lib/settings": {
        useSettingsSelector: (pick: (s: object) => object) =>
          pick({ preferredAudioLangs: [], preferredLanguages: [], streamMode }),
        useSettingsUpdate: () => () => {},
      },
      "@/lib/streams/cached": cached,
      "@/lib/streams/mode": mode,
      "@/lib/together/source-match": { buildMatchScores: () => null, matchBadge: () => null },
      "@/views/play-picker/picker-utils": {
        addonInstanceKey: (s: any) => s.addonId,
        buildAddonOptions: () => [],
      },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/profiles": { useActiveKid: () => null },
      "./stream-switcher/filters-menu": names,
      "@/views/play-picker/quality-filter": { sourceGroup: () => null },
      "./stream-switcher/kids-switcher": names,
      "./stream-switcher/lang-utils": {
        normalizeLangCode: (s: string) => s,
        streamMatchesLangs: () => true,
      },
      "./stream-switcher/quality": quality,
      "./stream-switcher/switcher-row": {
        isCurrentStream: () => false,
        streamKey: (s: any) => s.url ?? s.infoHash,
        SwitcherRow: "SwitcherRow",
      },
      "./stream-switcher/use-switcher-refresh": {
        useSwitcherRefresh: () => ({ refreshing: false, refresh() {} }),
      },
    },
    { window: { addEventListener() {}, removeEventListener() {} } },
  );
  const tree = h.render({
    open: true,
    onClose() {},
    onPick() {},
    resolvingKey: null,
    currentUrl: "",
    debridSlugs: [],
    meta: { id: "tt1", name: "Film" },
  });
  return all(tree)
    .filter((n) => n.type === "SwitcherRow")
    .map((n) => n.props.stream);
}

test("the in-player switcher filters through the shared stream-mode policy", () => {
  assert.deepEqual(switcherStreams("addons"), [direct]);
  assert.deepEqual(switcherStreams("p2p"), [torrent]);
  assert.deepEqual(switcherStreams("both"), [torrent, direct]);
});

test("only the explicit kill switch disables torrents", () => {
  const gating = (settings: Record<string, unknown>) =>
    loadModule(
      "src/lib/torrent/stremio-stream.ts",
      {
        "@/lib/stremio-server": {
          DEFAULT_BUNDLED_PORT: 11470,
          getStremioServerUrl: () => "http://127.0.0.1:11470",
          isBundledEngineUrl: () => false,
          remoteStreamServerUrl: () => "",
        },
        "@/lib/stored-settings": { storedSettings: () => settings },
      },
      { window: { __TAURI_INTERNALS__: {} } },
    );
  const stream = { infoHash: HASH, seeders: 10 };
  for (const streamMode of ["both", "addons", "p2p"]) {
    const g = gating({ streamMode });
    assert.equal(g.torrentsDisabled(), false, streamMode);
    assert.equal(g.engineP2pEligible(stream), true, streamMode);
  }
  const off = gating({ streamMode: "addons", torrentsDisabled: true });
  assert.equal(off.torrentsDisabled(), true);
  assert.equal(off.engineP2pEligible(stream), false);
  assert.equal(off.directTorrentEnabled(), false);
});

test("resolve reaches the engine before it falls through to an addon url", async () => {
  const added: string[] = [];
  const { resolveStream } = loadModule("src/lib/streams/resolve.ts", {
    "@/lib/safe-fetch": { safeFetch: async () => ({ ok: false }) },
    "@/lib/debug": { dwarn() {} },
    "@/lib/download/downloads-store": { completedTorrentDownloadFor: async () => null },
    "./cached": cached,
    "@/lib/debrid/types": debridTypes,
    "@/lib/debrid/playback-preparation": {
      getPreparedDebridLink: async () => null,
      invalidatePreparedDebridLink() {},
    },
    "@/lib/torrent/local-engine": {
      beginTorrentPlaybackHandoff() {},
      lastEngineAddError: () => null,
      scheduleAbandonedTorrentRemoval() {},
      torrentEngineAdd: async (magnet: string) => {
        added.push(magnet);
        return {
          info_hash: HASH,
          stream_base: "http://127.0.0.1:9",
          files: [{ idx: 0, name: "film.mkv", length: 1 }],
        };
      },
      torrentEngineSelect: async () => true,
    },
    "@/lib/torrent/stremio-stream": {
      buildTorrentStreamUrl() {},
      createAndListFiles: async () => null,
      directTorrentEnabled: () => true,
      engineP2pEligible: () => true,
      isHostedTorrentServerUrl: () => false,
      isVideoFile: () => true,
      localTorrentAllowed: () => true,
      trackersFromSources: () => [],
    },
    "@/lib/stremio-server": {
      probeStremioServer: async () => false,
      remoteStreamServerStrict: () => false,
      remoteStreamServerUrl: () => "",
    },
    "./episode-file": { matchEpisodeFileIndex: () => -1 },
  });
  const both = { ...torrent, url: "https://addon.test/film.mkv" };
  const signal = new AbortController().signal;
  const forced = await resolveStream(both, [], signal, true, true);
  assert.equal(forced.via, "p2p");
  assert.equal(forced.data.url, `http://127.0.0.1:9/${HASH}/0`);
  assert.equal(added.length, 1);
  const plain = await resolveStream(both, [], signal, true, false);
  assert.equal(plain.via, "direct", "without forceP2p the addon url still plays");
});

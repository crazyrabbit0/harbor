// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { PreparedSubtitleCleanupRegistry } from "../src/lib/player/prepared-subtitle-cleanups.ts";
import { SubtitleSelectionCoordinator } from "../src/lib/player/subtitle-selection.ts";
import {
  SubtitleAutoloadRunCoordinator,
  subtitleAutoloadLateSelectionAllowed,
  subtitleAutoloadSelectionLeaseValid,
} from "../src/lib/subtitles/autoload-run.ts";
import { PreparedSubtitleSeedBatch } from "../src/lib/subtitles/seed-batch.ts";
import { automaticAutoSyncMayStart } from "../src/lib/subtitles/autosync/preflight-gate.ts";
import {
  pickDesiredSubtitleTrack,
  subtitleAutoSelectionSignature,
} from "../src/lib/subtitles/track-selection.ts";
import ts from "typescript";
import { html5BridgeHarness } from "./helpers/html5-bridge-harness.ts";
import { deferred, flushBridge, mpvBridgeHarness } from "./helpers/mpv-bridge-harness.ts";

test("only the latest async subtitle selection may commit", () => {
  const coordinator = new SubtitleSelectionCoordinator();
  const first = coordinator.begin(4, "slow", "original");
  const second = coordinator.begin(4, "fast", "original");
  const available = (id: string) => ["original", "slow", "fast"].includes(id);

  assert.deepEqual(coordinator.settle(first, 4, true, available), { current: false });
  assert.deepEqual(coordinator.settle(second, 4, true, available), {
    current: true,
    selectedId: "fast",
  });
});

test("a current failed subtitle selection rolls back only to an available track", () => {
  const coordinator = new SubtitleSelectionCoordinator();
  const recoverable = coordinator.begin(7, "broken", "previous");
  assert.deepEqual(
    coordinator.settle(recoverable, 7, false, (id) => id === "previous"),
    {
      current: true,
      selectedId: "previous",
    },
  );

  const missingPrevious = coordinator.begin(7, "also-broken", "removed");
  assert.deepEqual(
    coordinator.settle(missingPrevious, 7, false, () => false),
    {
      current: true,
      selectedId: null,
    },
  );
});

test("media replacement and explicit clearing invalidate pending selections", () => {
  const coordinator = new SubtitleSelectionCoordinator();
  const oldMedia = coordinator.begin(2, "subtitle", null);
  assert.deepEqual(
    coordinator.settle(oldMedia, 3, true, () => true),
    { current: false },
  );

  const cleared = coordinator.begin(3, "subtitle", null);
  coordinator.invalidate();
  assert.deepEqual(
    coordinator.settle(cleared, 3, true, () => true),
    { current: false },
  );
});

test("prepared subtitle resources are released by media generation exactly once", () => {
  const registry = new PreparedSubtitleCleanupRegistry();
  const calls: string[] = [];
  registry.register(() => calls.push("old"), 1);
  registry.register(() => {
    calls.push("old-throws");
    throw new Error("cleanup failure");
  }, 1);
  registry.register(() => calls.push("current"), 2);

  registry.clearBefore(2);
  assert.deepEqual(calls, ["old", "old-throws"]);

  registry.clearBefore(2);
  assert.deepEqual(calls, ["old", "old-throws"]);

  registry.clearAll();
  registry.clearAll();
  assert.deepEqual(calls, ["old", "old-throws", "current"]);
});

test("a newer subtitle autoload run invalidates an overlapping run for the same media", () => {
  const coordinator = new SubtitleAutoloadRunCoordinator();
  const stale = coordinator.begin("episode");
  const current = coordinator.begin("episode");

  assert.equal(coordinator.isCurrent(stale, "episode"), false);
  assert.equal(coordinator.isCurrent(current, "episode"), true);
  assert.equal(coordinator.isCurrent(current, "other-episode"), false);

  coordinator.invalidate();
  assert.equal(coordinator.isCurrent(current, "episode"), false);
});

test("delayed hash enrichment may upgrade only the current automatic selection", () => {
  const base = {
    leaseRevision: 2,
    leaseSelectedId: null,
    currentRevision: 3,
    currentSelectedId: "selected-track",
  };

  assert.equal(
    subtitleAutoloadSelectionLeaseValid({
      ...base,
      currentSelectionIsAutomatic: true,
    }),
    true,
  );
  assert.equal(
    subtitleAutoloadSelectionLeaseValid({
      ...base,
      currentSelectionIsAutomatic: false,
    }),
    false,
  );
  assert.equal(
    subtitleAutoloadLateSelectionAllowed({
      currentSelectedId: "automatic",
      currentSelectionIsAutomatic: true,
      autoUpgradeEnabled: false,
    }),
    false,
  );
  assert.equal(
    subtitleAutoloadLateSelectionAllowed({
      currentSelectedId: "automatic",
      currentSelectionIsAutomatic: true,
      autoUpgradeEnabled: true,
    }),
    true,
  );
  assert.equal(
    subtitleAutoloadLateSelectionAllowed({
      currentSelectedId: "user-selection",
      currentSelectionIsAutomatic: false,
      autoUpgradeEnabled: true,
    }),
    false,
  );
  assert.equal(
    subtitleAutoloadLateSelectionAllowed({
      currentSelectedId: null,
      currentSelectionIsAutomatic: false,
      autoUpgradeEnabled: false,
    }),
    true,
  );
});

function mpvSeedTrackList(urls: string[]) {
  return urls.map((url, i) => ({
    type: "sub",
    id: i + 1,
    lang: url.includes("fr") ? "fr" : "en",
    external: true,
    "external-filename": url,
  }));
}

test("mpv seeds become auto-selectable together, only after every seed settles", async () => {
  const h = mpvBridgeHarness();
  const slow = deferred();
  const cleaned: string[] = [];
  h.prepareWith(async ({ url }) => {
    if (url.includes("fr")) await slow.promise;
    return {
      playableUrl: `C:\\tmp\\${url.slice(-6)}`,
      format: "srt",
      cues: cue(url),
      cleanup: () => cleaned.push(url),
    };
  });
  await h.bridge.load({
    url: "fixture.mkv",
    subtitles: [
      { url: "https://subs.test/en.srt", lang: "en" },
      { url: "https://subs.test/fr.srt", lang: "fr" },
    ],
  });
  await flushBridge();
  h.emit("track-list", mpvSeedTrackList(["C:\\tmp\\en.srt"]));
  const eligible = () =>
    h.snapshot().subtitleTracks.map((t) => [t.lang, t.prepared, t.autoSelectionEligible]);
  assert.deepEqual(eligible(), [["en", true, false]], "a ready seed waits for its slower siblings");
  slow.resolve();
  await flushBridge();
  h.emit("track-list", mpvSeedTrackList(["C:\\tmp\\en.srt", "C:\\tmp\\fr.srt"]));
  assert.deepEqual(eligible(), [
    ["en", true, true],
    ["fr", true, true],
  ]);
  assert.deepEqual(cleaned, [], "prepared files stay alive while their media plays");
  await h.bridge.load({ url: "next.mkv" });
  await flushBridge();
  assert.deepEqual(cleaned.sort(), ["https://subs.test/en.srt", "https://subs.test/fr.srt"]);
});

test("mpv drops a seed batch whose media was replaced before it settled", async () => {
  const h = mpvBridgeHarness();
  const slow = deferred();
  let cleaned = 0;
  h.prepareWith(async () => {
    await slow.promise;
    return {
      playableUrl: "C:/tmp/old.srt",
      format: "srt",
      cues: cue("old"),
      cleanup: () => cleaned++,
    };
  });
  await h.bridge.load({
    url: "fixture.mkv",
    subtitles: [{ url: "https://subs.test/old.srt", lang: "en" }],
  });
  await h.bridge.load({ url: "next.mkv" });
  slow.resolve();
  await flushBridge();
  assert.equal(cleaned, 1);
  assert.equal(
    h.commands.some(({ command }) => command === "mpv_sub_add"),
    false,
  );
});

const cue = (text: string) => [{ start: 0, end: 5, text }];

test("html5 seeds become auto-selectable together, only after every seed settles", async () => {
  const slow = Promise.withResolvers<void>();
  const h = html5BridgeHarness(
    { "https://subs.test/en.srt": cue("en"), "https://subs.test/fr.srt": cue("fr") },
    { gate: new Map([["https://subs.test/fr.srt", slow.promise]]) },
  );
  await h.bridge.load({
    url: "https://media.test/a.mp4",
    subtitles: [
      { url: "https://subs.test/en.srt", lang: "en" },
      { url: "https://subs.test/fr.srt", lang: "fr" },
    ],
  });
  const eligible = () =>
    h.snapshot().subtitleTracks.map((t) => [t.lang, t.autoSelectionEligible ?? false]);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(
    eligible(),
    [
      ["en", false],
      ["fr", false],
    ],
    "a ready seed waits for its slower siblings",
  );
  slow.resolve();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(eligible(), [
    ["en", true],
    ["fr", true],
  ]);
});

test("a new html5 load drops the previous source's seeds, even ones still loading", async () => {
  const slow = Promise.withResolvers<void>();
  const h = html5BridgeHarness(
    { "https://subs.test/old.srt": cue("old") },
    { gate: new Map([["https://subs.test/old.srt", slow.promise]]) },
  );
  await h.bridge.load({
    url: "https://media.test/a.mp4",
    subtitles: [{ url: "https://subs.test/old.srt", lang: "en" }],
  });
  await h.bridge.load({ url: "https://media.test/b.mp4" });
  slow.resolve();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(h.snapshot().subtitleTracks, []);
});

test("html5 drops unsafe provider seeds but keeps trusted local and home-server ones", async () => {
  const h = html5BridgeHarness(
    {},
    { safeProviderUrl: (url) => url.startsWith("https://subs.test/") },
  );
  await h.bridge.load({
    url: "https://media.test/a.mp4",
    subtitles: [
      { url: "https://subs.test/en.srt", lang: "en" },
      { url: "http://10.0.0.5/evil.srt", lang: "de" },
      { url: "C:/subs/a.fr.srt", lang: "fr", trustedSource: true },
    ],
  });
  assert.deepEqual(
    h.snapshot().subtitleTracks.map((t) => [t.lang, t.providerDerived]),
    [
      ["en", true],
      ["fr", false],
    ],
  );
});

test("mpv drops unsafe provider seeds but keeps trusted local and home-server ones", async () => {
  const h = mpvBridgeHarness(undefined, undefined, {
    safeProviderUrl: (url) => url.startsWith("https://subs.test/"),
  });
  await h.bridge.load({
    url: "fixture.mkv",
    subtitles: [
      { url: "https://subs.test/en.srt", lang: "en" },
      { url: "http://10.0.0.5/evil.srt", lang: "de" },
      { url: "http://10.0.0.5/jellyfin.srt", lang: "fr", trustedSource: true },
    ],
  });
  await flushBridge();
  assert.deepEqual(
    h.commands.filter(({ command }) => command === "mpv_sub_add").map(({ args }) => args.lang),
    ["en", "fr"],
  );
});

test("home-server playback marks its subtitles trusted, including after a quality switch", async () => {
  const connection = { id: "c1", provider: "jellyfin", name: "Home", preferredQuality: "original" };
  const item = { id: "i1", identity: {}, versions: [] };
  const playback = (url: string) => ({
    url,
    direct: true,
    versionId: "v1",
    effectiveQuality: "original",
    subtitles: [{ id: "s1", url: `${url}.srt`, language: "en" }],
  });
  const mocks: Record<string, unknown> = {
    "./sync": {
      mediaServerAdapter: () => ({ playback: async () => playback("http://10.0.0.5/b") }),
    },
    "./connections": {
      mediaServerConnections: () => [connection],
      updateMediaServerConnection() {},
    },
    "./index-store": { mediaServerItems: async () => [item] },
    "./playback-policy": { decidePlaybackSource() {} },
  };
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/media-server/playback.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const mod: Record<string, any> = {};
  new Function("require", "exports", code)((id: string) => {
    assert.ok(id in mocks, `Unexpected import ${id}`);
    return mocks[id];
  }, mod);
  const src = mod.mediaServerPlayerSrc({
    meta: { id: "tt1", name: "Movie" },
    connection,
    item,
    playback: playback("http://10.0.0.5/a"),
  });
  assert.equal(src.subtitles[0].trustedSource, true);
  const switched = await mod.switchMediaServerQuality({
    src,
    quality: "720p",
    positionMs: 0,
    playing: true,
  });
  assert.equal(switched.subtitles[0].url, "http://10.0.0.5/b.srt");
  assert.equal(switched.subtitles[0].trustedSource, true);
});

test("the media-server library builds its subtitles through the shared trusted mapping", () => {
  const tab = readFileSync(
    new URL("../src/views/library/media-servers-tab.tsx", import.meta.url),
    "utf8",
  );
  assert.match(tab, /subtitles: mediaServerSubtitles\(source\)/);
  assert.doesNotMatch(tab, /trustedSource/, "no hand-built copy of the subtitle mapping");
});

test("reversed seed completion cannot lock a lower-priority language before batch publish", () => {
  const english = {
    id: "english-first",
    lang: "en",
    external: true,
    prepared: true,
    autoSelectionEligible: false,
  };
  const arabic = {
    id: "arabic-second",
    lang: "ar",
    external: true,
    prepared: true,
    autoSelectionEligible: false,
  };
  const batch = new PreparedSubtitleSeedBatch([english, arabic]);
  const pendingSignature = subtitleAutoSelectionSignature([english, arabic]);

  batch.markReady(english);
  assert.equal(pickDesiredSubtitleTrack([english, arabic], ["ar"], false), null);
  batch.markReady(arabic);
  batch.commit(
    () => true,
    (ready) => {
      for (const track of ready) track.autoSelectionEligible = true;
    },
  );

  assert.notEqual(subtitleAutoSelectionSignature([english, arabic]), pendingSignature);
  assert.equal(pickDesiredSubtitleTrack([english, arabic], ["ar"], false)?.id, arabic.id);
});

test("delayed candidate preflight blocks structural autosync and an aligned result keeps it blocked", () => {
  const inferior = {
    external: true,
    lang: "ar",
    prepared: true,
    timingStatus: "fixed-offset" as const,
  };
  const aligned = {
    external: true,
    lang: "ar",
    prepared: true,
    timingStatus: "aligned" as const,
  };
  const alignedEnglish = {
    external: true,
    lang: "en",
    prepared: true,
    timingStatus: "aligned" as const,
  };

  assert.equal(
    automaticAutoSyncMayStart({
      preflightSettled: false,
      tracks: [inferior],
      selectedLanguage: "ar",
    }),
    false,
  );
  assert.equal(
    automaticAutoSyncMayStart({
      preflightSettled: false,
      tracks: [inferior, aligned],
      selectedLanguage: "ar",
    }),
    false,
  );
  assert.equal(
    automaticAutoSyncMayStart({
      preflightSettled: true,
      tracks: [inferior, aligned],
      selectedLanguage: "ar",
    }),
    false,
  );
  assert.equal(
    automaticAutoSyncMayStart({
      preflightSettled: true,
      tracks: [inferior],
      selectedLanguage: "ar",
    }),
    true,
  );
  assert.equal(
    automaticAutoSyncMayStart({
      preflightSettled: true,
      tracks: [inferior, alignedEnglish],
      selectedLanguage: "ar",
    }),
    true,
  );
});

test("mpv autosync reuses retained prepared cues and paths", async () => {
  const h = mpvBridgeHarness();
  await h.bridge.load({ url: "fixture.mkv" });
  let downloads = 0;
  h.prepareWith(async () => {
    downloads++;
    return { playableUrl: "C:/tmp/x.srt", format: "srt", cues: [], cleanup() {} };
  });
  const handoff = cue("from the picker");
  h.transferPrepared("C:\\tmp\\a.srt", {
    playableUrl: "C:\\tmp\\a.srt",
    cues: handoff,
    cleanup() {},
  });
  assert.equal(
    await h.bridge.addSubtitle("C:\\tmp\\a.srt", "en", "A", true, {
      originalUrl: "https://subs.test/a.srt",
      provider: "Fixture",
    }),
    true,
  );
  assert.equal(downloads, 0, "a subtitle another window prepared is not downloaded again");
  h.emit("track-list", [
    {
      type: "sub",
      id: 4,
      lang: "en",
      external: true,
      selected: true,
      "external-filename": "C:\\tmp\\a.srt",
    },
  ]);
  assert.equal(h.bridge.getSelectedTrackCues(), handoff);

  assert.equal(await h.bridge.addSubtitle("https://subs.test/b.srt", "en", "B", true), true);
  assert.equal(downloads, 1);
  h.emit("track-list", [
    {
      type: "sub",
      id: 5,
      lang: "en",
      external: true,
      selected: true,
      "external-filename": "C:/tmp/x.srt",
    },
  ]);
  assert.equal(
    h.bridge.getSelectedTrackUrl(),
    "C:/tmp/x.srt",
    "a prepared track hands autosync its local copy, not the provider URL",
  );
});

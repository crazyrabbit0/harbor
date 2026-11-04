// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import { restoreHarness, subtitleTrack } from "./helpers/subtitle-memory-harness.ts";
import { bindSubtitleDownloadAuth } from "../src/lib/subtitles/provider-auth.ts";
import {
  rememberedChoiceFromLoad,
  rememberedFromChoice,
  rememberedSubAppliesToStream,
  rememberedSubtitleLoadMetadata,
  subtitleStreamKey,
} from "../src/lib/subtitles/subtitle-memory.ts";

test("the same torrent release shares a subtitle key across providers", () => {
  const a = subtitleStreamKey({ infoHash: "ABC123", fileIdx: 4, addonId: "provider-a" });
  const b = subtitleStreamKey({ infoHash: "abc123", fileIdx: 4, addonId: "provider-b" });

  assert.equal(a, b);
});

test("different releases receive different subtitle keys", () => {
  const a = subtitleStreamKey({ parsedTitle: "Movie.2024.BluRay.REMUX-GROUP" });
  const b = subtitleStreamKey({ parsedTitle: "Movie.2024.WEB-DL-GROUP" });

  assert.notEqual(a, b);
});

test("subtitle keys never contain a playable URL", () => {
  const key = subtitleStreamKey({
    addonId: "addon",
    parsedTitle: "Movie.2024.1080p.WEB-DL-GROUP",
    source: "webdl",
  });

  assert.ok(key);
  assert.doesNotMatch(key, /https?:|token|signature/i);
});

test("a remembered external subtitle is not restored onto another release", () => {
  const first = { infoHash: "first", fileIdx: 0 };
  const second = { infoHash: "second", fileIdx: 0 };
  const remembered = {
    source: "downloaded-subtitle.srt",
    streamKey: subtitleStreamKey(first),
    updatedAt: 1,
  };

  assert.equal(rememberedSubAppliesToStream(remembered, first), true);
  assert.equal(rememberedSubAppliesToStream(remembered, second), false);
});

test("legacy external choices do not override an identifiable current release", () => {
  const remembered = { source: "downloaded-subtitle.srt", updatedAt: 1 };

  assert.equal(
    rememberedSubAppliesToStream(remembered, { infoHash: "current", fileIdx: 0 }),
    false,
  );
});

test("manual subtitle memory keeps provider identity and non-secret download auth", async () => {
  const downloadAuth = await bindSubtitleDownloadAuth("subsource-api-key", "test-secret");
  assert.ok(downloadAuth);
  const choice = rememberedChoiceFromLoad("memory:prepared-subtitle", "ar", "Release title", {
    originalUrl: "https://example.test/subtitle/42",
    format: "srt",
    encoding: "utf-8",
    provider: "SubSource",
    providerDerived: true,
    release: "Show.S01E02.WEB-DL-GROUP",
    subId: "subsource:42",
    downloadAuth,
    matchScore: 91,
    matchConfidence: "high",
  });
  const remembered = rememberedFromChoice(choice);

  assert.equal(remembered.source, "https://example.test/subtitle/42");
  assert.equal(remembered.provider, "SubSource");
  assert.equal(remembered.providerDerived, true);
  assert.equal(remembered.release, "Show.S01E02.WEB-DL-GROUP");
  assert.equal(remembered.subId, "subsource:42");
  assert.equal(remembered.downloadAuthKind, "subsource-api-key");
  assert.equal("downloadAuth" in remembered, false);
  assert.doesNotMatch(JSON.stringify(remembered), new RegExp(downloadAuth.credentialId));
  assert.doesNotMatch(JSON.stringify(remembered), /test-secret/);
});

test("saved Live Sync subtitles restore as trusted local files, including legacy memories", () => {
  const source = "C:\\Users\\viewer\\AppData\\Roaming\\Harbor\\synced.srt";
  const remembered = rememberedFromChoice({
    source,
    external: true,
    imported: true,
    provider: "Harbor Live Sync",
    providerDerived: false,
  });
  const legacyRemembered = { ...remembered, providerDerived: undefined, updatedAt: 1 };

  assert.equal(remembered.providerDerived, false);
  assert.equal(rememberedSubtitleLoadMetadata(remembered).providerDerived, false);
  assert.equal(rememberedSubtitleLoadMetadata(legacyRemembered).providerDerived, false);
  assert.equal(rememberedSubtitleLoadMetadata(legacyRemembered).originalUrl, source);
});

test("the main player rebinds modal auth handles instead of trusting another WebView registry", async () => {
  const listeners = new Map<string, (e: { payload: unknown }) => void>();
  const binds: Array<[unknown, unknown]> = [];
  const added: unknown[][] = [];
  const results: unknown[] = [];
  const keys = { subsourceApiKey: "ss-key", subdlApiKey: "dl-key" };
  const element = () => ({});
  const menu = hookHarness("src/components/player/subtitle-menu.tsx", "SubtitleMenu", {
    "lucide-react": { Subtitles: "Subtitles" },
    "@tauri-apps/api/event": {
      listen: async (name: string, fn: (e: { payload: unknown }) => void) => {
        listeners.set(name, fn);
        return () => {};
      },
    },
    "@/lib/modal-overlay": {
      modalOverlayClose: async () => {},
      modalOverlayEmitResult: async (_name: string, value: unknown) => results.push(value),
      modalOverlayEmitState: async () => {},
      modalOverlayOpen: async () => {},
    },
    "@/lib/player/sub-presets": { openStyleBar() {} },
    "@/lib/player/secondary-sub": { setSecondarySub() {} },
    "@/lib/i18n": { useT: () => (s: string) => s },
    "@/lib/settings": {
      useSettingsSelector: (select: (s: unknown) => unknown) =>
        select({
          preferredLanguages: [],
          preferredSubLangs: [],
          showSubtitleIndicator: false,
          ...keys,
        }),
    },
    "@/lib/subtitles/limit-signal": { wasLimitReached: () => false },
    "@/lib/subtitles/pending-subs": { wasPendingSub: () => false },
    "@/lib/subtitles/provider-auth": {
      bindSubtitleDownloadAuth: async (kind: unknown, key: unknown) => {
        binds.push([kind, key]);
        return { kind, credentialId: "main-window" };
      },
    },
    "./subtitle-menu/menu-body": { MenuBody: "MenuBody" },
    "./subtitle-menu/resizable-panel": { ResizableSubtitlePanel: "Panel" },
    "./subtitle-menu/subtitle-context-store": { useSubtitleContext: () => null },
    "./subtitle-menu/utils": { buildOverlayState: () => ({}) },
    "./transport/tooltip": { Tooltip: "Tooltip" },
    "./transport/hotkey-label": { withHotkey: (s: string) => s },
    "@/lib/player/overlay-dismiss": { watchOutsideMouseDown: () => () => {} },
    "react/jsx-runtime": { jsx: element, jsxs: element },
  });
  menu.render({
    useOverlayPopup: true,
    onSelect() {},
    onDelay() {},
    onAddSubtitle: async (...args: unknown[]) => (added.push(args), true),
  });
  await flushPromises();
  for (const [kind, key] of [
    ["subsource-api-key", "ss-key"],
    ["subdl-api-key", "dl-key"],
  ]) {
    listeners.get("modal://subtitle/add")!({
      payload: {
        url: "https://subs.test/a.srt",
        lang: "en",
        title: "A",
        requestId: kind,
        provider: "Fixture",
        downloadAuth: { kind, credentialId: "modal-window" },
      },
    });
    await flushPromises();
    assert.deepEqual(binds.at(-1), [kind, key]);
    assert.deepEqual(added.at(-1), [
      "https://subs.test/a.srt",
      "en",
      "A",
      { provider: "Fixture", downloadAuth: { kind, credentialId: "main-window" } },
    ]);
  }
  assert.deepEqual(results, [
    { requestId: "subsource-api-key", result: "ok" },
    { requestId: "subdl-api-key", result: "ok" },
  ]);
});

const restoreTrack = subtitleTrack("6");
const restoreMemory = {
  ...rememberedFromChoice(restoreTrack),
  streamKey: "torrent:fixture:0",
  updatedAt: 1,
};

test("remembered external subtitles remain authoritative until selection is observed", () => {
  const h = restoreHarness(restoreMemory, [{ ...restoreTrack, selected: false }]);
  h.run();
  h.run();
  assert.deepEqual(h.picks, ["6"], "a rerender inside 750 ms does not select again");
  h.clock.now += 750;
  for (let i = 0; i < 5; i++) {
    h.run();
    h.clock.now += 750;
  }
  assert.deepEqual(
    h.picks,
    ["6", "6", "6", "6"],
    "a track-list race retries the remembered selection at most four times",
  );
  assert.notEqual(h.scope.subRestoreSelectRef.current, null, "still waiting while unselected");
  h.scope.snap.subtitleTracks[0].selected = true;
  h.run();
  assert.equal(h.scope.subRestoreSelectRef.current, null, "done once visibly selected");
  assert.equal(h.scope.autoSubIdRef.current, "6");
});

test("a remembered source not yet listed is added again after the provider wait", async () => {
  const h = restoreHarness(restoreMemory, []);
  h.run();
  assert.deepEqual(h.adds, []);
  assert.deepEqual(h.timers, [12_001], "the fallback is scheduled without a later rerender");
  h.clock.now += 12_001;
  h.run();
  await flushPromises();
  assert.deepEqual(h.adds, [restoreMemory.source]);
});

test("restoration rebinds the saved auth kind to the active profile credential", async () => {
  const cases = [
    ["subsource-api-key", "ss-key"],
    ["subdl-api-key", "dl-key"],
  ] as const;
  for (const [kind, key] of cases) {
    const local = { ...restoreMemory, source: "C:/subs/six.srt", imported: true };
    const h = restoreHarness({ ...local, downloadAuthKind: kind, providerDerived: undefined }, []);
    h.scope.settings = { subsourceApiKey: "ss-key", subdlApiKey: "dl-key" };
    h.run();
    await flushPromises();
    assert.deepEqual(h.authBinds, [[kind, key]]);
    const metadata = h.addMetadata[0] as { downloadAuth: unknown; providerDerived: boolean };
    assert.deepEqual(metadata.downloadAuth, { kind, credentialId: `bound:${key}` });
    assert.equal(metadata.providerDerived, false, "a saved local file restores as trusted");
  }
});

test("credential changes rerun remembered subtitle restoration", () => {
  const h = restoreHarness(restoreMemory, []);
  h.scope.settings = { subsourceApiKey: "old", subdlApiKey: "old" };
  const before = h.dependencies();
  h.scope.settings = { subsourceApiKey: "new", subdlApiKey: "old" };
  const sourceKey = h.dependencies();
  h.scope.settings = { subsourceApiKey: "new", subdlApiKey: "new" };
  const dlKey = h.dependencies();
  h.scope.subRestoreTick = 1;
  const tick = h.dependencies();
  const changed = (a: unknown[], b: unknown[]) => a.some((v, i) => !Object.is(v, b[i]));
  assert.ok(changed(before, sourceKey));
  assert.ok(changed(sourceKey, dlKey));
  assert.ok(changed(dlKey, tick));
});

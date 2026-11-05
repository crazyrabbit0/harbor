// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as parser from "../src/lib/subtitles/parser.ts";
import * as textSync from "../src/lib/subtitles/text-sync.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import { textSyncHarness } from "./helpers/text-sync-harness.ts";

const { findActiveCue } = parser;
const { applyLinear } = textSync;

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];
const text = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text((n as N).props?.children)
        : "";
const t = (s: string) => s;
const button = (nodes: N[], label: string) =>
  nodes.find((n) => n.type === "button" && text(n).includes(label));

test("live sync moves the selected cue to the moment it was heard", () => {
  const corrected = applyLinear(
    [{ start: 10, end: 12, text: "The line being heard" }],
    [{ t: 10, at: 15 }],
    0,
    [],
  );

  assert.deepEqual(corrected, [{ start: 15, end: 17, text: "The line being heard" }]);
  assert.equal(findActiveCue(corrected, 15.5)?.text, "The line being heard");
});

test("two live-sync points correct gradual subtitle drift", () => {
  const corrected = applyLinear(
    [
      { start: 10, end: 12, text: "Early line" },
      { start: 110, end: 112, text: "Late line" },
    ],
    [
      { t: 10, at: 12 },
      { t: 110, at: 116 },
    ],
    0,
    [],
  );

  assert.equal(corrected[0].start, 12);
  assert.equal(corrected[1].start, 116);
});

test("the subtitle menu enters live sync from the overlay window", async () => {
  const listeners = new Map<string, () => void>();
  const calls: string[] = [];
  const noop = () => {};
  const menu = hookHarness("src/components/player/subtitle-menu.tsx", "SubtitleMenu", {
    "lucide-react": { Subtitles: "SubsIcon" },
    "@tauri-apps/api/event": {
      listen: async (name: string, fn: () => void) => {
        listeners.set(name, fn);
        return noop;
      },
    },
    "@/lib/modal-overlay": {
      modalOverlayClose: async () => calls.push("close-overlay"),
      modalOverlayEmitResult: noop,
      modalOverlayEmitState: noop,
      modalOverlayOpen: noop,
    },
    "@/lib/player/sub-presets": { openStyleBar: noop },
    "@/lib/player/secondary-sub": { setSecondarySub: noop },
    "@/lib/i18n": { useT: () => t },
    "@/lib/settings": {
      useSettingsSelector: (select: (s: unknown) => unknown) =>
        select({ preferredLanguages: [], preferredSubLangs: [] }),
    },
    "@/lib/subtitles/limit-signal": { wasLimitReached: () => false },
    "@/lib/subtitles/pending-subs": { wasPendingSub: () => false },
    "@/lib/subtitles/provider-auth": { bindSubtitleDownloadAuth: async () => undefined },
    "./subtitle-menu/menu-body": { MenuBody: "MenuBody" },
    "./subtitle-menu/resizable-panel": { ResizableSubtitlePanel: "Panel" },
    "./subtitle-menu/subtitle-context-store": { useSubtitleContext: () => null },
    "./subtitle-menu/utils": { buildOverlayState: () => ({}) },
    "./transport/tooltip": { Tooltip: "Tooltip" },
    "./transport/hotkey-label": { withHotkey: (s: string) => s },
    "@/lib/player/overlay-dismiss": { watchOutsideMouseDown: () => noop },
    "react/jsx-runtime": jsx,
  });
  menu.render({ useOverlayPopup: true, tracks: [], onEnterSync: () => calls.push("enter-sync") });
  await flushPromises();
  listeners.get("modal://subtitle/live-sync")!();
  assert.deepEqual(calls, ["close-overlay", "enter-sync"]);
});

function list(props: Record<string, unknown>) {
  const calls: unknown[][] = [];
  const h = hookHarness(
    "src/views/player/text-sync-list.tsx",
    "TextSyncList",
    {
      "lucide-react": { ArrowDown: "ArrowDown", Check: "Check" },
      "@/components/icons/play-filled": { Play: "Play" },
      "@/lib/i18n": { useT: () => t },
      "react/jsx-runtime": jsx,
    },
    { window: { setTimeout: () => 0, clearTimeout() {} } },
  );
  const cues = [0, 1, 2, 3].map((i) => ({ start: i * 10, end: i * 10 + 2, text: `line ${i}` }));
  const base = {
    cues,
    activeIndex: null,
    points: [],
    segments: [],
    rangeStart: null,
    rangeEnd: null,
    sectionMode: false,
    query: "",
    onSyncHere: (i: number) => calls.push(["sync", i]),
    onSeek: (i: number) => calls.push(["seek", i]),
    onRangeStart: (i: number) => calls.push(["start", i]),
    onRangeEnd: (i: number) => calls.push(["end", i]),
  };
  const render = (over: Record<string, unknown> = {}) =>
    all(h.render({ ...base, ...props, ...over }));
  const row = (nodes: N[], i: number) =>
    nodes.filter((n) => n.props["aria-pressed"] !== undefined)[i];
  return { render, row, calls };
}

test("a tapped line offers Align to now, and the anchors read as Aligned and Drift fixed", () => {
  const l = list({
    points: [
      { t: 0, at: 1 },
      { t: 20, at: 22 },
    ],
  });
  const nodes = l.render();
  assert.deepEqual(
    nodes.filter((n) => n.type === "span" && /^(Aligned|Drift fixed)$/.test(text(n))).map(text),
    ["Aligned", "Drift fixed"],
  );
  l.row(nodes, 1).props.onClick();
  button(l.render(), "Align to now")!.props.onClick();
  assert.deepEqual(l.calls, [["sync", 1]]);
  assert.equal(button(l.render(), "Align to now"), undefined, "aligning closes the row");
});

test("section mode picks a first line, a last line, then a line to align", () => {
  const l = list({ sectionMode: true });
  l.row(l.render(), 0).props.onClick();
  l.row(l.render({ rangeStart: 0 }), 2).props.onClick();
  const ranged = l.render({ rangeStart: 0, rangeEnd: 2 });
  l.row(ranged, 1).props.onClick();
  assert.deepEqual(l.calls, [
    ["start", 0],
    ["end", 2],
  ]);
  assert.ok(button(l.render({ rangeStart: 0, rangeEnd: 2 }), "Align to now"));
});

test("live sync keeps the section steps in order", async () => {
  const h = textSyncHarness();
  await h.render().enter("fixture.mkv");
  h.render().setRangeEnd(1);
  assert.equal(h.render().rangeEnd, null, "an end needs a start first");
  h.render().setRangeStart(0);
  h.render().setRangeEnd(1);
  h.at(14);
  h.render().syncFromHere(0);
  const api = h.render();
  assert.deepEqual([api.rangeStart, api.rangeEnd], [null, null], "the fix closes the section");
  assert.deepEqual(
    api.segments,
    [{ startIdx: 0, endIdx: 1, offsetSec: 2 }],
    "heard at 14 against the 2 s offset already applied",
  );
  h.render().setRangeStart(1);
  h.render().setRangeEnd(2);
  h.render().setRangeStart(3);
  assert.deepEqual(
    [h.render().rangeStart, h.render().rangeEnd],
    [3, null],
    "a new start clears the end",
  );
});

test("saving live sync keeps the corrected track selected with its source metadata", async () => {
  const h = textSyncHarness();
  await h.render().enter("fixture.mkv");
  h.at(13);
  h.render().syncFromHere(0);
  assert.deepEqual(await h.render().save(), { ok: true });
  const add = h.adds.at(-1)!;
  assert.equal(add.lang, "ar", "the source track's language");
  assert.match(add.path, /^saved\/harbor-subs\/saved\//, "saved under app data, not temp");
  assert.deepEqual(
    (({ provider, providerDerived, matchConfidence, subId }) => ({
      provider,
      providerDerived,
      matchConfidence,
      subId,
    }))(add.metadata as Record<string, unknown>),
    {
      provider: "Harbor Live Sync",
      providerDerived: false,
      matchConfidence: "exact",
      subId: "synced:fixture",
    },
  );
  assert.equal(h.delay(), 0, "the preview delay is baked in and cleared");
  assert.deepEqual(h.prefs.at(-1), ["fixture", { subDelaySec: 0 }]);
  const saved = h.saved.at(-1) as Record<string, unknown>;
  assert.deepEqual(
    [saved.url, saved.imported, saved.provider],
    [add.path, true, "Harbor Live Sync"],
  );

  const unnamed = textSyncHarness({ subId: null });
  await unnamed.render().enter("fixture.mkv");
  unnamed.at(13);
  unnamed.render().syncFromHere(0);
  await unnamed.render().save();
  const name = unnamed.adds.at(-1)!.path.split("/").pop()!;
  assert.equal(
    (unnamed.adds.at(-1)!.metadata as { subId: string }).subId,
    `synced:${name}`,
    "a track without its own id is named after the saved file",
  );
});

test("a failed save restores the preview delay and reports it", async () => {
  const h = textSyncHarness({ addResult: false });
  await h.render().enter("fixture.mkv");
  h.at(13);
  h.render().syncFromHere(0);
  h.render();
  assert.deepEqual(await h.render().save(), { ok: false, reason: "subtitle-load-failed" });
  assert.equal(h.delay(), 3, "the 3 s preview delay is restored");
  assert.deepEqual(h.saved, []);

  const errors: unknown[] = [];
  const overlay = hookHarness(
    "src/views/player/text-sync-overlay.tsx",
    "TextSyncOverlay",
    {
      "lucide-react": { Check: "Check", Loader2: "Loader2", RotateCcw: "R", Scissors: "S", X: "X" },
      "@/components/icons/search-icon": { Search: "Search" },
      "@/lib/subtitles/parser": parser,
      "@/lib/subtitles/text-sync": textSync,
      "@/lib/player/playback-clock": { usePlaybackPosition: () => 0 },
      "@/lib/i18n": { useT: () => t },
      "./text-sync-list": { TextSyncList: "TextSyncList" },
      "react/jsx-runtime": jsx,
    },
    { window: { addEventListener() {}, removeEventListener() {} } },
  );
  const api = {
    syncMode: "active",
    cues: [{ start: 0, end: 1, text: "line" }],
    points: [],
    segments: [],
    nudge: 0,
    pointCount: 1,
    dirty: true,
    rangeStart: null,
    rangeEnd: null,
    save: async () => ({ ok: false, reason: "subtitle-load-failed" }),
    clearRange() {},
  };
  button(all(overlay.render({ api, playing: false })), "Save")!.props.onClick();
  await flushPromises();
  const alert = all(overlay.render({ api, playing: false })).find(
    (n) => n.props.role === "alert" && n.type === "p",
  );
  errors.push(text(alert));
  assert.deepEqual(errors, ["Couldn't save the synced subtitle. Try again."]);
});

test("subtitle rows open their details from a keyboard-reachable button", () => {
  const opened: unknown[] = [];
  const row = hookHarness("src/components/player/subtitle-menu/variant-row.tsx", "VariantRow", {
    "lucide-react": { Check: "Check", Info: "Info", Languages: "Languages" },
    "@/components/hover-tooltip": { HoverTooltip: "HoverTooltip" },
    "@/lib/context-menu": {
      useContextMenu: () => ({
        openAt: (at: unknown, target: unknown) => opened.push([at, target]),
      }),
    },
    "@/lib/player/sub-format": { isImageSubTrack: () => false },
    "@/lib/subtitles/release-label": { subtitleReleaseLabel: () => "" },
    "@/lib/subtitles/track-label": {
      subtitleTrackLanguageLabel: () => "English",
      subtitleTrackTitle: () => "English",
    },
    "@/lib/subtitles/save-to-disk": { saveSubtitleToDisk: async () => {} },
    "@/lib/player/imported-subs": { useImportedSubs: () => new Set() },
    "@/lib/i18n": { useT: () => t },
    "@/lib/subtitles/release-match": { parseRelease: () => ({ hdr: [] }) },
    "@/lib/subtitles/classification-labels": { subtitleClassificationLabels: () => [] },
    "./overflow-marquee": { OverflowMarquee: "OverflowMarquee" },
    "react/jsx-runtime": jsx,
  });
  const nodes = all(
    row.render({
      track: { id: "1", lang: "en" },
      rank: 1,
      compatibilityPercent: 80,
      selected: false,
      onPick() {},
    }),
  );
  assert.equal(nodes.filter((n) => n.props.onContextMenu).length, 0, "no right-click only path");
  const details = nodes.find(
    (n) => n.type === "button" && /Match estimate/.test(n.props["aria-label"] ?? ""),
  )!;
  details.props.onClick({
    currentTarget: { getBoundingClientRect: () => ({ right: 40, bottom: 20 }) },
  });
  const [at, target] = opened[0] as [unknown, { kind: string }];
  assert.deepEqual(at, { x: 40, y: 20 });
  assert.equal(target.kind, "subtitle");
});

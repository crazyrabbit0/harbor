// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import { DEFAULT } from "../src/lib/settings/defaults.ts";
import { emptySnapshot } from "../src/lib/player/bridge.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

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

const CATEGORIES = [
  { category: "Profanity", severity: "Mild" },
  { category: "Violence & Gore", severity: "Severe" },
  { category: "Smoking", severity: "None" },
  { category: "Unknown", severity: "Extreme" },
];

function toast(settings: Record<string, unknown> = { contentAdvisoryToast: true }) {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  const ignored: string[] = [];
  let id = 0;
  let position = 0;
  const h = hookHarness(
    "src/components/player/content-advisory-toast.tsx",
    "ContentAdvisoryToast",
    {
      "lucide-react": new Proxy({}, { get: (_t, name) => String(name) }),
      "@/lib/i18n": { useT: () => (s: string) => s },
      "@/lib/player/content-advisory-ignore": { ignoreAdvisory: (t: string) => ignored.push(t) },
      "@/lib/player/playback-clock": {
        usePlaybackPositionGated: (enabled: boolean) => (enabled ? position : 0),
      },
      "@/lib/settings": { useSettings: () => ({ settings }) },
      "react/jsx-runtime": jsx,
    },
    {
      window: {
        setTimeout: (fn: () => void, ms: number) => (timers.set(++id, { fn, ms }), id),
        clearTimeout: (i: number) => timers.delete(i),
      },
      document: { activeElement: null },
    },
  );
  const props = { categories: CATEGORIES, playKey: "play-1", titleId: "tt1" };
  const render = (over: Record<string, unknown> = {}) => {
    let tree = h.render({ ...props, ...over });
    for (let i = 0; i < 4; i++) tree = h.render({ ...props, ...over });
    return tree;
  };
  const fire = (ms: number) => {
    for (const [i, t] of timers) {
      if (t.ms !== ms) continue;
      timers.delete(i);
      t.fn();
    }
  };
  return {
    render,
    fire,
    ignored,
    timers: () => [...timers.values()].map((t) => t.ms),
    play: (sec: number) => {
      position = sec;
    },
  };
}

const card = (tree: unknown) =>
  all(tree).find((n) => n.props.className?.includes("harbor-content-advisory"));

test("content advisory waits for playback, shows ranked severities and fully unmounts after dismissal", () => {
  const t = toast();
  assert.equal(t.render(), null, "nothing before playback starts");
  t.play(1);
  const tree = t.render();
  assert.deepEqual(
    all(tree)
      .filter((n) => n.type === "li")
      .map(text),
    ["Violence & GoreSevere", "ProfanityMild"],
    "None and unknown severities are dropped, the worst comes first",
  );
  const root = card(tree)!;
  assert.match(root.props.className, /start-6 top-20/);
  assert.match(root.props.className, /bg-black\/70/);
  assert.equal(root.props.role, "status");
  assert.equal(root.props["aria-label"], "Content advisory");
  assert.deepEqual(t.timers(), [8000], "it holds for eight seconds");
  t.fire(8000);
  assert.match(
    card(t.render())!.props.className,
    /pointer-events-none/,
    "collapsing ignores the mouse",
  );
  t.fire(160);
  assert.equal(t.render(), null, "then it unmounts");
  t.play(30);
  assert.equal(t.render(), null, "and does not come back for the same play");
  t.render({ categories: [] });
  assert.equal(t.render(), null, "not even when the advisory data reloads");
});

test("hovering pauses the advisory and leaving gives it a short tail", () => {
  const t = toast();
  t.play(1);
  card(t.render())!.props.onMouseEnter();
  t.render();
  assert.deepEqual(t.timers(), [], "paused while hovered");
  card(t.render())!.props.onMouseLeave({ currentTarget: { contains: () => false } });
  t.render();
  assert.deepEqual(t.timers(), [2500]);
});

test("dismiss and ignore close the advisory; ignore remembers the title", () => {
  const t = toast();
  t.play(1);
  const blur = () => {};
  const button = (label: string) =>
    all(t.render()).find(
      (n) => n.type === "button" && (n.props["aria-label"] === label || text(n) === label),
    )!;
  button("Ignore this title").props.onClick({ currentTarget: { blur } });
  assert.deepEqual(t.ignored, ["tt1"]);
  t.render();
  t.fire(160);
  assert.equal(t.render(), null);

  const d = toast();
  d.play(1);
  all(d.render())
    .find((n) => n.props["aria-label"] === "Dismiss")!
    .props.onClick({ currentTarget: { blur } });
  d.render();
  d.fire(160);
  assert.equal(d.render(), null);
});

test("advisories stay opt-in and cannot render while disabled", async () => {
  assert.equal(DEFAULT.contentAdvisoryToast, false);
  const off = toast({ contentAdvisoryToast: false });
  off.play(5);
  assert.equal(off.render(), null);
  const unset = toast({});
  unset.play(5);
  assert.equal(unset.render(), null, "an unset setting counts as off");
  const { loadStoredSettings } = await import("../src/lib/settings/load.ts");
  localStorage.setItem("test.advisory", JSON.stringify({ contentAdvisoryToast: true }));
  assert.equal(loadStoredSettings("test.advisory").contentAdvisoryToast, true);
  localStorage.setItem("test.advisory", JSON.stringify({ contentAdvisoryToast: "yes" }));
  assert.equal(
    loadStoredSettings("test.advisory").contentAdvisoryToast,
    false,
    "only true enables it",
  );
  localStorage.setItem("test.advisory", JSON.stringify({}));
  assert.equal(loadStoredSettings("test.advisory").contentAdvisoryToast, false);
});

test("the preview always shows, without timers or announcements, and monochrome mutes severity colours", () => {
  const t = toast({ contentAdvisoryToast: false, contentAdvisoryTheme: "monochrome" });
  const tree = t.render({ preview: true });
  const root = card(tree)!;
  assert.equal(root.props.role, undefined);
  assert.match(root.props.className, /relative/);
  assert.deepEqual(t.timers(), []);
  const severe = all(tree).find((n) => n.type === "span" && text(n) === "Severe")!;
  assert.match(severe.props.className, /text-white\/85/);
  const coloured = all(toast().render({ preview: true })).find(
    (n) => n.type === "span" && text(n) === "Severe",
  )!;
  assert.match(coloured.props.className, /text-danger/);
});

test("content advisory avoids occupied player corners", async () => {
  const { contentAdvisoryCorner } =
    await import("../src/components/player/content-advisory-toast.tsx");
  assert.equal(contentAdvisoryCorner(false, false), "top-start");
  assert.equal(contentAdvisoryCorner(false, true), "top-start");
  assert.equal(contentAdvisoryCorner(true, false), "top-end");
  assert.equal(contentAdvisoryCorner(true, true), "top-center");
  const t = toast();
  t.play(1);
  assert.match(card(t.render({ position: "top-end" }))!.props.className, /end-6 top-20/);
  assert.match(card(t.render({ position: "top-center" }))!.props.className, /start-1\/2 top-20/);
});

test("the player stage passes the advisory corner and hides it in picture-in-picture", () => {
  const stage = (pipMode: boolean) =>
    all(
      hookHarness("src/views/player/stage-overlays.tsx", "StageOverlays", {
        "@/components/player/anime4k-indicator": { Anime4kIndicator: "Anime4k" },
        "@/components/player/svp-indicator": { SvpIndicator: "Svp" },
        "@/components/player/stats-overlay": { StatsOverlay: "Stats" },
        "@/components/player/subtitle-offset-indicator": { SubtitleOffsetIndicator: "Offset" },
        "@/components/player/sub-style-bar": { SubStyleBar: "SubStyleBar" },
        "@/components/player/picture-bar": { PictureBar: "PictureBar" },
        "@/components/player/sub-sync-bar": { SubSyncBar: "SubSyncBar" },
        "@/components/player/subtitle-overlay": { SubtitleOverlay: "SubtitleOverlay" },
        "@/components/player/volume-indicator": { VolumeIndicator: "Volume" },
        "@/components/player/speed-indicator": { SpeedIndicator: "Speed" },
        "@/components/player/action-indicator": { ActionIndicator: "Action" },
        "@/components/player/content-advisory-toast": { ContentAdvisoryToast: "Toast" },
        "@/lib/i18n": { useT: () => (s: string) => s },
        "@/lib/player/captions-popout-state": { useCaptionsPopoutOpen: () => false },
        "@/components/player/content-advisory-prompt": { ContentAdvisoryPrompt: "Prompt" },
        "react/jsx-runtime": jsx,
      }).render({
        snap: emptySnapshot,
        engine: "mpv",
        pipMode,
        volumeIndicator: {},
        speedIndicator: {},
        actionIndicator: {},
        contentAdvisory: { categories: CATEGORIES, playKey: "k", imdbId: "tt1", mpaRating: "R" },
        contentAdvisoryPosition: "top-end",
      }),
    ).find((n) => n.type === "Toast");
  const shown = stage(false)!;
  assert.deepEqual(
    [shown.props.position, shown.props.titleId, shown.props.mpaRating, shown.props.playKey],
    ["top-end", "tt1", "R", "k"],
  );
  assert.equal(stage(true), undefined);
});

test("the advisory hook fetches IMDb data only while enabled and starts a play key once playing", async () => {
  const lookups: string[] = [];
  let ignored = false;
  const h = hookHarness("src/views/player/hooks/use-content-advisory.ts", "useContentAdvisory", {
    "@/lib/player/content-advisory-ignore": { isAdvisoryIgnored: () => ignored },
    "@/lib/providers/harbor-imdb": {
      harborImdbParental: async (id: string) => (lookups.push(id), CATEGORIES),
      harborImdbMpaRating: () => "PG-13",
    },
  });
  const useHook = h.exports.useContentAdvisory;
  h.exports.useContentAdvisory = (args: [boolean, string | null, string, boolean]) =>
    useHook(...args);
  const run = async (...args: [boolean, string | null, string, boolean]) => {
    h.render(args);
    await flushPromises();
    return h.render(args);
  };

  assert.deepEqual(await run(false, "tt1", "src-a", true), {
    categories: [],
    playKey: "",
    imdbId: "tt1",
    mpaRating: null,
  });
  assert.deepEqual(lookups, [], "disabled advisories never hit IMDb");

  const paused = await run(true, "tt1", "src-a", false);
  assert.deepEqual(lookups, ["tt1"]);
  assert.equal(paused.categories, CATEGORIES);
  assert.equal(paused.mpaRating, "PG-13");
  assert.equal(paused.playKey, "", "no play key until playback runs");

  assert.equal((await run(true, "tt1", "src-a", true)).playKey, "src-a");
  assert.equal(
    (await run(true, "tt1", "src-b", true)).playKey,
    "src-b",
    "a new source starts a new play",
  );

  ignored = true;
  const skipped = await run(true, "tt2", "src-b", true);
  assert.deepEqual(lookups, ["tt1"], "an ignored title is not fetched");
  assert.deepEqual(skipped.categories, []);
});

test("profile background adapts slider units and reloads when the picker opens", async () => {
  const dims: number[] = [];
  const picker = hookHarness(
    "src/views/settings/account/picker-background.tsx",
    "PickerBackground",
    {
      "../theme-panel/background-picker": { BackgroundPicker: "BackgroundPicker" },
      "@/lib/theme-storage": {
        loadPickerBg: async () => ({ image: "img", dim: 40 }),
        savePickerBg: async () => {},
        savePickerBgDim: async (pct: number) => dims.push(pct),
      },
      "react/jsx-runtime": jsx,
    },
  );
  picker.render();
  await flushPromises();
  const bg = picker.render() as N;
  assert.equal(bg.props.dim, 0.4, "a stored percentage becomes a 0-1 slider value");
  bg.props.onDimChange(0.734);
  assert.deepEqual(dims, [73]);
  assert.equal((picker.render() as N).props.dim, 0.73);
});

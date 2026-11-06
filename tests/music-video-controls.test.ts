import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as lyrics from "../src/lib/music/lyrics.ts";
import type { LyricLine } from "../src/lib/music/lyrics.ts";
import { hookHarness } from "./helpers/hook-harness.ts";

const componentPath = (name: string) =>
  fileURLToPath(new URL(`../src/components/music/${name}`, import.meta.url));
const css = readFileSync(componentPath("music-video-surface.css"), "utf8");

type Controls = typeof import("../src/components/music/music-video-controls.tsx");
type N = { type: unknown; key?: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"], key?: unknown) => ({ type, props, key });
const jsxRuntime = { jsx: element, jsxs: element, Fragment: "Fragment" };
const icons = new Proxy({}, { get: (_t, icon) => String(icon) });
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

function load(): Controls {
  return hookHarness(componentPath("music-video-controls.tsx"), "MusicVideoControls", {
    "@/lib/music/lyrics": lyrics,
    "@/lib/i18n": { useT: () => (key: string) => key },
    "@/lib/music/appearance": {
      setMusicAppearance: () => {},
      useMusicAppearance: () => ({ immersive: false }),
    },
    "@/components/icons/music-icons": icons,
    "react/jsx-runtime": jsxRuntime,
    "./music-video-surface.css": {},
  }).exports;
}

function stageCss(): string {
  const stage = hookHarness(
    componentPath("music-video-fullscreen.tsx"),
    "MusicVideoFullscreen",
    {
      "react-dom": { createPortal: (node: unknown) => node },
      "@/components/icons/music-icons": icons,
      "@/components/modal-shell": { useEscape: () => {} },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/back-intercept": { pushBackHandler: () => () => {} },
      "@/lib/music/video-session": {
        musicVideoSurfaces: {
          subscribe: () => () => {},
          getSnapshot: () => ({ status: "loading" }),
        },
      },
      "./music-video-transport": { MusicVideoTransport: "MusicVideoTransport" },
      "@/lib/music/video-fullscreen": {
        exitMusicVideoFullscreen: () => {},
        getMusicVideoFullscreen: () => ({ active: true, stage: null }),
        musicVideoFullscreenSurvives: () => true,
        setMusicVideoFullscreenStage: () => {},
        subscribeMusicVideoFullscreen: () => () => {},
      },
      "react/jsx-runtime": jsxRuntime,
    },
    {
      setTimeout: () => 0,
      clearTimeout: () => {},
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      HTMLElement: class {},
      window: { addEventListener: () => {}, removeEventListener: () => {} },
      document: { body: {}, activeElement: null },
    },
  );
  const style = all(stage.render({ track: null })).find((n) => n.type === "style");
  assert.equal(typeof style?.props.children, "string", "the stage renders its own style element");
  return style!.props.children as string;
}

function controls(props: Record<string, unknown>) {
  const calls: string[] = [];
  const tree = load().MusicVideoControls({
    lyrics: lines,
    lyricsState: "on",
    onToggleLyrics: () => calls.push("lyrics"),
    currentTime: 12,
    fullscreen: false,
    onToggleFullscreen: () => calls.push("fullscreen"),
    ...props,
  } as never);
  const nodes = all(tree);
  const buttons = nodes.filter((n) => n.type === "button");
  return { nodes, buttons, calls, lyricsButton: buttons[0], fullscreenButton: buttons.at(-1)! };
}

function rule(selector: string): string {
  const blocks = css.split("}").filter((row) =>
    row
      .slice(0, row.indexOf("{"))
      .split(",")
      .some((part) => part.trim() === selector),
  );
  assert.ok(blocks.length, `no rule for ${selector}`);
  return blocks.join("}");
}

const lines: LyricLine[] = [
  { at: 10.98, text: "(TouchofTrent be wildin' with it)" },
  { at: 11.81, text: "You want back then? (Let's get it)" },
  { at: 15.2, text: "   " },
  { at: 20, text: "  trailing space  " },
];

test("the overlay resolves the line the master clock is actually on", () => {
  const { musicVideoLyricLine } = load();
  assert.equal(musicVideoLyricLine(lines, 0), null);
  assert.equal(musicVideoLyricLine(lines, 10.9), null);
  assert.deepEqual(musicVideoLyricLine(lines, 10.98), {
    index: 0,
    text: "(TouchofTrent be wildin' with it)",
  });
  assert.deepEqual(musicVideoLyricLine(lines, 14.9), {
    index: 1,
    text: "You want back then? (Let's get it)",
  });
  assert.deepEqual(musicVideoLyricLine(lines, 999), { index: 3, text: "trailing space" });
});

test("a blank line shows nothing rather than an empty scrim, and no lyrics means no overlay", () => {
  const { musicVideoLyricLine } = load();
  assert.equal(musicVideoLyricLine(lines, 16), null);
  assert.equal(musicVideoLyricLine(null, 30), null);
  assert.equal(musicVideoLyricLine([], 30), null);
  assert.equal(musicVideoLyricLine(lines, Number.NaN), null);
});

test("the overlay is keyed per line so the opacity transition restarts, and is hidden unless lyrics are on", () => {
  const subtitle = (props: Record<string, unknown>) =>
    controls(props).nodes.find((n) => n.props.className === "music-video-subtitle");
  const shown = subtitle({ currentTime: 12 })!;
  const span = all(shown).find((n) => n.type === "span")!;
  assert.equal(span.key, 1);
  assert.equal(span.props.children, "You want back then? (Let's get it)");
  assert.equal(all(subtitle({ currentTime: 11 })).find((n) => n.type === "span")!.key, 0);
  for (const lyricsState of ["off", "loading", "unavailable"])
    assert.equal(subtitle({ lyricsState }), undefined, `hidden while ${lyricsState}`);
  assert.equal(subtitle({ currentTime: 16 }), undefined, "a blank line renders no scrim");
});

test("the subtitle never eats a click meant for the picture and never shifts layout", () => {
  const overlay = rule(".music-video-subtitle");
  assert.match(overlay, /pointer-events: none/);
  assert.match(overlay, /position: absolute/);
  assert.match(overlay, /inset-block-end: 0/);
  const text = rule(".music-video-subtitle > span");
  assert.match(text, /overflow-wrap: anywhere/);
  assert.match(text, /max-width: 100%/);
  assert.match(text, /text-shadow:/);
  assert.doesNotMatch(text, /background|box-shadow/);
});

test("both controls are a 44px pointer target and reveal on hover or keyboard focus", () => {
  const button = rule(".music-video-chrome-button");
  assert.match(button, /width: 44px/);
  assert.match(button, /height: 44px/);
  assert.match(button, /opacity: 0/);
  assert.match(
    css,
    /\.music-video-surface:hover \.music-video-chrome-button,\s*\.music-video-chrome-button:focus-visible\s*\{\s*opacity: 1;?\s*\}/,
  );
  assert.match(
    rule(".music-video-chrome-button:focus-visible"),
    /outline: 2px solid var\(--color-accent\)/,
  );
  const c = controls({});
  assert.equal(c.lyricsButton.props.className, "music-video-chrome-button");
  assert.equal(
    c.fullscreenButton.props.className,
    "music-video-chrome-button music-video-fullscreen-toggle",
  );
  c.fullscreenButton.props.onClick();
  assert.deepEqual(c.calls, ["fullscreen"]);
});

test("the lyrics button reports its state and an unavailable track is inert rather than silent", () => {
  const on = controls({});
  assert.equal(on.lyricsButton.props["data-state"], "on");
  assert.equal(on.lyricsButton.props["aria-pressed"], true);
  assert.equal(on.lyricsButton.props["aria-disabled"], undefined);
  on.lyricsButton.props.onClick();
  assert.deepEqual(on.calls, ["lyrics"]);
  assert.equal(controls({ lyricsState: "off" }).lyricsButton.props["aria-pressed"], false);
  const loading = controls({ lyricsState: "loading" });
  assert.equal(
    all(loading.lyricsButton).some((n) => n.type === "Loader2"),
    true,
  );
  const unavailable = controls({ lyricsState: "unavailable" });
  assert.equal(unavailable.lyricsButton.props["data-state"], "unavailable");
  assert.equal(unavailable.lyricsButton.props["aria-disabled"], true);
  assert.equal(unavailable.lyricsButton.props["aria-pressed"], undefined);
  assert.equal(unavailable.lyricsButton.props.onClick, undefined);
  assert.equal(
    all(unavailable.lyricsButton).some((n) => n.type === "CaptionsOff"),
    true,
  );
  assert.equal(
    controls({ expanded: true }).buttons.length,
    3,
    "the immersive toggle joins only when expanded",
  );
  assert.equal(controls({ expanded: true, fullscreen: true }).buttons.length, 2);
  assert.match(
    css,
    /\.music-video-chrome-button\[aria-disabled="true"\] \{[^}]*cursor: not-allowed/,
  );
  assert.match(css, /\.music-video-chrome-button\[data-state="on"\] \{/);
});

test("the control cluster sits above the subtitle and the subtitle clears the control row", () => {
  assert.match(rule(".music-video-controls"), /z-index: 3/);
  assert.match(rule(".music-video-subtitle"), /z-index: 2/);
  const clearance = rule(".music-video-subtitle").match(/padding-block-end: clamp\((\d+)px/);
  assert.ok(
    clearance && Number(clearance[1]) >= 56,
    "subtitle must clear the 44px control row plus its 12px inset",
  );
});

test("the fullscreen stage keeps the subtitle and the lyrics toggle, and only hides the duplicate exit", () => {
  const stage = stageCss();
  assert.match(stage, /\.music-video-fullscreen-toggle\{display:none\}/);
  assert.doesNotMatch(stage, /\.music-video-subtitle[^{]*\{[^}]*display:none/);
  assert.doesNotMatch(stage, /\.music-video-controls[^{]*\{[^}]*display:none/);
  assert.match(stage, /\.music-video-subtitle>span\{font-size:clamp\(/);
  assert.match(stage, /\.music-video-subtitle\{padding-block-end:clamp\(/);
});

test("the cluster un-absolutes the legacy fullscreen toggle so the two buttons read as one set", () => {
  assert.match(rule(".music-video-controls .music-video-fullscreen-toggle"), /position: static/);
});

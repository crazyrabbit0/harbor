// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as karaokeScroll from "../src/lib/music/karaoke-scroll.ts";
import { all, nowPlaying, text } from "./helpers/music-now-playing-harness.ts";

const CSS = readFileSync("src/components/music/music-now-playing.css", "utf8");
const LOCALES = [
  "ar",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "pl",
  "pt",
  "ru",
  "tr",
  "vi",
  "zh",
];

const button = (tree: unknown, label: string) =>
  all(tree).find((n) => n.type === "button" && n.props.title === label)!;
const tab = (tree: unknown, id: string) =>
  all(tree).find((n) => n.props.role === "tab" && n.props.id === `music-now-tab-${id}`)!;
const openLyrics = async (n: ReturnType<typeof nowPlaying>) => {
  tab(await n.settle(), "lyrics").props.onClick();
  return n.settle();
};

test("Karaoke sits in the header options row after the visualizer", async () => {
  const tree = await nowPlaying().settle();
  const row = all(tree).find((n) => n.props.className === "music-now-options")!;
  const titles = all(row)
    .filter((n) => n.type === "button")
    .map((b) => b.props.title);
  assert.ok(titles.indexOf("Karaoke") > titles.indexOf("music.now.visualizer"));
  assert.ok(titles.indexOf("music.now.visualizer") >= 0);
});

test("Karaoke is transient local state that opens and closes the shared karaoke view", async () => {
  const n = nowPlaying();
  let tree = await n.settle();
  const karaokeView = () => all(n.render()).find((node) => node.type === "MusicKaraoke")!;
  assert.equal(button(tree, "Karaoke").props["aria-pressed"], false);
  assert.equal(karaokeView().props.open, false);
  button(tree, "Karaoke").props.onClick();
  tree = n.render();
  assert.equal(button(tree, "Karaoke").props["aria-pressed"], true);
  assert.equal(karaokeView().props.open, true);
  karaokeView().props.onClose();
  assert.equal(karaokeView().props.open, false);
  assert.deepEqual(n.log.appearance, [], "karaoke is never written into appearance preferences");
});

test("a track without lyrics disables Karaoke and the lyrics tab", async () => {
  const tree = await nowPlaying({ lyrics: [] }).settle();
  assert.equal(button(tree, "Karaoke").props.disabled, true);
  assert.equal(tab(tree, "lyrics").props.disabled, true);
});

test("lyrics is a tab in the roving tablist and keyboard hops skip a closed lyrics tab", async () => {
  const n = nowPlaying();
  const tree = await n.settle();
  const ids = all(tree)
    .filter((node) => node.props.role === "tab")
    .map((node) => node.props.id.replace("music-now-tab-", ""));
  assert.deepEqual(ids, ["queue", "about", "lyrics", "signal"]);
  assert.deepEqual(
    ids.map((id) => tab(tree, id).props.tabIndex),
    [0, -1, -1, -1],
    "only the selected tab is in the tab order",
  );
  const empty = nowPlaying({ lyrics: [] });
  const closed = await empty.settle();
  tab(closed, "about").props.onKeyDown({
    key: "ArrowRight",
    currentTarget: {},
    preventDefault() {},
  });
  assert.equal(tab(empty.render(), "signal").props["aria-selected"], true, "Right skips lyrics");
});

test("the lyrics panel reads the live engine and highlights the line being sung", async () => {
  const n = nowPlaying();
  n.player.currentTime = 31;
  const tree = await openLyrics(n);
  const items = all(tree).filter((node) => node.type === "li");
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((li) => li.props["data-active"]),
    [undefined, undefined, "1"],
  );
  assert.equal(
    all(items[1]).some((node) => node.type === "button"),
    false,
    "a rest line is not a button",
  );
});

test("the panel covers loading, empty and ready, and a hung lookup gives up", async () => {
  const hung = nowPlaying({ never: true });
  await openLyrics(hung);
  const empty = () => all(hung.render()).find((node) => node.props.className === "music-now-empty");
  assert.equal(text(empty()!), "Finding lyrics");
  const giveUp = [...hung.timers.values()].find((t) => t.ms === 9000);
  assert.ok(giveUp, "the wait is bounded");
  giveUp!.fn();
  hung.render();
  assert.equal(text(empty()!), "No lyrics for this track");
  for (const lyrics of [null, []]) {
    const n = nowPlaying({ lyrics });
    const tree = await n.settle();
    tab(tree, "lyrics").props.onClick();
    const opened = await n.settle();
    assert.equal(
      text(all(opened).find((node) => node.props.className === "music-now-empty")!),
      "No lyrics for this track",
      `an ${lyrics ? "empty" : "absent"} list shows the empty state`,
    );
  }
});

test("clicking a line seeks the player", async () => {
  const n = nowPlaying();
  const opened = await openLyrics(n);
  all(opened)
    .find((node) => node.type === "button" && node.props.children === "third")!
    .props.onClick();
  assert.deepEqual(n.log.seeks, [30]);
});

test("the active line scrolls its own list, and the list returns to the top before the first line", async () => {
  const n = nowPlaying();
  n.player.currentTime = 31;
  await openLyrics(n);
  const last = n.log.scrolls.at(-1) as { top: number; behavior: string };
  assert.equal(last.behavior, "smooth");
  assert.equal(
    last.top,
    karaokeScroll.karaokeScrollTop({
      lineTop: 80,
      lineHeight: 20,
      viewHeight: 100,
      maxScroll: 300,
      anchor: 0.5,
    }),
  );
  n.player.currentTime = 0;
  n.render();
  assert.deepEqual(n.log.scrolls.at(-1), { top: 0, behavior: "auto" });
  assert.match(CSS, /\n\.music-now-lyrics \{[^}]*overflow-y\s*:\s*auto/);
  assert.match(
    CSS,
    /\n\.music-now-lyrics \{[^}]*position\s*:\s*relative/,
    "offsetTop is measured inside the list",
  );
});

test("lyric lines clear the 44px target floor and stand still under reduced motion", () => {
  const base = CSS.slice(0, CSS.indexOf("@container"));
  const at = base.indexOf("\n.music-now-lyrics button {");
  const rule = base.slice(at, base.indexOf("}", at));
  assert.match(rule, /min-height\s*:\s*(4[4-9]|[5-9]\d)px/);
  const reduced = CSS.slice(CSS.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)/));
  assert.match(reduced, /\.music-now-lyrics button\s*\{\s*transition:\s*none;?\s*\}/);
});

test("Karaoke and the lyric strings exist in every locale, written in each script", async () => {
  const nonLatin = ["ar", "hi", "ja", "ko", "ru", "zh"];
  for (const lang of LOCALES) {
    const source = readFileSync(`src/lib/i18n/locales/${lang}/music.ts`, "utf8");
    const found = /"?Karaoke"?:\s*"([^"]+)"/.exec(source);
    assert.ok(found, `${lang} is missing the Karaoke label`);
    if (nonLatin.includes(lang))
      assert.ok(
        [...found[1]].some((char) => (char.codePointAt(0) ?? 0) > 127),
        `${lang} left Karaoke in Latin`,
      );
    for (const key of ["Lyrics", "Finding lyrics", "No lyrics for this track"])
      assert.ok(new RegExp(`"?${key}"?:`).test(source), `${lang} is missing ${key}`);
  }
});

const compactCss = (value: string) =>
  value
    .replace(/\s*([{}:;,/])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/@media\s+\(/g, "@media(")
    .replace(/;}/g, "}");
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allNodes, byClass, mountWatch, watchTrack } from "./helpers/music-watch-harness.ts";

const css = compactCss(readFileSync("src/components/music/music-watch.css", "utf8"));
const { ASPECT_PAD } = await import("../src/lib/poster-sizing.ts");

const posters = (tree: unknown) => allNodes(tree).filter((n) => n.type === "Poster");

test("Poster's wide ratio is 16:7, which is NOT a video frame", () => {
  assert.equal(
    ASPECT_PAD.wide,
    "43.75%",
    "if this changes, the ratio choice below must be revisited",
  );
  assert.equal(ASPECT_PAD.landscape, "56.25%", "landscape is the 16:9 video ratio");
});

test("the watch next thumbnail holder is a 16:9 box", () => {
  assert.ok(css.includes(".music-watch-next-art{position:relative;aspect-ratio:16/9"));
});

test("the video stage is a 16:9 box", () => {
  assert.ok(css.includes(".music-watch-stage{position:relative;z-index:2;aspect-ratio:16/9"));
});

test("no poster on this page declares a ratio its holder does not have", async () => {
  const w = await mountWatch({
    queue: [watchTrack("a"), watchTrack("b")],
    index: 0,
    similar: [watchTrack("c"), watchTrack("d"), watchTrack("e"), watchTrack("f"), watchTrack("g")],
  });
  const all = posters(w.loaded);
  assert.ok(all.length >= 7, "stage, Up next, four rail rows and one more-videos row");
  assert.deepEqual(
    all.filter((p) => p.props.ratio !== "landscape"),
    [],
    "a 16:7 poster inside a 16:9 holder leaves bands of empty holder showing",
  );
});

test("both posters declare the matching 16:9 ratio", async () => {
  const w = await mountWatch({ queue: [watchTrack("a")], index: 0, similar: [watchTrack("c")] });
  const stage = posters(byClass(w.loaded, "music-watch-stage-poster")[0]);
  assert.deepEqual(
    stage.map((p) => [p.props.ratio, p.props.src]),
    [["landscape", "art-a.jpg"]],
    "the stage backdrop is 16:9",
  );
  const thumbs = byClass(w.loaded, "music-watch-next-art").flatMap(posters);
  assert.deepEqual(
    thumbs.map((p) => [p.props.ratio, p.props.src]),
    [["landscape", "art-c.jpg"]],
    "the watch next thumbnail is 16:9",
  );
});

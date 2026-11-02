// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const { ASPECT_PAD, RATIO_AR, posterTargetWidth } = await import("../src/lib/poster-sizing.ts");

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const poster = read("src/components/poster.tsx");
const row = read("src/components/row.tsx");

test("poster sizing accounts for the height it has to cover, not just width", () => {
  // A portrait card in a box that is wider than 2:3 needs its width; one taller than 2:3 needs height * 2/3.
  assert.equal(posterTargetWidth({ width: 200, height: 300 }, "portrait", 1, 1), 200);
  assert.equal(posterTargetWidth({ width: 100, height: 300 }, "portrait", 1, 1), 200);
  assert.equal(posterTargetWidth({ width: 100, height: 90 }, "landscape", 1, 1), 160);
  assert.equal(posterTargetWidth({ width: 0, height: 300 }, "portrait", 2, 1), 0);
});

test("poster sizing scales by device pixels, capped at 2, and by the quality setting", () => {
  const box = { width: 101, height: 0 };
  assert.equal(posterTargetWidth(box, "square", 1.5, 1), 152);
  assert.equal(posterTargetWidth(box, "square", 4, 1), 202);
  assert.equal(posterTargetWidth(box, "square", 0, 1), 101);
  assert.equal(posterTargetWidth(box, "square", 2, 0.5), 101);
});

test("poster sizing sees css transforms so scaled art is not blurry", () => {
  assert.match(
    poster,
    /posterTargetWidth\(\s*el\.getBoundingClientRect\(\)/,
    "clientWidth ignores transforms like scale()",
  );
  assert.match(poster, /\}, \[inView, qMult, ratio\]\);/, "ratio must be a dependency");
});

test("the declared aspect ratios match the aspect padding", () => {
  for (const ratio of Object.keys(RATIO_AR) as Array<keyof typeof RATIO_AR>) {
    const pad = Number.parseFloat(ASPECT_PAD[ratio]) / 100;
    assert.ok(Math.abs(pad - 1 / RATIO_AR[ratio]) < 1e-9, ratio);
  }
  assert.equal(RATIO_AR.portrait, 2 / 3);
  assert.equal(RATIO_AR.landscape, 16 / 9);
  assert.equal(RATIO_AR.wide, 16 / 7);
});

test("row tracks do not bleed the next card into horizontal padding", () => {
  const track = row.match(/const trackPad = dockEnabled \? "([^"]*)" : "([^"]*)";/);
  assert.ok(track, "trackPad must stay a single declaration so the sliver fix is auditable");
  for (const cls of [track[1], track[2]]) {
    const pad = [...cls.matchAll(/(?:^|\s)p([xy]?)-(\d+)/g)];
    for (const [, axis, n] of pad) {
      assert.match(
        cls,
        new RegExp(`(?:^|\\s)-m${axis}-${n}(?:\\s|$)`),
        `p${axis}-${n} in "${cls}" is not cancelled by -m${axis}-${n}, which shows a sliver of the next card`,
      );
    }
  }
  assert.doesNotMatch(
    row,
    /px-5 pb-8 pt-14 -mx-5/,
    "horizontal padding shows a sliver of the next card",
  );
  assert.doesNotMatch(row, /"p-5 -m-5"/, "horizontal padding shows a sliver of the next card");
});

test("row tracks keep vertical room for the hover lift", () => {
  assert.match(row, /py-5 -my-5/, "vertical padding must survive so hover lift is not clipped");
  assert.match(row, /pt-14/, "dock mode needs headroom above the cards");
  assert.match(row, /-mt-14/, "the headroom is pulled back so layout does not shift");
});

test("scroll padding no longer offsets snapping now that the track has no inline padding", () => {
  assert.doesNotMatch(
    row,
    /scroll-ps-5 scroll-pe-5/,
    "20px scroll padding would misalign snap targets",
  );
});

test("row measurement never recomputes from a stale effMin after a style switch", () => {
  assert.match(
    row,
    /const measureRef = useRef\(measure\)/,
    "measure must be held in a ref so the ResizeObserver sees the latest effMin",
  );
  assert.match(
    row,
    /measureRef\.current\(\)/,
    "the ResizeObserver must call the ref, not a captured measure closure",
  );
});

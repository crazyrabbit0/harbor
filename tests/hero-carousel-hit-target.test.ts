// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { FakeElement, heroCarouselHarness, slidesOf } from "./helpers/hero-carousel-harness.ts";

const dragThrough = (target: FakeElement) => {
  const c = heroCarouselHarness();
  const props = { slides: slidesOf(3) };
  const { onPointerDown, onPointerMove } = c.viewport(c.render(props)).props;
  onPointerDown({ button: 0, target, clientX: 400, pointerId: 1 });
  onPointerMove({ clientX: 300, pointerId: 1 });
  return c.track(c.render(props))!.props.style.transform as string;
};

test("hero controls do not start carousel dragging", () => {
  for (const target of [
    new FakeElement("button"),
    new FakeElement("a"),
    new FakeElement("input"),
    new FakeElement("div", "button"),
  ]) {
    assert.doesNotMatch(dragThrough(target), /-100px/, `${target.tag}/${target.role} drags`);
  }
});

test("a drag that starts on the slide backdrop moves the track", () => {
  assert.match(dragThrough(new FakeElement("div")), /-100px/);
});

test("carousel arrows keep accessible targets without overlapping hero actions", () => {
  const c = heroCarouselHarness();
  const tree = c.render({ slides: slidesOf(3) });
  const arrow = (label: string) => c.buttons(tree).find((b) => b.props["aria-label"] === label)!;
  for (const [label, edge] of [
    ["Previous", "start-0"],
    ["Next", "end-0"],
  ] as const) {
    const tokens = arrow(label).props.className.split(/\s+/);
    for (const want of [edge, "h-14", "w-14", "z-30"]) {
      assert.ok(tokens.includes(want), `${label} arrow lacks ${want}`);
    }
    assert.ok(!tokens.includes("w-[14%]"), `${label} arrow spans a wide strip over the hero`);
  }
});

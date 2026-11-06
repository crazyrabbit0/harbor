// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises } from "./helpers/hook-harness.ts";
import { heroCarouselHarness, heroHarness, slidesOf } from "./helpers/hero-carousel-harness.ts";

const TMDB_W500 = "https://image.tmdb.org/t/p/w500/x.jpg";
const TMDB_W1280 = "https://image.tmdb.org/t/p/w1280/x.jpg";

test("a hero slide shows the meta backdrop before async resolution finishes", () => {
  const h = heroHarness();
  assert.equal(h.backdrop(h.render({ id: "tt1", type: "movie", name: "A" })), undefined);
  const tree = h.render({ id: "tt1", type: "movie", name: "A", background: "bd.jpg" });
  assert.equal(h.backdrop(tree), "bd.jpg");
});

test("a resolved meta falls back to its poster when it has no backdrop", async () => {
  const h = heroHarness();
  const meta = { id: "tt2", type: "movie", name: "B", poster: "p.jpg" };
  assert.equal(h.backdrop(h.render(meta)), undefined, "nothing is shown while unresolved");
  await flushPromises();
  assert.equal(h.backdrop(h.render(meta)), "p.jpg");
});

test("only a meta with no artwork at all falls through to no backdrop", async () => {
  const h = heroHarness();
  const meta = { id: "tt3", type: "movie", name: "C" };
  h.render(meta);
  await flushPromises();
  assert.equal(h.backdrop(h.render(meta)), undefined);
});

test("the resolved TMDB image still wins over the poster fallback", async () => {
  const h = heroHarness({ tmdbImages: [TMDB_W500] });
  const meta = { id: "tmdb:1", type: "movie", name: "D", poster: "p.jpg" };
  h.render(meta);
  await flushPromises();
  assert.equal(h.backdrop(h.render(meta)), TMDB_W1280);
});

test("the carousel can never point at a slide that does not exist", () => {
  const c = heroCarouselHarness();
  const wide = c.render({ slides: slidesOf(5) });
  c.buttons(wide)
    .find((b) => b.props["aria-label"] === "Slide 5")!
    .props.onClick();
  const tree = c.render({ slides: slidesOf(3) });

  const shown = c.heroes(tree).filter((n) => n.props.active);
  assert.deepEqual(
    shown.map((n) => n.props.meta.id),
    ["m2"],
    "the last remaining slide is the one on show",
  );
  assert.match(c.track(tree)!.props.style.transform, /calc\(-200% /);
  const dots = c.buttons(tree).filter((b) => /^Slide \d$/.test(b.props["aria-label"]));
  assert.deepEqual(
    dots.map((d) => d.props.className === dots[2].props.className),
    [false, false, true],
    "only the clamped slide's dot is marked",
  );
});

test("clamping keeps the slide on show mounted at any index", () => {
  for (const [active, len] of [
    [0, 5],
    [4, 5],
    [4, 2],
    [2, 1],
  ] as const) {
    const c = heroCarouselHarness();
    const wide = c.render({ slides: slidesOf(Math.max(len, active + 1)) });
    c.buttons(wide)
      .find((b) => b.props["aria-label"] === `Slide ${active + 1}`)!
      .props.onClick();
    const tree = c.render({ slides: slidesOf(len) });
    const shown = c.heroes(tree).filter((n) => n.props.active);
    assert.equal(shown.length, 1, `active ${active} of ${len} must mount the slide on show`);
  }
});

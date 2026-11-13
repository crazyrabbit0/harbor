// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { componentHarness, findElement } from "./helpers/component-harness.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const root = "src/views/settings/theme-panel/custom-themes-section";

function authorButton() {
  const opened: string[] = [];
  const h = componentHarness(`${root}/theme-author-button.tsx`, "ThemeAuthorButton", {
    "@/lib/social/open-profile": { requestOpenProfile: (handle: string) => opened.push(handle) },
    "@/views/profile/user-hover-card": { UserHoverCard: "UserHoverCard" },
  });
  const tree = h.render({ handle: "ada", name: "Ada" });
  const button = findElement(tree, (el) => el.type === "button")!;
  return { tree, button, opened };
}

const event = (key?: string) => {
  let stopped = 0;
  return { key, stopPropagation: () => stopped++, stopped: () => stopped };
};

test("theme author names are native profile buttons with keyboard focus", () => {
  const { tree, button, opened } = authorButton();
  assert.equal(tree.type, "UserHoverCard");
  assert.equal(tree.props.handle, "ada");
  assert.equal(button.props.type, "button");
  assert.equal(button.props["aria-label"], "Open Ada profile");
  assert.equal("tabIndex" in button.props, false);
  const click = event();
  button.props.onClick(click);
  assert.deepEqual(opened, ["ada"]);
  assert.equal(click.stopped(), 1);
});

test("activation keys stay on the author button instead of reaching the card", () => {
  const { button, opened } = authorButton();
  for (const key of ["Enter", " "]) {
    const press = event(key);
    button.props.onKeyDown(press);
    assert.equal(press.stopped(), 1, `${JSON.stringify(key)} must not open the card`);
  }
  const other = event("ArrowDown");
  button.props.onKeyDown(other);
  assert.equal(other.stopped(), 0);
  assert.deepEqual(opened, []);
});

test("all new community author surfaces share the profile button", () => {
  for (const path of [
    `${root}/community-browser.tsx`,
    `${root}/community-detail.tsx`,
    `${root}/community-store/market/market-hero.tsx`,
    `${root}/community-store/theme-detail.tsx`,
  ]) {
    assert.match(read(path), /ThemeAuthorButton/, `${path} must use the shared author button`);
  }
});

test("clickable theme cards use a sibling overlay instead of nesting author buttons", () => {
  for (const path of [`${root}/community-browser.tsx`]) {
    const source = read(path);
    assert.match(source, /aria-label=\{tr\("Open \{name\}", \{ name: (?:t|theme)\.name \}\)\}/);
    assert.match(source, /className="absolute inset-0 z-0/);
  }
});

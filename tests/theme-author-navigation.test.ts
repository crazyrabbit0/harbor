// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { componentHarness, findElement } from "./helpers/component-harness.ts";
import { flushPromises } from "./helpers/hook-harness.ts";
import { all, named, ofType, treeHarness } from "./helpers/tree-render.ts";

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

/** Renders the community browser with one theme listed, its card included. */
async function communityBrowser(theme: Record<string, unknown>) {
  const opened: string[] = [];
  const h = treeHarness(
    `${root}/community-browser.tsx`,
    {
      "../../icons": named,
      "@/components/icons/search-icon": named,
      "@/lib/theme-store": {
        browseThemes: async () => [theme],
        downloadTheme: async () => {},
        rateTheme: async () => theme,
      },
      "@/lib/i18n": {
        useT: () => (key: string, vars?: Record<string, unknown>) =>
          key.replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? "")),
      },
      "./community-detail": {
        CommunityDetail: (props: { theme: { id: string } }) => (opened.push(props.theme.id), null),
      },
      "./theme-author-button": { ThemeAuthorButton: "ThemeAuthorButton" },
      "./theme-upload-flow": { ThemeUploadFlow: "ThemeUploadFlow" },
    },
    { globals: { setTimeout: () => 1, clearTimeout() {}, window: { setTimeout: () => 1 } } },
  );
  const render = () => h.render({ type: h.exports.CommunityPane, props: {} });
  render();
  await flushPromises();
  return { render, opened };
}

const storeTheme = {
  id: "th1",
  name: "Dusk",
  author: "Ada",
  authorHandle: "ada",
  cover: null,
  screenshots: [],
  swatch: ["#000"],
  ratingAvg: 4,
  downloads: 3,
};

test("clickable theme cards use a sibling overlay instead of nesting author buttons", async () => {
  const browser = await communityBrowser(storeTheme);
  const tree = browser.render();
  const overlay = all(tree).find((el) => el.props["aria-label"] === "Open Dusk")!;
  assert.equal(overlay.type, "button");
  assert.match(overlay.props.className, /absolute inset-0 z-0/);
  assert.deepEqual(ofType(overlay, "ThemeAuthorButton"), [], "the author button is not inside it");
  const author = ofType(tree, "ThemeAuthorButton");
  assert.deepEqual(
    author.map((el) => [el.props.handle, el.props.name]),
    [["ada", "Ada"]],
  );
  overlay.props.onClick();
  browser.render();
  assert.deepEqual(browser.opened, ["th1"], "the overlay opens the theme");
});

test("a theme without an author handle shows the name as plain text", async () => {
  const tree = (await communityBrowser({ ...storeTheme, authorHandle: null })).render();
  assert.deepEqual(ofType(tree, "ThemeAuthorButton"), []);
});

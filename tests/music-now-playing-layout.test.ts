// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { all, nowPlaying } from "./helpers/music-now-playing-harness.ts";

const CSS = readFileSync("src/components/music/music-now-playing.css", "utf8");

const BASE = CSS.slice(0, CSS.indexOf("@container"));

function rule(selector: string): string {
  const at = BASE.indexOf(`\n${selector} {`);
  if (at < 0) return "";
  return BASE.slice(at + 1, BASE.indexOf("}", at));
}

function px(declaration: string, body: string): number {
  const found = new RegExp(`${declaration}\\s*:\\s*(-?[\\d.]+)px`).exec(body);
  return found ? Number(found[1]) : NaN;
}

const searchButton = (tree: unknown) =>
  all(tree).find((n) => n.type === "button" && n.props.title === "music.searchPlaceholder")!;
const tab = (tree: unknown, id: string) =>
  all(tree).find((n) => n.props.role === "tab" && n.props.id === `music-now-tab-${id}`)!;

test("the search panel has its own container rule, not the tab panel's", () => {
  const slot = rule(".music-now-search-slot");
  assert.ok(slot, "expected a .music-now-search-slot rule in music-now-playing.css");
  assert.ok(px("padding-top", slot) >= 16, `search slot must clear the tab strip, got ${slot}`);
});

test("that container wraps MusicNowSearch so the spacing actually applies", async () => {
  const n = nowPlaying();
  searchButton(await n.settle()).props.onClick();
  const tree = n.render();
  const slot = all(tree).find((node) => node.props.className === "music-now-search-slot");
  assert.ok(slot, "opening search renders the search slot");
  assert.ok(all(slot.props.children).some((node) => node.type === "MusicNowSearch"));
  assert.equal(
    all(tree).some((node) => node.props.role === "tabpanel"),
    false,
    "search replaces the tab panel",
  );
});

test("the narrow container query keeps the separation", () => {
  const narrow = CSS.slice(CSS.search(/@container\s*\(max-width:\s*780px\)/));
  const slot = narrow.slice(narrow.indexOf(".music-now-search-slot {"));
  assert.ok(
    slot.startsWith(".music-now-search-slot {"),
    "narrow layout must restate the search slot",
  );
  assert.ok(px("padding-top", slot.slice(0, slot.indexOf("}"))) >= 12);
});

test("Up next still derives from the live queue via musicUpcoming", async () => {
  const upcoming = [
    { id: "u1", connectorId: "local" },
    { id: "u2", connectorId: "local" },
  ];
  const n = nowPlaying({ upcoming: () => upcoming });
  n.player.queue = [{ id: "t1" }, ...upcoming];
  n.player.queueIndex = 0;
  const tree = await n.settle();
  const [queue, index] = n.log.upcoming.at(-1)!;
  assert.equal(queue, n.player.queue, "reads the live player queue");
  assert.equal(index, 0);
  const list = all(tree).find((node) => node.props.className === "music-now-next-list")!;
  assert.deepEqual(
    all(list.props.children)
      .filter((node) => node.type === "MusicUpNextRow")
      .map((row) => row.props.track),
    upcoming,
  );
});

test("choosing a tab leaves search, so the tab strip is never inert", async () => {
  const n = nowPlaying();
  searchButton(await n.settle()).props.onClick();
  let tree = n.render();
  assert.equal(tab(tree, "about").props["aria-controls"], undefined, "no panel while searching");
  tab(tree, "about").props.onClick();
  n.render();
  const exit = [...n.timers.values()].find((t) => t.ms === 190);
  assert.ok(exit, "closing search schedules its exit");
  exit!.fn();
  tree = n.render();
  assert.equal(
    all(tree).some((node) => node.props.className === "music-now-search-slot"),
    false,
    "search has ended",
  );
  const panel = all(tree).find((node) => node.props.role === "tabpanel")!;
  assert.equal(panel.props.id, "music-now-panel-about");
  assert.equal(tab(tree, "about").props["aria-controls"], "music-now-panel-about");
});

test("tab strip icon buttons meet the 44px target floor", () => {
  const icon = rule(".music-now-all-queue");
  assert.equal(px("width", icon), 44);
  assert.equal(px("height", icon), 44);
  assert.ok(px("min-height", rule(".music-now-quality")) >= 44);
});

test("only one trailing icon takes the auto margin", () => {
  assert.match(
    CSS,
    /\.music-now-all-queue \+ \.music-now-all-queue\s*\{\s*margin-inline-start:\s*0;?\s*\}/,
  );
});

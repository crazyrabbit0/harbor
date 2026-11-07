// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { settingsNavHarness } from "./helpers/settings-nav-harness.ts";
import { settingsViewHarness } from "./helpers/settings-view-harness.ts";

const TRACKERS = ["trakt", "simkl", "anilist", "mal", "letterboxd"];
const nav = settingsNavHarness();
const trackerOptions = () => nav.options.filter((option) => option.section === "trackers");

test("every tracker search result names the tracker it opens", () => {
  const options = trackerOptions();
  assert.ok(options.length > 50, `expected the full tracker index, saw ${options.length}`);
  const untabbed = options.filter((option) => option.tab == null).map((option) => option.label);
  assert.deepEqual(
    untabbed,
    [],
    "an option with no tab lands on whatever tracker the panel opens by default, which is Trakt",
  );
  const wrong = options
    .filter((option) => !TRACKERS.includes(option.tab as string))
    .map((option) => `${option.label} -> ${option.tab}`);
  assert.deepEqual(wrong, [], "every tab must be a real tracker id");
});

test("the Simkl results open Simkl rather than Trakt", () => {
  const simkl = trackerOptions().filter((option) => /simkl/i.test(option.label));
  assert.ok(simkl.length >= 6, `expected the Simkl block, saw ${simkl.length}`);
  for (const option of simkl)
    assert.equal(option.tab, "simkl", `"${option.label}" must open the Simkl tab`);
});

test("a jump to a tracker id opens the Trackers panel on that tab", async () => {
  for (const id of TRACKERS) {
    const page = await settingsViewHarness({ section: "basics" });
    page.jump(id);
    page.rerender();
    assert.deepEqual(page.panels(), ["TrackersPanel"], `${id} renders the Trackers panel`);
    const picked: string[] = [];
    page.registerTabs({
      section: "trackers",
      tabs: TRACKERS.map((tab) => ({ id: tab, label: tab })),
      value: "trakt",
      onChange: (tab: string) => picked.push(tab),
    });
    page.rerender();
    assert.deepEqual(picked, id === "trakt" ? [] : [id], `${id} selects its own tab`);
  }
  const anchored = await settingsViewHarness({ section: "basics" });
  anchored.jump("simkl", "anchor:Connected");
  anchored.rerender();
  assert.deepEqual(anchored.anchors.at(-1)?.[2], { anchor: "anchor:Connected", tab: "simkl" });
});

test("pressing Enter in settings search keeps the tab the result asked for", () => {
  assert.deepEqual(
    nav.submit("Disconnect from Simkl"),
    [["trackers", undefined, "simkl"]],
    "dropping o.tab sends every tabbed result to the section's default tab",
  );
});

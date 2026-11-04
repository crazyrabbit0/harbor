// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { playerMediaHarness } from "./helpers/player-media-harness.ts";

test("autosync receives the subtitle autoload's preflight state", () => {
  for (const settled of [false, true]) {
    const { calls } = playerMediaHarness({ preflightSettled: settled });
    const [params] = calls.get("useAutoSync") as [{ subtitlePreflightSettled: boolean }];
    assert.equal(params.subtitlePreflightSettled, settled);
  }
});

test("the SDH gate follows the selected track into the subtitle style", () => {
  const [params] = playerMediaHarness().calls.get("useSubStyleApply") as [
    { sdhFilterAllowed: boolean },
  ];
  assert.equal(params.sdhFilterAllowed, false, "a forced track keeps its SDH-looking lines");
});

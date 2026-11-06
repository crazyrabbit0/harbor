// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { loadModule } from "./helpers/hook-harness.ts";

const native = readFileSync(new URL("../src-tauri/src/app_icon.rs", import.meta.url), "utf8");
const displayFit = readFileSync(
  new URL("../src-tauri/src/display_fit.rs", import.meta.url),
  "utf8",
);

function iconModule(os: string, tauri = true, failure?: string) {
  const calls: Array<[string, unknown]> = [];
  const api = loadModule(
    "src/lib/app-icon.ts",
    {
      "@tauri-apps/api/core": {
        isTauri: () => tauri,
        invoke: async (command: string, args: unknown) => {
          calls.push([command, args]);
          if (failure) throw new Error(failure);
        },
      },
      "@/lib/platform": { osClass: () => os },
    },
    {
      atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
      console: { error() {} },
    },
  );
  return { api, calls };
}

test("custom app icons are gated to desktop runtimes", async () => {
  for (const os of ["android", "web"]) {
    const h = iconModule(os);
    assert.equal((await h.api.applyAppIcon("data:image/png;base64,AQID")).ok, false, os);
    assert.deepEqual(h.calls, [], os);
  }
  const outsideTauri = iconModule("windows", false);
  assert.equal((await outsideTauri.api.applyAppIcon("data:image/png;base64,AQID")).ok, false);
  assert.deepEqual(outsideTauri.calls, []);

  const desktop = iconModule("windows");
  assert.deepEqual(await desktop.api.applyAppIcon("data:image/png;base64,AQID"), { ok: true });
  assert.deepEqual(desktop.calls, [["set_app_icon", { imageBytes: [1, 2, 3] }]]);
  assert.deepEqual(await desktop.api.applyAppIcon(""), { ok: true });
  assert.deepEqual(desktop.calls.at(-1), ["set_app_icon", { imageBytes: null }]);
  assert.equal((await desktop.api.applyAppIcon("no-comma")).ok, false);
  assert.equal(desktop.calls.length, 2, "an unreadable image never reaches the native command");
});

test("native icon failures are returned instead of reported as success", async () => {
  const failing = iconModule("windows", true, "failed to decode app icon: bad png");
  assert.deepEqual(await failing.api.applyAppIcon("data:image/png;base64,AQID"), {
    ok: false,
    reason: "failed to decode app icon: bad png",
  });
  assert.match(native, /pub async fn set_app_icon/);
  assert.match(native, /failed to decode app icon/);
  assert.match(native, /failed to set app icon/);
  assert.doesNotMatch(native, /if let Err\(e\) = set_macos_dock_icon/);
});

test("window position is clamped even when no resize is needed", () => {
  assert.match(displayFit, /let resized =/);
  assert.match(displayFit, /clamp_origin\(position\.x/);
  assert.doesNotMatch(displayFit, /if \(want_w - cur_w\)[\s\S]{0,160}?return;/);
});

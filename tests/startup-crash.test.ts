// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { startupCrashToHarborError } from "../src/lib/startup-crash.ts";
import { loadModule } from "./helpers/hook-harness.ts";

function crashModule(tauri: boolean, invoke: (command: string) => Promise<unknown>) {
  const commands: string[] = [];
  const api = loadModule(
    "src/lib/startup-crash.ts",
    {
      "@tauri-apps/api/core": {
        invoke: (command: string) => {
          commands.push(command);
          return invoke(command);
        },
      },
    },
    { window: tauri ? { __TAURI_INTERNALS__: {} } : {} },
  );
  return { api, commands };
}

test("native panic recovery uses the existing opt-in error report experience", () => {
  const error = startupCrashToHarborError({
    kind: "panic",
    version: "1.2.3",
    platform: "macos",
    message: "boom",
    location: "src/main.rs:7:2",
    backtrace: "trace",
  });

  assert.equal(error.code, "NativePanic");
  assert.match(error.detail ?? "", /1\.2\.3/);
  assert.match(error.detail ?? "", /macos/);
  assert.match(error.detail ?? "", /boom/);
  assert.match(error.detail ?? "", /src\/main\.rs:7:2/);
  assert.match(error.detail ?? "", /trace/);
  assert.equal(error.fatal, false);
});

test("startup recovery does not classify marker-only exits as crashes", async () => {
  const marker = crashModule(true, async () => null);
  assert.equal(await marker.api.loadStartupCrashReport(), null);
  assert.deepEqual(marker.commands, ["take_startup_crash_report"]);
  assert.equal(await marker.api.loadStartupCrashReport(), null);
  assert.equal(marker.commands.length, 1, "the native report is taken once per session");

  const failing = crashModule(true, async () => {
    throw new Error("ipc down");
  });
  assert.equal(await failing.api.loadStartupCrashReport(), null);

  const browser = crashModule(false, async () => ({ kind: "panic" }));
  assert.equal(await browser.api.loadStartupCrashReport(), null);
  assert.deepEqual(browser.commands, []);
});

test("a recorded native panic is returned for the error report", async () => {
  const report = {
    kind: "panic",
    version: "1.2.3",
    platform: "macos",
    message: "boom",
    location: null,
    backtrace: null,
  };
  const h = crashModule(true, async () => report);
  assert.deepEqual(await h.api.loadStartupCrashReport(), report);
});

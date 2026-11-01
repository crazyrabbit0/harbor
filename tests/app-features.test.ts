import assert from "node:assert/strict";
import test from "node:test";

type Invoke = (cmd: string) => Promise<unknown>;
const bridge = globalThis as unknown as { window?: { __TAURI_INTERNALS__?: { invoke: Invoke } } };

// Fresh module per case, since the features are read once per window.
async function loadWith(invoke: Invoke | null, tag: string) {
  bridge.window = invoke ? { __TAURI_INTERNALS__: { invoke } } : {};
  const mod = await import(`../src/lib/app-features.ts?case=${tag}`);
  await mod.loadAppFeatures();
  return mod.appFeatures();
}

test("a Tauri build reports the subsystems it was compiled without", async () => {
  const features = await loadWith(
    async (cmd) => (cmd === "app_features" ? { games: false, music: true } : null),
    "games-off",
  );
  assert.deepEqual(features, { games: false, music: true });
});

test("a binary without the command, or a browser, keeps every room", async () => {
  const missing = await loadWith(async () => {
    throw new Error("command app_features not found");
  }, "missing");
  assert.deepEqual(missing, { games: true, music: true });
  assert.deepEqual(await loadWith(null, "browser"), { games: true, music: true });
});

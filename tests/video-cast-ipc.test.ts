import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
type Cast = typeof import("../src/lib/cast.ts");
function fixture(fail = false) {
  const calls: { command: string; args: any }[] = [];
  const source = readFileSync(new URL("../src/lib/cast.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", "window", outputText)(
    (name: string) => {
      if (name === "@/lib/app-features") return { appFeatures: () => ({ cast: true }) };
      assert.equal(name, "@tauri-apps/api/core");
      return {
        invoke: async (command: string, args: any) => {
          calls.push({ command, args });
          if (fail) throw new Error("receiver denied command");
          return null;
        },
      };
    },
    module,
    module.exports,
    { __TAURI_INTERNALS__: {} },
  );
  return { api: module.exports as Cast, calls };
}
test("audio-only video IPC forwards exact source headers, embedded ordinal and paused readiness", async () => {
  const { api, calls } = fixture();
  const result = await api.castLoad({
    host: "192.0.2.2",
    port: 1400,
    kind: "dlna",
    controlUrl: "http://192.0.2.2/avtransport",
    url: "https://example.test/actual.mkv",
    headers: { "Accept-Language": "en-US,en;q=0.9" },
    audioOnly: true,
    audioTrackOrdinal: 2,
    audioStartPaused: true,
    startTimeSec: 54,
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].command, "cast_load");
  assert.deepEqual(Object.keys(calls[0].args), ["args"]);
  const load = calls[0].args.args;
  assert.equal(load.audioOnly, true);
  assert.equal(load.audioTrackOrdinal, 2);
  assert.equal(load.audioStartPaused, true);
  assert.equal(load.url, "https://example.test/actual.mkv");
  assert.deepEqual(load.headers, { "Accept-Language": "en-US,en;q=0.9" });
  assert.equal(load.startTimeSec, 54);
  assert.equal(load.transcode, false);
  assert.equal("volume" in load, false);
  assert.equal("audioStreamIndex" in load, false);
});
test("TV casting retains the normal video payload; failed controls and status reject honestly", async () => {
  const normal = fixture();
  await normal.api.castLoad({
    host: "192.0.2.3",
    port: 8009,
    url: "https://example.test/video.mp4",
  });
  const load = normal.calls[0].args.args;
  assert.equal(load.kind, "chromecast");
  assert.equal(load.audioOnly, false);
  assert.equal(load.audioStartPaused, false);
  assert.equal(load.audioTrackOrdinal, null);
  const { api } = fixture(true);
  for (const command of [
    api.castPlay,
    api.castPause,
    api.castStop,
    api.castStatus,
    () => api.castSeek(50),
  ])
    await assert.rejects(command, /receiver denied/);
});

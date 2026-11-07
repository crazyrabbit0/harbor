import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadModule } from "./helpers/hook-harness.ts";
import { type FakeMedia, loadVideoHost, videoStream } from "./helpers/music-video-harness.ts";

// Compiles only activateMusicVideo (and its ownership check) out of the 1478-line player.
function activation(current: { phase: string; currentTime: number }) {
  const source = readFileSync(new URL("../src/lib/music/player.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("player.ts", source, ts.ScriptTarget.Latest, true);
  const functions = tree.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      ["ownsMusicVideo", "activateMusicVideo"].includes(node.name?.text ?? ""),
  );
  const declarations =
    "let videoTarget=null, videoActivation=0, observedPause=null, playRequest=0;";
  const output = ts.transpileModule(
    declarations + functions.map((node) => node.getText(tree)).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const state = { current: { id: "v1" }, duration: 200, volume: 0.6, ...current };
  const commands: string[] = [];
  const scope = {
    state,
    publish: (patch: object) => Object.assign(state, patch),
    invoke: async (command: string) => {
      commands.push(command);
    },
  };
  const exports: { activateMusicVideo?: (id: string) => Promise<{ position: number }> } = {};
  new Function(...Object.keys(scope), "exports", output)(...Object.values(scope), exports);
  return { activate: exports.activateMusicVideo!, state, commands };
}

const stream = videoStream;
const loadHost = () => loadVideoHost().host;

const times = (nodes: { video: FakeMedia; audio: FakeMedia }) => [
  nodes.audio.currentTime,
  nodes.video.currentTime,
];

test("the handover still reports where the song had reached", async () => {
  const h = activation({ phase: "playing", currentTime: 37.5 });
  const controls = await h.activate("v1");
  assert.equal(controls.position, 37.5);
  assert.deepEqual(h.commands, ["music_engine_pause"]);
});

test("the session applies that position instead of discarding it", async () => {
  const log: unknown[] = [];
  let open!: (track: unknown, signal: AbortSignal) => Promise<void>;
  loadModule("src/lib/music/video-session.ts", {
    "./player": {
      activateMusicVideo: async (id: string) => {
        log.push(["activate", id]);
        return { position: 42, release: async () => {} };
      },
      getMusicState: () => ({ current: null }),
      isMusicVideoActive: () => true,
      subscribeMusic: () => () => {},
      waitForMusicAudioReady: async () => true,
    },
    "./video": {
      musicVideoStream: async () => stream,
      musicVideoStreamKey: (t: { id: string }) => `youtube:${t.id}`,
    },
    "./video-host": {
      primeMusicVideoHostPosition: (key: string, position: number) =>
        log.push(["prime", key, position]),
      releaseMusicVideoHostSource: () => log.push(["release"]),
    },
    "./video-surfaces": {
      createMusicVideoSurfaces: (run: typeof open) => {
        open = run;
        return {};
      },
    },
  });
  await open({ id: "v1", connectorId: "youtube" }, new AbortController().signal);
  assert.deepEqual(log, [
    ["activate", "v1"],
    ["prime", "youtube:v1", 42],
  ]);
});

test("a position that arrives before the source is held until the source lands", () => {
  const host = loadHost();
  host.primeMusicVideoHostPosition("youtube:a", 30);
  const nodes = host.musicVideoHost();
  assert.deepEqual(times(nodes), [0, 0]);
  host.setMusicVideoHostSource("youtube:other", stream);
  assert.deepEqual(times(nodes), [0, 0], "another track's source took the held position");
  host.setMusicVideoHostSource("youtube:a", stream);
  assert.deepEqual(times(nodes), [30, 30]);
});

test("seeking waits for metadata rather than writing currentTime into nothing", () => {
  const host = loadHost();
  const nodes = host.musicVideoHost();
  nodes.audio.readyState = 0;
  nodes.video.readyState = 0;
  host.primeMusicVideoHostPosition("youtube:a", 30);
  host.setMusicVideoHostSource("youtube:a", stream);
  assert.deepEqual(times(nodes), [0, 0]);
  nodes.audio.readyState = 1;
  nodes.audio.dispatch("loadedmetadata");
  assert.deepEqual(times(nodes), [30, 30]);
});

test("a zero or absent position never forces a seek", () => {
  const host = loadHost();
  const nodes = host.setMusicVideoHostSource("youtube:a", stream);
  nodes.audio.currentTime = nodes.video.currentTime = 50;
  for (const position of [0, 0.4, Number.NaN]) {
    host.primeMusicVideoHostPosition("youtube:a", position);
    assert.deepEqual(times(nodes), [50, 50], `position ${position} forced a seek`);
  }
  const fresh = loadHost();
  fresh.primeMusicVideoHostPosition("youtube:a", 30);
  fresh.primeMusicVideoHostPosition("youtube:a", 0);
  assert.deepEqual(times(fresh.setMusicVideoHostSource("youtube:a", stream)), [0, 0]);
});

test("the seek is clamped inside the track so it cannot land past the end", () => {
  const host = loadHost();
  const nodes = host.setMusicVideoHostSource("youtube:a", stream);
  host.primeMusicVideoHostPosition("youtube:a", 500);
  assert.deepEqual(times(nodes), [199.5, 199.5]);
});

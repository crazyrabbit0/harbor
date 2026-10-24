// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { captureDirLabel } from "../src/lib/player/capture-path.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("capture toasts name the folder that was used", () => {
  assert.equal(captureDirLabel(null), "downloads");
  assert.equal(captureDirLabel("C:\\Users\\me\\Pictures\\Harbor"), "Pictures/Harbor");
  assert.equal(captureDirLabel("D:\\Clips\\Anime\\", "D:\\Clips\\Anime\\"), "Anime");
  assert.equal(captureDirLabel("/home/me/gifs", "/home/me/gifs"), "gifs");
});

test("each capture reads its own folder setting", () => {
  const player = read("src/views/player.tsx");
  assert.match(player, /folder: settings\.screenshotDir/);
  assert.match(player, /useGifRecorder\(\{ src, folder: settings\.gifDir \}\)/);
  assert.match(player, /folder: settings\.clipDir/);
  for (const hook of ["use-frame-grab", "use-gif-recorder", "use-clip-recorder"]) {
    assert.match(read(`src/views/player/hooks/${hook}.ts`), /captureDir\(folder\)/);
  }
});

test("saving a clip shows one busy toast, not a second centred pill", () => {
  assert.match(
    read("src/views/player/hooks/use-clip-recorder.ts"),
    /kind: "busy", text: t\("Saving clip…"\)/,
  );
  const chooser = read("src/components/player/clip-chooser.tsx");
  assert.match(chooser, /if \(saving \|\| !open\) return null;/);
  assert.doesNotMatch(chooser, /Saving clip/);
  assert.match(
    read("src/components/player/quick-tools.tsx"),
    /toast\.kind === "busy"[\s\S]*animate-spin/,
  );
});

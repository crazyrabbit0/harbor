// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { captureDirLabel } from "../src/lib/player/capture-path.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("capture toasts name the folder that was used", () => {
  assert.equal(captureDirLabel(null), "downloads");
  assert.equal(captureDirLabel("C:\\Users\\me\\Pictures\\Harbor"), "Pictures/Harbor");
  assert.equal(captureDirLabel("D:\\Clips\\Anime\\", "D:\\Clips\\Anime\\"), "Anime");
  assert.equal(captureDirLabel("/home/me/gifs", "/home/me/gifs"), "gifs");
});

function capture(file: string, exportName: string) {
  const dirs: Array<string | undefined> = [];
  const invokes: Array<[string, Record<string, unknown> | undefined]> = [];
  const h = hookHarness(
    `src/views/player/hooks/${file}.ts`,
    exportName,
    {
      "@tauri-apps/api/core": {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          invokes.push([cmd, args]);
          return { path: String(args?.outPath ?? "") };
        },
      },
      "@/lib/i18n": {
        t: (s: string, vars?: Record<string, string>) =>
          s.replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? ""),
      },
      "@/lib/player/capture-path": {
        captureBaseTitle: () => "Movie",
        captureDir: async (folder?: string) => (dirs.push(folder), folder ?? null),
        captureDirLabel,
        formatPosition: () => "00-00-10",
        formatStamp: () => "stamp",
        joinPath: async (dir: string, name: string) => `${dir}/${name}`,
        safeName: (s: string) => s,
      },
      "@/lib/player/playback-clock": { getPlaybackPosition: () => 10 },
    },
    {
      window: {
        __TAURI_INTERNALS__: {},
        setTimeout: () => 1,
        clearTimeout() {},
        setInterval: () => 1,
        clearInterval() {},
      },
    },
  );
  return { h, dirs, invokes };
}

test("each capture writes into its own folder setting", async () => {
  const shots: string[] = [];
  const bridge = {
    screenshot: async (path: string) => (shots.push(path), { ok: true, path }),
  };
  const grab = capture("use-frame-grab", "useFrameGrab");
  const src = { meta: { id: "tt1", name: "Movie" } };
  await grab.h.render({ bridgeRef: { current: bridge }, src, folder: "/shots" }).trigger();
  assert.deepEqual(grab.dirs, ["/shots"]);
  assert.match(shots[0], /^\/shots\/Movie - stamp - 00-00-10\.png$/);
  const grabbed = grab.h.render({ bridgeRef: { current: bridge }, src, folder: "/shots" });
  assert.equal(grabbed.toast.text, "Screenshot saved to shots");

  const gif = capture("use-gif-recorder", "useGifRecorder");
  gif.h.render({ src, folder: "/gifs" }).start();
  await flushPromises();
  gif.h.render({ src, folder: "/gifs" }).stop();
  await flushPromises();
  assert.deepEqual(gif.dirs, ["/gifs"]);
  assert.deepEqual(gif.invokes.at(-1), ["mpv_gif_stop", { outPath: "/gifs/Movie - stamp.gif" }]);

  const clip = capture("use-clip-recorder", "useClipRecorder");
  clip.h.render({ src, seconds: 30, folder: "/clips" }).saveClip(true);
  await flushPromises();
  assert.deepEqual(clip.dirs, ["/clips"]);
  assert.deepEqual(clip.invokes, [
    ["mpv_clip_save", { withSubs: true, beforeSec: 30, outPath: "/clips/Movie - stamp.mp4" }],
  ]);
});

test("the player passes each capture its folder setting", () => {
  const player = read("src/views/player.tsx");
  assert.match(player, /folder: settings\.screenshotDir/);
  assert.match(player, /useGifRecorder\(\{ src, folder: settings\.gifDir \}\)/);
  assert.match(player, /folder: settings\.clipDir/);
});

test("saving a clip shows one busy toast, not a second centred pill", async () => {
  const clip = capture("use-clip-recorder", "useClipRecorder");
  const src = { meta: { id: "tt1", name: "Movie" } };
  clip.h.render({ src, seconds: 30 }).saveClip(false);
  const saving = clip.h.render({ src, seconds: 30 });
  assert.equal(saving.saving, true);
  assert.equal(saving.toast.kind, "busy");
  assert.equal(saving.toast.text, "Saving clip…");

  const chooser = hookHarness("src/components/player/clip-chooser.tsx", "ClipChooser", {
    "lucide-react": {},
    "@/lib/i18n": { useT: () => (s: string) => s },
    "@/lib/seek-step": {
      CLIP_LENGTH_OPTIONS: [10, 30],
      nudgeStep: () => 30,
      sanitizeClipLength: (v: number) => v,
    },
    "@/lib/settings": {
      useSettingsSelector: (select: (s: unknown) => unknown) => select({ clipLengthSec: 30 }),
      useSettingsUpdate: () => () => {},
    },
    "@/lib/settings/defaults": { DEFAULT: { clipLengthSec: 30 } },
    "react/jsx-runtime": { jsx: () => ({}), jsxs: () => ({}) },
  });
  const props = { open: true, onPick() {}, onClose() {} };
  assert.equal(chooser.render({ ...props, saving: true }), null);
  assert.notEqual(chooser.render({ ...props, saving: false }), null);
  assert.match(
    read("src/components/player/quick-tools.tsx"),
    /toast\.kind === "busy"[\s\S]*animate-spin/,
  );
});

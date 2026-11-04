import assert from "node:assert/strict";
import test from "node:test";
import * as videoSync from "../src/lib/music/video-sync";
import { musicVideoSyncCorrection, MUSIC_VIDEO_RATE_TRIM } from "../src/lib/music/video-sync";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";

let measured = 0;

class FakeNode {
  parentElement: FakeNode | null = null;
  children: FakeNode[] = [];
  listeners = new Map<string, Set<() => void>>();
  attrs = new Map<string, string>();
  style = { cssText: "" };
  className = "";
  playsInline = false;
  preload = "";
  disablePictureInPicture = false;
  muted = false;
  volume = 1;
  currentTime = 0;
  duration = 200;
  playbackRate = 1;
  seeking = false;
  readyState = 4;
  paused = true;
  readonly tagName: string;
  constructor(tagName = "div") {
    this.tagName = tagName;
  }
  get src(): string {
    return this.attrs.get("src") ?? "";
  }
  set src(value: string) {
    this.attrs.set("src", value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  addEventListener(type: string, fn: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  dispatch(type: string): void {
    for (const fn of Array.from(this.listeners.get(type) ?? [])) fn();
  }
  appendChild(node: FakeNode): FakeNode {
    return this.insertBefore(node, null);
  }
  append(...nodes: FakeNode[]): void {
    for (const node of nodes) this.appendChild(node);
  }
  insertBefore(node: FakeNode, ref: FakeNode | null): FakeNode {
    if (node.parentElement)
      node.parentElement.children = node.parentElement.children.filter((c) => c !== node);
    node.parentElement = this;
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    return node;
  }
  get firstChild(): FakeNode | null {
    return this.children[0] ?? null;
  }
  getBoundingClientRect() {
    measured += 1;
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  load(): void {}
}

const stream = { url: "https://example.test/picture.mp4", audioUrl: "https://example.test/a.m4a" };
const track = { id: "a", connectorId: "youtube", title: "Song", mediaKind: "video" };

type N = { type: unknown; props: Record<string, any> };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

function loadHost() {
  measured = 0;
  const body = new FakeNode("body");
  const created: string[] = [];
  const document = {
    body,
    createElement: (tag: string) => {
      created.push(tag);
      return new FakeNode(tag);
    },
  };
  const reports: any[] = [];
  let controller: any = null;
  let drift: (() => void) | null = null;
  const host = loadModule(
    "src/lib/music/video-host.ts",
    {
      "./video-sync": videoSync,
      "./player": {
        reportMusicVideoPlayback: (report: any) => reports.push(report),
        setMusicVideoController: (next: any) => {
          controller = next;
          return () => {
            if (controller === next) controller = null;
          };
        },
      },
    },
    {
      document,
      setInterval: (fn: () => void) => {
        drift = fn;
        return 1;
      },
      clearInterval: () => {
        drift = null;
      },
    },
  );
  return {
    host,
    body,
    created,
    reports,
    controller: () => controller,
    drift: () => drift?.(),
  };
}

function mountSurface(options: { held?: boolean; fullscreen?: boolean } = {}) {
  const env = loadHost();
  if (options.held) env.host.setMusicVideoHostSource("youtube:a", stream);
  const shell = new FakeNode("div");
  const session: { owner: unknown; status: string; key: string } = {
    owner: null,
    status: "playing",
    key: "k",
  };
  const resolves: unknown[][] = [];
  const playerReads = new Set<string>();
  const windowListeners: string[] = [];
  let frames = 0;
  const element = (type: unknown, props: Record<string, any>) => {
    if (props?.ref && typeof props.ref === "object") props.ref.current = shell;
    return { type, props };
  };
  const timer = () => 0;
  const surface = hookHarness(
    "src/components/music/music-video-surface.tsx",
    "MusicVideoSurface",
    {
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, icon) => String(icon) }),
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/music/player": new Proxy(
        {},
        {
          get: (_t, name) => {
            playerReads.add(String(name));
            if (name === "useMusicPlayer") return () => ({ volume: 1, phase: "playing" });
            return () => {};
          },
        },
      ),
      "@/lib/music/video-session": {
        musicVideoSurfaces: {
          subscribe: () => () => {},
          getSnapshot: () => session,
          register: (owner: unknown) => {
            session.owner = owner;
            return () => {
              session.owner = null;
            };
          },
          retry: () => {},
        },
      },
      "@/lib/music/video": {
        musicVideoStream: (...args: unknown[]) => {
          resolves.push(args);
          return Promise.resolve(stream);
        },
        musicVideoStreamKey: (t: { id: string }) => `youtube:${t.id}`,
      },
      "@/lib/music/video-host": env.host,
      "@/lib/music/video-fullscreen": {
        getMusicVideoFullscreen: () => ({ active: !!options.fullscreen }),
        subscribeMusicVideoFullscreen: () => () => {},
        toggleMusicVideoFullscreen: () => {},
      },
      "@/lib/music/lyrics": { loadTrackLyrics: () => Promise.resolve(null) },
      "./music-video-controls": { MusicVideoControls: "MusicVideoControls" },
      "./music-video-surface.css": {},
    },
    {
      window: {
        setTimeout: timer,
        clearTimeout: () => {},
        addEventListener: (type: string) => windowListeners.push(type),
        removeEventListener: () => {},
      },
      setTimeout: timer,
      clearTimeout: () => {},
      requestAnimationFrame: () => {
        frames += 1;
        return 0;
      },
    },
  );
  const trees: unknown[] = [];
  const render = () => trees.push(surface.render({ track }));
  for (let i = 0; i < 3; i++) render();
  return {
    ...env,
    shell,
    surface,
    resolves,
    playerReads,
    windowListeners,
    trees,
    render,
    frames: () => frames,
  };
}

test("a picture inside the ignore band is left alone at the audio's own rate", () => {
  const steady = musicVideoSyncCorrection({ audioTime: 10, videoTime: 10, baseRate: 1 });
  assert.equal(steady.kind, "hold");
  assert.equal(steady.seekTo, null);
  assert.equal(steady.rate, 1);
  const close = musicVideoSyncCorrection({ audioTime: 10.03, videoTime: 10, baseRate: 1 });
  assert.equal(close.kind, "hold");
  assert.equal(close.rate, 1);
});

test("small drift is trimmed through the picture's rate and never through the audio", () => {
  const behind = musicVideoSyncCorrection({ audioTime: 10.12, videoTime: 10, baseRate: 1 });
  assert.equal(behind.kind, "trim");
  assert.equal(behind.seekTo, null);
  assert.ok(behind.rate > 1, `expected a faster picture, got ${behind.rate}`);
  assert.equal(behind.rate, 1 + MUSIC_VIDEO_RATE_TRIM);
  const ahead = musicVideoSyncCorrection({ audioTime: 10, videoTime: 10.12, baseRate: 1 });
  assert.equal(ahead.kind, "trim");
  assert.ok(ahead.rate < 1, `expected a slower picture, got ${ahead.rate}`);
});

test("the trim follows a non-unit base rate rather than snapping back to 1x", () => {
  const behind = musicVideoSyncCorrection({ audioTime: 20.2, videoTime: 20, baseRate: 1.5 });
  assert.equal(behind.kind, "trim");
  assert.equal(behind.rate, 1.5 * (1 + MUSIC_VIDEO_RATE_TRIM));
  const settled = musicVideoSyncCorrection({ audioTime: 20, videoTime: 20, baseRate: 1.5 });
  assert.equal(settled.rate, 1.5);
});

test("a gap no trim can close hard-seeks the picture to the audio clock", () => {
  const far = musicVideoSyncCorrection({ audioTime: 45, videoTime: 12, baseRate: 1 });
  assert.equal(far.kind, "seek");
  assert.equal(far.seekTo, 45);
  assert.equal(far.rate, 1);
  const behind = musicVideoSyncCorrection({ audioTime: 10, videoTime: 10.4, baseRate: 1 });
  assert.equal(behind.kind, "seek");
  assert.equal(behind.seekTo, 10);
});

test("the single element case has no clock to chase and is never corrected", () => {
  const alone = musicVideoSyncCorrection({ audioTime: null, videoTime: 33, baseRate: 1 });
  assert.equal(alone.kind, "hold");
  assert.equal(alone.seekTo, null);
  assert.equal(alone.rate, 1);
  const broken = musicVideoSyncCorrection({ audioTime: Number.NaN, videoTime: 33, baseRate: 1 });
  assert.equal(broken.kind, "hold");
  assert.equal(broken.seekTo, null);
  const unset = musicVideoSyncCorrection({ audioTime: null, videoTime: 0, baseRate: 0 });
  assert.equal(unset.rate, 1);
});

test("the surface plays through media elements in the document, not a chased native window", () => {
  const { host, body, created } = loadHost();
  const nodes = host.musicVideoHost();
  assert.deepEqual(created.slice(0, 2), ["video", "audio"]);
  assert.equal(nodes.video.tagName, "video");
  assert.equal(nodes.audio.tagName, "audio");
  assert.equal(nodes.video.playsInline, true);
  const park = body.children[0];
  assert.ok(park, "the media elements were never placed in the document");
  assert.deepEqual(park.children, [nodes.video, nodes.audio]);
  // The strict mock list fails the render on any native-window import (mpv, Tauri, react-dom).
  const mounted = mountSurface({ held: true });
  assert.equal(mounted.shell.children[0], mounted.host.musicVideoHost().video);
  assert.equal(measured, 0, "something measured an element to chase a native window");
  assert.deepEqual([...mounted.playerReads], ["useMusicPlayer"]);
});

test("the dock wiring outlives the surface, so an unmounted screen never strands the transport", () => {
  const mounted = mountSurface({ held: true });
  const { video, audio } = mounted.host.musicVideoHost();
  assert.ok(mounted.controller(), "the session never registered a dock controller");
  mounted.surface.unmount();
  assert.ok(mounted.controller(), "unmounting the surface tore the dock controller down");
  assert.notEqual(video.parentElement, mounted.shell, "the unmounted surface kept the picture");
  assert.equal(video.parentElement, mounted.body.children[0]);
  audio.currentTime = 30;
  audio.dispatch("timeupdate");
  assert.deepEqual(mounted.reports.at(-1), { currentTime: 30, duration: 200 });
  audio.dispatch("ended");
  assert.deepEqual(mounted.reports.at(-1), { ended: true });
  assert.deepEqual(
    [...mounted.playerReads],
    ["useMusicPlayer"],
    "the surface reached for the dock controller or playback reporting",
  );
});

test("re-adopting a live session reuses the stream it already holds instead of resolving again", async () => {
  const held = mountSurface({ held: true });
  assert.equal(held.resolves.length, 0, "a held stream was resolved again");
  assert.equal(held.shell.children[0], held.host.musicVideoHost().video);
  assert.equal(held.host.musicVideoHostSource("youtube:a"), stream);
  const fresh = mountSurface();
  assert.deepEqual(fresh.resolves, [[track, false]]);
  await flushPromises();
  assert.equal(fresh.host.musicVideoHostSource("youtube:a"), stream);
});

test("every piece of the geometry chase is gone from the surface", () => {
  for (const fullscreen of [false, true]) {
    const mounted = mountSurface({ held: true, fullscreen });
    assert.equal(measured, 0, "the surface measured its box");
    assert.equal(mounted.frames(), 0, "the surface scheduled an animation frame");
    assert.equal(mounted.windowListeners.includes("scroll"), false, "the surface tracks scroll");
    for (const node of all(mounted.trees))
      assert.equal(node.props?.style?.clipPath, undefined, "the surface clips the picture");
    mounted.surface.unmount();
  }
});

test("a picture that is already seeking or starved is left alone instead of being re-seeked", () => {
  const busy = musicVideoSyncCorrection({
    audioTime: 45,
    videoTime: 12,
    baseRate: 1,
    pictureBusy: true,
  });
  assert.equal(busy.kind, "hold");
  assert.equal(busy.seekTo, null);
  assert.equal(busy.rate, 1);
  const free = musicVideoSyncCorrection({
    audioTime: 45,
    videoTime: 12,
    baseRate: 1,
    pictureBusy: false,
  });
  assert.equal(free.kind, "seek");
  assert.equal(free.seekTo, 45);
  const { host, drift } = loadHost();
  const { video, audio } = host.setMusicVideoHostSource("youtube:a", stream);
  audio.currentTime = 45;
  video.currentTime = 12;
  video.seeking = true;
  drift();
  assert.equal(video.currentTime, 12, "a seeking picture was seeked again");
  video.seeking = false;
  video.readyState = 1;
  drift();
  assert.equal(video.currentTime, 12, "a starved picture was seeked again");
  video.readyState = 4;
  drift();
  assert.equal(video.currentTime, 45);
});

test("the session drives the dock's transport rather than leaving it wired to a dead engine", () => {
  const { host, controller, reports } = loadHost();
  const { video, audio } = host.setMusicVideoHostSource("youtube:a", stream);
  controller().setPaused(false);
  assert.equal(audio.paused, false);
  assert.equal(video.paused, false);
  controller().setPaused(true);
  assert.equal(audio.paused, true);
  assert.equal(video.paused, true);
  controller().seek(12);
  assert.equal(audio.currentTime, 12);
  assert.equal(video.currentTime, 12);
  controller().setVolume(2);
  assert.equal(audio.volume, 1);
  audio.dispatch("ended");
  assert.deepEqual(reports.at(-1), { ended: true });
});

// @ts-expect-error Node test types are outside the browser tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are outside the browser tsconfig.
import test from "node:test";
// @ts-expect-error Node test types are outside the browser tsconfig.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { dedupeMusicTracks, sameMusicTrack } from "../src/lib/music/track-identity.ts";
import * as videoSync from "../src/lib/music/video-sync.ts";
import { hookHarness, loadModule } from "./helpers/hook-harness.ts";
import { musicPlayerDependencies } from "./helpers/music-player-dependencies.ts";

function read(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

const one = {
  id: "v1",
  connectorId: "yt",
  title: "One",
  artist: "A",
  mediaKind: "video",
  durationSeconds: 200,
} as any;
const two = {
  id: "v2",
  connectorId: "yt",
  title: "Two",
  artist: "A",
  mediaKind: "video",
  durationSeconds: 180,
} as any;

function loadPlayer() {
  const calls: Array<{ command: string; args: any }> = [];
  const listened: string[] = [];
  const source = ts.transpileModule(read("lib/music/player.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const shared = musicPlayerDependencies();
  const resolve = (name: string): any => {
    if (Object.hasOwn(shared, name)) return shared[name];
    if (name === "@tauri-apps/api/core")
      return {
        invoke: async (command: string, args: any) => {
          calls.push({ command, args });
          if (command === "music_db_init")
            return { likedIds: [], likedTracks: [], recents: [], queue: [one, two] };
          if (command === "music_source_candidates") return [];
          return undefined;
        },
      };
    if (name === "@tauri-apps/api/event")
      return {
        listen: async (event: string) => {
          listened.push(event);
          return () => {};
        },
      };
    if (name === "react") return { useSyncExternalStore: () => undefined };
    if (name === "./queue-order")
      return { queueTrackKey: (track: any) => `${track.connectorId}:${track.id}` };
    if (name === "./liked")
      return {
        isMusicLiked: (ids: readonly string[], t: any) => !!t && ids.includes(t.id),
        likedIdsFor: (t: any) => (t ? [t.id] : []),
        withoutLiked: (ids: readonly string[], t: any) => ids.filter((id: string) => id !== t.id),
      };
    if (name === "./source-consent")
      return {
        hydrateMusicSourceConsent: async () => {},
        musicSourceAllowed: () => true,
        requestMusicSourceConsent: () => {},
      };
    if (name === "./queue-insert")
      return {
        insertIntoQueue: (q: any[], t: any, at: number) => [...q.slice(0, at), t, ...q.slice(at)],
        markManuallyQueued: () => {},
        queueInsertIndex: (q: any[], i: number) => (i < 0 ? 0 : i + 1),
      };
    if (name === "./preferences")
      return { readMusicPreference: () => null, writeMusicPreference: () => {} };
    if (name === "./audio-settings")
      return {
        clampMusicVolume: (value: number) => value,
        initializeMusicAudioSettings: async () => {},
        subscribeMusicAudioSettings: () => () => {},
      };
    if (name === "./session-checkpoint")
      return {
        newerCheckpoint: () => null,
        readCheckpointFromDb: async () => null,
        usableCheckpointPosition: () => 0,
        writeCheckpointToDb: () => {},
      };
    if (name === "./hidden-recents") return { unhideMusicRecent: () => {} };
    if (name === "./playback-origin")
      return {
        beginMusicQueue: () => {},
        getMusicPlaybackOrigin: () => null,
        restoreMusicPlaybackOrigin: () => {},
      };
    if (name === "@/lib/cast-ownership") return { stopCastOwner: () => {} };
    if (name === "./track-identity") return { dedupeMusicTracks, sameMusicTrack };
    if (name === "./deck-sync")
      return {
        answerDeckRequests: () => () => {},
        broadcastDeckState: () => {},
        isDeckWindow: () => false,
        sendDeckAdopted: () => {},
        sendDeckCommand: () => {},
        serveDeckCommands: () => () => {},
      };
    if (name === "./deck-primary")
      return { createDeckAdoption: () => ({ deck: () => 0, adopt: () => false }) };
    if (name === "./casting")
      return {
        getMusicSpeakerState: () => ({ active: false, device: null, positionSec: 0 }),
        loadMusicOnSpeaker: async () => {},
        pauseMusicSpeaker: async () => {},
        playMusicSpeaker: async () => {},
        refreshMusicSpeakerStatus: async () => {},
        seekMusicSpeaker: async () => {},
        stopMusicSpeaker: async () => {},
        subscribeMusicSpeakerState: () => () => {},
      };
    throw Error(name);
  };
  const module = { exports: {} as any };
  new Function("require", "module", "exports", source)(resolve, module, module.exports);
  return {
    api: module.exports,
    calls,
    listened,
    commands: (): string[] => calls.map((call) => call.command),
  };
}

function spyController() {
  const seen: Array<[string, unknown]> = [];
  return {
    seen,
    controller: {
      setPaused: (paused: boolean) => seen.push(["setPaused", paused]),
      seek: (position: number) => seen.push(["seek", position]),
      setVolume: (volume: number) => seen.push(["setVolume", volume]),
    },
  };
}

const settle = async (rounds = 24) => {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
};

async function activeVideo() {
  const loaded = loadPlayer();
  await loaded.api.initializeMusic();
  await loaded.api.activateMusicVideo(one.id);
  assert.equal(loaded.api.isMusicVideoActive(), true, "the video never took ownership of the dock");
  return loaded;
}

test("taking the picture hands the song over so the engine and the elements never sound at once", async () => {
  const { api, calls } = await activeVideo();
  const handover = calls.filter((call) => call.command === "music_engine_pause");
  assert.equal(handover.length, 1, `expected one engine pause, saw ${handover.length}`);
  assert.deepEqual(handover[0].args, { paused: true });
  assert.equal(api.getMusicState().phase, "resolving");
});

test("the elements report playback, so the phase leaves resolving and the scrubber moves", async () => {
  const { api } = await activeVideo();
  api.reportMusicVideoPlayback({ phase: "playing", currentTime: 3.5, duration: 201 });
  const state = api.getMusicState();
  assert.equal(state.phase, "playing");
  assert.equal(state.currentTime, 3.5);
  assert.equal(state.duration, 201);
  api.reportMusicVideoPlayback({ currentTime: 12 });
  assert.equal(api.getMusicState().currentTime, 12);
});

test("play, pause, seek and volume reach the media elements and never a native player", async () => {
  const { api, commands } = await activeVideo();
  const { seen, controller } = spyController();
  api.setMusicVideoController(controller);
  api.reportMusicVideoPlayback({ phase: "playing", currentTime: 1, duration: 200 });
  api.toggleMusicPlayback();
  assert.deepEqual(
    seen.at(-1),
    ["setPaused", true],
    "the dock pause button did not reach the picture",
  );
  api.reportMusicVideoPlayback({ phase: "paused", currentTime: 1 });
  api.toggleMusicPlayback();
  assert.deepEqual(
    seen.at(-1),
    ["setPaused", false],
    "the dock play button did not reach the picture",
  );
  api.seekMusic(42.5);
  assert.deepEqual(seen.at(-1), ["seek", 42.5]);
  api.setMusicVolume(0.4);
  assert.deepEqual(seen.at(-1), ["setVolume", 0.4]);
  assert.equal(
    commands().some((command) => command.startsWith("mpv")),
    false,
    `mpv was commanded: ${commands().join(",")}`,
  );
});

test("a picture that reached the end advances the queue instead of stopping dead", async () => {
  const { api, calls, commands } = await activeVideo();
  api.reportMusicVideoPlayback({ phase: "playing", currentTime: 199, duration: 200 });
  api.reportMusicVideoPlayback({ ended: true });
  await settle();
  const played = calls.filter((call) => call.command === "music_play_track");
  assert.equal(played.length, 1, `expected the next track to start, saw ${played.length}`);
  assert.equal(played[0].args.track.id, two.id);
  assert.equal(
    commands().some((command) => command.startsWith("mpv")),
    false,
  );
});

test("closing the player during a video never stops the movie player's decoder", async () => {
  const { api, commands } = await activeVideo();
  const { seen, controller } = spyController();
  api.setMusicVideoController(controller);
  await api.closeMusicPlayer();
  assert.deepEqual(seen.at(-1), ["setPaused", true]);
  assert.equal(commands().includes("mpv_stop"), false, "closing the music dock still stops mpv");
  assert.equal(commands().includes("music_engine_stop"), true);
  assert.equal(api.isMusicVideoActive(), false);
});

test("a report from a picture that no longer owns the dock is ignored", async () => {
  const { api } = await activeVideo();
  await api.closeMusicPlayer();
  const before = api.getMusicState();
  api.reportMusicVideoPlayback({ phase: "playing", currentTime: 99 });
  assert.equal(api.getMusicState().phase, before.phase);
  assert.equal(api.getMusicState().currentTime, before.currentTime);
});

test("the music player carries no mpv command and no mpv event listener at all", async () => {
  const { api, commands, listened } = loadPlayer();
  await api.initializeMusic();
  await api.playMusic(one, [one, two]);
  api.toggleMusicPlayback();
  api.seekMusic(10);
  api.setMusicVolume(0.5);
  api.nextMusic();
  await settle();
  await api.activateMusicVideo(two.id);
  await api.closeMusicPlayer();
  assert.ok(listened.includes("music://event"), "the player never subscribed to its own engine");
  const mpvEvents = listened.filter((name) => name.startsWith("mpv"));
  assert.deepEqual(mpvEvents, [], "an mpv event listener drives the music path");
  const mpvCommands = commands().filter((command) => command.startsWith("mpv"));
  assert.deepEqual(mpvCommands, [], "an mpv command drives the music path");
});

class FakeMedia {
  parentElement: FakeMedia | null = null;
  children: FakeMedia[] = [];
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
  measured = 0;
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
  appendChild(node: FakeMedia): FakeMedia {
    return this.insertBefore(node, null);
  }
  append(...nodes: FakeMedia[]): void {
    for (const node of nodes) this.appendChild(node);
  }
  insertBefore(node: FakeMedia, ref: FakeMedia | null): FakeMedia {
    if (node.parentElement)
      node.parentElement.children = node.parentElement.children.filter((c) => c !== node);
    node.parentElement = this;
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    return node;
  }
  get firstChild(): FakeMedia | null {
    return this.children[0] ?? null;
  }
  getBoundingClientRect() {
    this.measured += 1;
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  focus(): void {}
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  load(): void {}
}

type Node = { type: unknown; props: Record<string, any> };
const nodesOf = (tree: unknown): Node[] =>
  Array.isArray(tree)
    ? tree.flatMap(nodesOf)
    : tree && typeof tree === "object"
      ? [tree as Node, ...nodesOf((tree as Node).props?.children)]
      : [];

function jsxRuntime(nodeFor: () => FakeMedia) {
  const element = (type: unknown, props: Record<string, any>) => {
    if (typeof props?.ref === "function") props.ref(nodeFor());
    else if (props?.ref && typeof props.ref === "object") props.ref.current = nodeFor();
    return { type, props };
  };
  return { jsx: element, jsxs: element, Fragment: "Fragment" };
}

const videoStream = {
  url: "https://example.test/picture.mp4",
  audioUrl: "https://example.test/sound.m4a",
};

test("the session host is the production caller of the controller and of the report", async () => {
  const loaded = await activeVideo();
  const { api, calls } = loaded;
  const body = new FakeMedia();
  const document = { body, createElement: () => new FakeMedia() };
  const host = loadModule(
    "src/lib/music/video-host.ts",
    { "./video-sync": videoSync, "./player": api },
    { document, setInterval: () => 1, clearInterval: () => {} },
  );
  const media = host.setMusicVideoHostSource("youtube:v1", videoStream);
  media.audio.currentTime = 4;
  media.audio.dispatch("playing");
  assert.equal(api.getMusicState().phase, "playing", "the picture's start never reached the dock");
  media.audio.currentTime = 30;
  media.audio.dispatch("timeupdate");
  assert.equal(api.getMusicState().currentTime, 30, "the scrubber never heard the picture's clock");
  api.toggleMusicPlayback();
  assert.equal(media.audio.paused, true, "the dock pause never reached the session's elements");
  assert.equal(media.video.paused, true);
  api.seekMusic(55);
  assert.equal(media.audio.currentTime, 55);
  media.audio.dispatch("ended");
  await settle();
  const played = calls.filter((call) => call.command === "music_play_track");
  assert.equal(played.length, 1, "the session's end never advanced the queue");
  assert.equal(played[0].args.track.id, two.id);

  const playerReads = new Set<string>();
  const session: { owner: unknown; status: string; key: string } = {
    owner: null,
    status: "playing",
    key: "k",
  };
  const surface = hookHarness(
    "src/components/music/music-video-surface.tsx",
    "MusicVideoSurface",
    {
      "react/jsx-runtime": jsxRuntime(() => new FakeMedia()),
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, icon) => String(icon) }),
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/music/player": new Proxy(
        {},
        {
          get: (_t, name) => {
            playerReads.add(String(name));
            if (name === "useMusicPlayer") return () => ({ volume: 1, phase: "playing" });
            return () => () => {};
          },
        },
      ),
      "@/lib/music/video-session": {
        musicVideoSurfaces: {
          subscribe: () => () => {},
          getSnapshot: () => session,
          register: (owner: unknown) => {
            session.owner = owner;
            return () => {};
          },
          retry: () => {},
        },
      },
      "@/lib/music/video": {
        musicVideoStream: async () => videoStream,
        musicVideoStreamKey: (t: { id: string }) => `youtube:${t.id}`,
      },
      "@/lib/music/video-host": host,
      "@/lib/music/video-fullscreen": {
        getMusicVideoFullscreen: () => ({ active: false }),
        subscribeMusicVideoFullscreen: () => () => {},
        toggleMusicVideoFullscreen: () => {},
      },
      "@/lib/music/lyrics": { loadTrackLyrics: async () => null },
      "./music-video-controls": { MusicVideoControls: "MusicVideoControls" },
      "./music-video-surface.css": {},
    },
    {
      window: {
        setTimeout: () => 0,
        clearTimeout: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      setTimeout: () => 0,
      clearTimeout: () => {},
    },
  );
  // The surface adopts the held session stream, so its media listeners are live during the events.
  for (let i = 0; i < 3; i++) surface.render({ track: one });
  assert.equal(media.audio.paused, false, "the surface never took the held stream");
  media.audio.dispatch("timeupdate");
  media.audio.dispatch("ended");
  surface.unmount();
  assert.deepEqual(
    [...playerReads],
    ["useMusicPlayer"],
    "a React surface owning the controller or the report dies with the page",
  );
});

test("the fullscreen overlay stopped chasing a rectangle and stopped poking a native window", () => {
  const nodes: FakeMedia[] = [];
  const windowListeners: string[] = [];
  const dispatched: unknown[] = [];
  const stages: unknown[] = [];
  let exits = 0;
  const overlay = hookHarness(
    "src/components/music/music-video-fullscreen.tsx",
    "MusicVideoFullscreen",
    {
      "react/jsx-runtime": jsxRuntime(() => {
        const node = new FakeMedia();
        nodes.push(node);
        return node;
      }),
      "react-dom": { createPortal: (child: unknown) => child },
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, icon) => String(icon) }),
      "@/components/modal-shell": { useEscape: () => {} },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/back-intercept": { pushBackHandler: () => () => {} },
      "@/lib/music/video-session": {
        musicVideoSurfaces: {
          subscribe: () => () => {},
          getSnapshot: () => ({ owner: null, status: "playing", key: "k" }),
        },
      },
      "./music-video-transport": { MusicVideoTransport: "MusicVideoTransport" },
      "@/lib/music/video-fullscreen": {
        exitMusicVideoFullscreen: () => {
          exits += 1;
        },
        getMusicVideoFullscreen: () => ({ active: true }),
        musicVideoFullscreenSurvives: () => true,
        setMusicVideoFullscreenStage: (node: unknown) => stages.push(node),
        subscribeMusicVideoFullscreen: () => () => {},
      },
    },
    {
      window: {
        addEventListener: (type: string) => windowListeners.push(type),
        removeEventListener: () => {},
        dispatchEvent: (event: unknown) => dispatched.push(event),
      },
      document: { activeElement: null, body: new FakeMedia() },
      HTMLElement: FakeMedia,
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      setTimeout: () => 0,
      clearTimeout: () => {},
    },
  );
  const tree = overlay.render({ track: one });
  const stage = nodesOf(tree).find((node) => "data-music-video-fullscreen-stage" in node.props);
  assert.ok(stage, "the overlay rendered no fullscreen stage");
  assert.ok(stages.length > 0 && stages.every(Boolean), "the stage never reached the store");
  stage.props.onDoubleClick();
  assert.equal(exits, 1, "the stage cannot leave fullscreen");
  overlay.unmount();
  const measured = nodes.reduce((sum, node) => sum + node.measured, 0);
  assert.equal(measured, 0, "the overlay measured a rectangle to chase");
  assert.equal(windowListeners.includes("scroll"), false, "the overlay tracks scroll");
  assert.deepEqual(dispatched, [], "the overlay pokes a native window through events");
});

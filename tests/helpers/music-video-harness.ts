import * as videoSync from "../../src/lib/music/video-sync";
import { hookHarness, loadModule } from "./hook-harness.ts";

/** A DOM node that is also enough of a media element for the music video host. */
export class FakeMedia {
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
  loads = 0;
  get src(): string {
    return this.attrs.get("src") ?? "";
  }
  set src(value: string) {
    this.attrs.set("src", value);
    this.loads += 1;
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
  addEventListener(type: string, fn: () => void, options?: { once?: boolean }): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    const wrapped = options?.once
      ? () => {
          this.listeners.get(type)?.delete(wrapped);
          fn();
        }
      : fn;
    this.listeners.get(type)!.add(wrapped);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  dispatch(type: string): void {
    for (const fn of Array.from(this.listeners.get(type) ?? [])) fn();
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
  appendChild(node: FakeMedia): FakeMedia {
    return this.insertBefore(node, null);
  }
  append(...nodes: FakeMedia[]): void {
    for (const node of nodes) this.appendChild(node);
  }
  get firstChild(): FakeMedia | null {
    return this.children[0] ?? null;
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

export const videoStream = {
  url: "https://example.test/picture.mp4",
  audioUrl: "https://example.test/a.m4a",
};

/** The real video-host module over a fake document; `body.children[0]` is the park anchor. */
export function loadVideoHost() {
  const body = new FakeMedia();
  const document = { body, createElement: () => new FakeMedia() };
  const host = loadModule(
    "src/lib/music/video-host.ts",
    {
      "./video-sync": videoSync,
      "./player": { reportMusicVideoPlayback: () => {}, setMusicVideoController: () => () => {} },
    },
    { document, setInterval: () => 1, clearInterval: () => {} },
  );
  return { host, body };
}

type SurfaceOptions = { held?: boolean; fullscreen?: { active: boolean; stage?: FakeMedia } };

/** Renders the real MusicVideoSurface on the real host; `render(props)` re-renders it. */
export function mountVideoSurface(options: SurfaceOptions = {}) {
  const env = loadVideoHost();
  if (options.held) env.host.setMusicVideoHostSource("youtube:a", videoStream);
  const shell = new FakeMedia();
  const session: { owner: unknown; status: string; key: string } = {
    owner: null,
    status: "playing",
    key: "k",
  };
  const fullscreen = options.fullscreen ?? { active: false };
  const element = (type: unknown, props: Record<string, any>) => {
    if (props?.ref && typeof props.ref === "object") props.ref.current = shell;
    return { type, props };
  };
  const surface = hookHarness(
    "src/components/music/music-video-surface.tsx",
    "MusicVideoSurface",
    {
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, icon) => String(icon) }),
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/music/player": { useMusicPlayer: () => ({ volume: 1, phase: "playing" }) },
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
        musicVideoStream: () => Promise.resolve(videoStream),
        musicVideoStreamKey: (t: { id: string }) => `youtube:${t.id}`,
      },
      "@/lib/music/video-host": env.host,
      "@/lib/music/video-fullscreen": {
        getMusicVideoFullscreen: () => fullscreen,
        subscribeMusicVideoFullscreen: () => () => {},
        toggleMusicVideoFullscreen: () => {},
      },
      "@/lib/music/lyrics": { loadTrackLyrics: () => Promise.resolve(null) },
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
  return { ...env, shell, session, fullscreen, surface, render: surface.render };
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  adoptRequestedIdentity,
  replaceQueueTrack,
  selectableSources,
} from "../src/lib/music/queue-source";
import * as queueSource from "../src/lib/music/queue-source";
import type { MusicSourceCandidate, MusicTrack } from "../src/lib/music/types";
import { hookHarness } from "./helpers/hook-harness.ts";

const track = (id: string, connectorId: string, extra: Partial<MusicTrack> = {}) =>
  ({
    id,
    connectorId,
    title: id,
    artist: "A",
    durationSeconds: 1,
    durationLabel: "0:01",
    ...extra,
  }) as MusicTrack;

const candidate = (connectorId: string, id: string, health: string = "online") =>
  ({
    connectorId,
    connectorName: connectorId,
    health,
    track: track(id, connectorId),
  }) as unknown as MusicSourceCandidate;

test("swapping a queued track keeps its place in the queue", () => {
  const queue = [track("a", "spotify"), track("b", "spotify"), track("c", "spotify")];
  const next = replaceQueueTrack(queue, 1, track("b2", "youtube_music"));
  assert.equal(next.length, 3);
  assert.equal(next[1].connectorId, "youtube_music");
  assert.equal(next[0].id, "a");
  assert.equal(next[2].id, "c");
});

test("the swap keeps the collection it came from, so going back still works", () => {
  const original = track("b", "spotify", {
    collectionOrigin: { id: "playlist1", connectorId: "spotify" },
  });
  const next = replaceQueueTrack([original], 0, track("b2", "youtube_music"));
  assert.equal(next[0].collectionOrigin?.id, "playlist1");
  assert.equal(next[0].collectionOrigin?.connectorId, "spotify");
});

test("a track with no collection adopts itself as the origin", () => {
  const next = adoptRequestedIdentity(track("b2", "youtube_music"), track("b", "spotify"));
  assert.equal(next.collectionOrigin?.id, "b");
  assert.equal(next.collectionOrigin?.connectorId, "spotify");
});

test("a swapped source keeps the requested song's credits, not the uploader's", () => {
  const requested = track("b", "spotify", { title: "Violent Kiss", artist: "Eyes Set To Kill" });
  const rip = track("b2", "soundcloud", { title: "violent kiss (full)", artist: "angelicold" });
  const next = adoptRequestedIdentity(rip, requested);
  assert.equal(next.connectorId, "soundcloud");
  assert.equal(next.id, "b2");
  assert.equal(next.title, "Violent Kiss");
  assert.equal(next.artist, "Eyes Set To Kill");
  assert.equal(next.collectionOrigin?.artist, "Eyes Set To Kill");
});

test("swapping to the identical source is a no-op, so the queue identity is stable", () => {
  const queue = [track("a", "spotify")];
  assert.equal(replaceQueueTrack(queue, 0, track("a", "spotify")), queue);
});

test("an out of range index never damages the queue", () => {
  const queue = [track("a", "spotify")];
  assert.equal(replaceQueueTrack(queue, 5, track("z", "youtube_music")), queue);
  assert.equal(replaceQueueTrack(queue, -1, track("z", "youtube_music")), queue);
});

test("offline sources and the track's current source are not offered", () => {
  const current = track("a", "spotify");
  const offered = selectableSources(
    [
      candidate("spotify", "a"),
      candidate("youtube_music", "a2"),
      candidate("plex", "a3", "offline"),
    ],
    current,
  );
  assert.deepEqual(
    offered.map((c) => c.connectorId),
    ["youtube_music"],
  );
});

test("duplicate candidates are offered once", () => {
  const offered = selectableSources(
    [candidate("youtube_music", "x"), candidate("youtube_music", "x")],
    track("a", "spotify"),
  );
  assert.equal(offered.length, 1);
});

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

test("the queue row swaps the source without starting playback", () => {
  const queue = [track("a", "spotify"), track("b", "spotify"), track("c", "spotify")];
  const writes: MusicTrack[][] = [];
  const plays: unknown[] = [];
  const element = (type: unknown, props: N["props"]) => ({ type, props });
  class FakeElement {}
  const h = hookHarness(
    "src/components/music/music-queue.tsx",
    "MusicQueue",
    {
      "@/lib/music/sources": {
        getMusicSourceCandidates: async () => [],
        musicPlaybackSource: (id: string) => id,
      },
      "@/lib/music/queue-source": queueSource,
      "./music-track-labels": { MusicTrackLabels: "MusicTrackLabels" },
      "react-dom": { createPortal: (tree: unknown) => tree },
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, n) => String(n) }),
      "@/components/poster": { Poster: "Poster" },
      "./music-now-playing-mark": { MusicTrackPlaybackMark: "MusicTrackPlaybackMark" },
      "./music-service-logo": { MusicServiceLogo: "MusicServiceLogo" },
      "./music-queue.css": {},
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/music/player": {
        playMusic: async (...args: unknown[]) => plays.push(args),
        setMusicQueue: (next: MusicTrack[]) => writes.push(next),
        toggleMusicPlayback() {},
        useMusicPlayer: () => ({ queue, queueIndex: 0, current: queue[0], phase: "playing" }),
      },
      "@/lib/music/transport": {
        musicPriorityNext: () => null,
        setMusicPriorityNext() {},
        useMusicTransport: () => ({ shuffle: false }),
      },
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    },
    {
      document: { activeElement: null, body: {}, getElementById: () => null },
      window: { addEventListener() {}, removeEventListener() {} },
      HTMLElement: FakeElement,
      requestAnimationFrame: () => 0,
    },
  );
  const tree = h.render({ open: true, onClose() {} });
  const row = all(tree).find((n) => typeof n.type === "function" && n.props.track?.id === "b")!;
  row.props.onSource(candidate("youtube_music", "b2"));
  assert.equal(writes.length, 1, "the row must swap in place");
  assert.deepEqual(
    writes[0].map((item) => `${item.connectorId}:${item.id}`),
    ["spotify:a", "youtube_music:b2", "spotify:c"],
  );
  assert.deepEqual(plays, [], "switching an upcoming source must not start playing it");
});

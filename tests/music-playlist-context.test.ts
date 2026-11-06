import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as playbackOrigin from "../src/lib/music/playback-origin.ts";
import {
  getMusicPlaybackOrigin,
  musicTitleTarget,
  recordMusicPlaylistPlayback,
  setMusicPlaybackOrigin,
  beginMusicQueue,
  registerMusicQueueOrigin,
  getMusicQueueRevision,
} from "../src/lib/music/playback-origin.ts";
import type { MusicTrack } from "../src/lib/music/types";
import { hookHarness } from "./helpers/hook-harness.ts";

test("queue provenance survives source resolution but does not leak to a different queue", () => {
  const track: MusicTrack = {
    id: "spotify-track",
    connectorId: "spotify",
    title: "Song",
    artist: "Artist",
    artwork: "",
    durationSeconds: 100,
    durationLabel: "1:40",
  };
  const resolved: MusicTrack = {
    ...track,
    id: "youtube-track",
    connectorId: "youtube_music",
    collectionOrigin: { id: track.id, connectorId: track.connectorId },
  };
  const origin = {
    kind: "spotify" as const,
    id: "original-list",
    name: "Original",
    collection: "playlist" as const,
    nextOffset: 50,
  };
  registerMusicQueueOrigin([track], origin);
  beginMusicQueue([resolved], []);
  assert.deepEqual(getMusicPlaybackOrigin(), origin);
  const revision = getMusicQueueRevision();
  beginMusicQueue([resolved], [resolved]);
  assert.equal(
    getMusicQueueRevision(),
    revision,
    "advancing within the same queue preserves continuation requests",
  );
  beginMusicQueue([{ ...track, id: "different" }], [resolved]);
  assert.equal(getMusicPlaybackOrigin(), null);
  assert.ok(getMusicQueueRevision() > revision, "a different queue invalidates pending additions");
});

const componentPath = (name: string) =>
  fileURLToPath(new URL(`../src/components/music/${name}`, import.meta.url));
const dock = readFileSync(componentPath("music-dock.tsx"), "utf8");

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

const track = (id: string) =>
  ({
    id,
    title: id,
    artist: "Artist",
    artwork: "",
    durationSeconds: 100,
    durationLabel: "1:40",
  }) as MusicTrack;

function library(expose: string[], exportName: string) {
  const picked: { track: MusicTrack; queue: MusicTrack[]; origin: unknown }[] = [];
  const component = (name: string) => name;
  const harness = hookHarness(
    componentPath("music-library-parts.tsx"),
    exportName,
    {
      "@/lib/music/source-request": {
        useMusicSourceRequest: () => null,
        musicSourceRequestMatches: () => false,
      },
      "./music-skeletons": { MusicTrackRowsSkeleton: component("MusicTrackRowsSkeleton") },
      "./music-track-menu": { useMusicTrackMenuItems: () => [] },
      "@/lib/music/navigation": { requestMusicExplore: () => {} },
      "@/components/hover-tooltip": { HoverTooltip: component("HoverTooltip") },
      "@/lib/music/liked": { likedIdsFor: () => [] },
      "./music-virtual-track-list": { MusicVirtualTrackList: component("MusicVirtualTrackList") },
      "@/components/icons/music-icons": new Proxy({}, { get: (_t, icon) => String(icon) }),
      "@/components/anchored-menu": { AnchoredMenu: component("AnchoredMenu") },
      "@/components/spinner": { Spinner: component("Spinner") },
      "@/lib/section-back": { useSectionBack: () => {} },
      "./music-playlist-cover": { MusicPlaylistCover: component("MusicPlaylistCover") },
      "./music-collection-controls": {
        MusicCollectionControls: component("MusicCollectionControls"),
      },
      "./music-artist-link": { MusicArtistLink: component("MusicArtistLink") },
      "./music-media-badge": { MusicMediaBadge: component("MusicMediaBadge") },
      "./music-track-labels": { MusicTrackLabels: component("MusicTrackLabels") },
      "./music-playlist-picker": { useMusicPlaylistPicker: () => ({ openPlaylistPicker() {} }) },
      "./music-source-picker": {
        useMusicSourcePicker: () => ({
          openSourcePicker: (item: MusicTrack, queue: MusicTrack[]) =>
            picked.push({ track: item, queue, origin: getMusicPlaybackOrigin() }),
        }),
      },
      "@/lib/i18n": { useT: () => (key: string) => key },
      "@/lib/music/now-playing-key": { nowPlayingMatches: () => false },
      "./music-like-burst.css": {},
      "@/lib/music/library": {
        addTracksToMusicPlaylist: async () => {},
        createMusicPlaylist: async () => ({}),
        deleteMusicPlaylist: async () => {},
        renameMusicPlaylist: async () => ({}),
      },
      "@/lib/music/playback-origin": playbackOrigin,
      "@/lib/music/use-now-playing": { useMusicNowPlaying: () => ({ phase: "idle" }) },
      "@/lib/music/player": {
        getMusicState: () => ({ recents: [] }),
        enqueueMusic: () => {},
        toggleMusicLiked: () => {},
      },
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    },
    { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, window: {}, document: {} },
    expose,
  );
  return { harness, picked };
}

const staleOrigin = () => setMusicPlaybackOrigin({ kind: "playlist", id: "stale", name: "Stale" });
const playlist = { id: "pl-9", name: "Road", createdAt: "", updatedAt: "" };

test("a playlist origin sends the dock title back to that playlist", () => {
  assert.deepEqual(musicTitleTarget({ kind: "playlist", id: "pl-42", name: "Late night" }), {
    kind: "playlist",
    playlistId: "pl-42",
  });
});

test("no origin sends the dock title to the album", () => {
  assert.deepEqual(musicTitleTarget(null), { kind: "album" });
});

test("an origin with no usable id falls back to the album rather than opening nothing", () => {
  assert.deepEqual(musicTitleTarget({ kind: "playlist", id: "", name: "Broken" }), {
    kind: "album",
  });
});

test("origin is recorded when playback starts inside a playlist", () => {
  setMusicPlaybackOrigin(null);
  recordMusicPlaylistPlayback({ id: "pl-7", name: "Drive" });
  assert.deepEqual(getMusicPlaybackOrigin(), { kind: "playlist", id: "pl-7", name: "Drive" });
  assert.deepEqual(musicTitleTarget(getMusicPlaybackOrigin()), {
    kind: "playlist",
    playlistId: "pl-7",
  });
});

test("origin is cleared when playback starts from something that is not a playlist", () => {
  setMusicPlaybackOrigin({ kind: "playlist", id: "pl-7", name: "Drive" });
  recordMusicPlaylistPlayback(null);
  assert.equal(getMusicPlaybackOrigin(), null);
  assert.deepEqual(musicTitleTarget(getMusicPlaybackOrigin()), { kind: "album" });
  setMusicPlaybackOrigin({ kind: "playlist", id: "pl-7", name: "Drive" });
  recordMusicPlaylistPlayback(undefined);
  assert.equal(getMusicPlaybackOrigin(), null);
});

// The dock is over 1,000 lines, so its title click is pinned by the exact wiring lines.
test("the dock title decides through the shared helper, not its own inline branch", () => {
  assert.ok(
    dock.includes("const target = musicTitleTarget(getMusicPlaybackOrigin());"),
    "music-dock.tsx must route the title click through musicTitleTarget",
  );
  assert.ok(
    dock.includes("requestMusicPlaylist(target.playlistId, display.id);"),
    "playlist targets must still open the playlist at the track",
  );
});

test("the dock never hands an unresolved artist ref to the explore request", () => {
  const offenders = dock.split("\n").filter((line) => line.includes("primaryArtist"));
  assert.deepEqual(offenders, [], "dock artist navigation must fall through to the artist link");
});

test("a library track list start records its playlist and hands the queue to the source picker", () => {
  const queue = [track("a"), track("b")];
  const { harness, picked } = library([], "LibraryTrackList");
  staleOrigin();
  const rows = all(
    harness.render({
      title: "t",
      subtitle: "s",
      tracks: queue,
      likedIds: [],
      selectedPlaylist: { ...playlist, tracks: queue },
    }),
  ).filter((n) => n.props?.track && n.props?.onPlay);
  assert.equal(rows.length, 2);
  rows[1].props.onPlay(queue[1], queue);
  assert.deepEqual(getMusicPlaybackOrigin(), { kind: "playlist", id: "pl-9", name: "Road" });
  assert.equal(picked.length, 1);
  assert.equal(picked[0].track, queue[1]);
  assert.equal(picked[0].queue, queue);
  assert.deepEqual(picked[0].origin, { kind: "playlist", id: "pl-9", name: "Road" });
});

test("a library list opened on no playlist clears a stale origin before playing", () => {
  const queue = [track("a")];
  const { harness, picked } = library([], "LibraryTrackList");
  staleOrigin();
  const rows = all(
    harness.render({
      title: "t",
      subtitle: "s",
      tracks: queue,
      likedIds: [],
      selectedPlaylist: null,
    }),
  ).filter((n) => n.props?.track && n.props?.onPlay);
  rows[0].props.onPlay(queue[0], queue);
  assert.equal(getMusicPlaybackOrigin(), null);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].origin, null);
});

test("a single library row started without a handler clears a stale origin before playing", () => {
  const queue = [track("a"), track("b")];
  const { harness, picked } = library(["LibraryTrack"], "LibraryTrack");
  staleOrigin();
  const art = all(
    harness.render({
      track: queue[0],
      tracks: queue,
      index: 0,
      count: 2,
      liked: false,
      alreadyAdded: false,
    }),
  ).find((n) => n.type === "button" && n.props.className === "music-library-track-art");
  art!.props.onClick();
  assert.equal(getMusicPlaybackOrigin(), null);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].track, queue[0]);
  assert.equal(picked[0].queue, queue);
  assert.equal(picked[0].origin, null);
});

test("the playlist header play records that playlist before opening the source picker", () => {
  const queue = [track("a"), track("b")];
  const { harness, picked } = library([], "PlaylistHeader");
  staleOrigin();
  const controls = all(
    harness.render({
      playlist: { ...playlist, tracks: queue },
      working: false,
      onRenamed() {},
      onDeleted() {},
      onExport() {},
      onError() {},
    }),
  ).find((n) => n.type === "MusicCollectionControls");
  controls!.props.onPlay(queue[1], queue);
  assert.deepEqual(getMusicPlaybackOrigin(), { kind: "playlist", id: "pl-9", name: "Road" });
  assert.equal(picked.length, 1);
  assert.equal(picked[0].track, queue[1]);
  assert.deepEqual(picked[0].origin, { kind: "playlist", id: "pl-9", name: "Road" });
});

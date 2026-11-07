import assert from "node:assert/strict";
import test from "node:test";
import { hookHarness } from "./helpers/hook-harness.ts";

const tv = { id: "tv", name: "TV", host: "192.0.2.5", port: 7676, kind: "dlna" } as const;
const SOURCE = "https://example.test/movie.mkv";

function pick(resolvedUrl: string, audioTracks: object[], mpvOrdinal: number | null = null) {
  const loads: any[] = [];
  const h = hookHarness("src/views/player/hooks/use-cast-pick.ts", "useCastPick", {
    "@/lib/cast": { guessContentType: () => "video/x-matroska" },
    "@/lib/debrid/registry": {},
    "@/lib/i18n": { t: (key: string) => key },
    "@/lib/player/mpv-properties": { readMpvEmbeddedAudioOrdinal: async () => mpvOrdinal },
    "@/lib/player/playback-clock": { getPlaybackPosition: () => 754 },
    "../cast-resolve": {
      resolveCompatibleCastUrl: async () => ({
        kind: "transcode",
        url: resolvedUrl,
        reasons: ["HEVC unsupported"],
        caps: { label: "TV" },
      }),
    },
    "./use-cast-session": { localizedFfmpegInstallStep: () => "" },
  });
  const params = {
    src: { url: SOURCE, title: "Movie", meta: { id: "tt1", poster: null } },
    debrids: [],
    snapRef: { current: { audioTracks, subtitleTracks: [], videoWidth: 1920, videoHeight: 1080 } },
    bridgeRef: { current: null },
    settings: {},
    burnSubsOnTv: false,
    closeCastMenu() {},
    pickCastDevice: async (_device: unknown, options: unknown) => {
      loads.push(options);
    },
    setCastErrorInfo() {},
  };
  return { loads, run: () => h.render(params).onPickDevice(tv) };
}

const tracks = [
  { id: "1", selected: false, external: false },
  { id: "9", selected: false, external: true },
  { id: "2", selected: false, external: false },
  { id: "3", selected: true, external: false },
];

test("a video cast keeps the audio track the player has selected", async () => {
  const p = pick(SOURCE, tracks);
  await p.run();
  assert.equal(p.loads[0].audioTrackOrdinal, 2, "external tracks do not count toward 0:a:N");
});

test("a swapped stream or an external track leaves the audio choice to the receiver", async () => {
  const swapped = pick("https://example.test/other.mp4", tracks);
  await swapped.run();
  assert.equal(swapped.loads[0].audioTrackOrdinal, undefined);
  const external = pick(
    SOURCE,
    [
      { id: "1", selected: false, external: false },
      { id: "9", selected: true, external: true },
    ],
    0,
  );
  await external.run();
  assert.equal(external.loads[0].audioTrackOrdinal, undefined);
});

test("a snapshot without a selected audio track falls back to the track mpv is playing", async () => {
  const unselected = [
    { id: "1", selected: false, external: false },
    { id: "2", selected: false, external: false },
  ];
  const fallback = pick(SOURCE, unselected, 1);
  await fallback.run();
  assert.equal(fallback.loads[0].audioTrackOrdinal, 1);
  const swapped = pick("https://example.test/other.mp4", unselected, 1);
  await swapped.run();
  assert.equal(swapped.loads[0].audioTrackOrdinal, undefined);
  const unknown = pick(SOURCE, [], null);
  await unknown.run();
  assert.equal(unknown.loads[0].audioTrackOrdinal, undefined);
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  parseMpvChapterList,
  parseMpvTrackList,
  type ExternalSubtitleMetadata,
} from "../src/lib/player/mpv-tracks.ts";

test("track-list splits audio and subtitles and labels codec, channels and flags", () => {
  const { audio, subtitles } = parseMpvTrackList(
    [
      { type: "video", id: 1, selected: true },
      {
        type: "audio",
        id: 1,
        lang: "eng",
        "codec-desc": "eac3",
        "demux-channels": "5.1",
        "demux-channel-count": 6,
        selected: true,
      },
      { type: "sub", id: 2, lang: "spa", forced: true, "hearing-impaired": true },
    ],
    null,
    new Map(),
  );
  assert.equal(audio.length, 1);
  assert.equal(audio[0].label, "eng · EAC3 · 5.1");
  assert.equal(audio[0].channelCount, 6);
  assert.equal(audio[0].selected, true);
  assert.equal(subtitles.length, 1);
  assert.equal(subtitles[0].label, "spa · Forced · SDH");
  assert.equal(subtitles[0].forced, true);
});

test("a selected secondary subtitle is marked secondary, not selected", () => {
  const { subtitles } = parseMpvTrackList(
    [
      { type: "sub", id: 3, selected: true, "main-selection": 0 },
      { type: "sub", id: 4, selected: true, "main-selection": 1 },
      { type: "sub", id: 5, selected: true },
    ],
    "5",
    new Map(),
  );
  assert.deepEqual(
    subtitles.map((track) => [track.id, track.selected, track.secondary]),
    [
      ["3", true, false],
      ["4", false, true],
      ["5", false, true],
    ],
  );
});

test("external subtitle files get Harbor's metadata, whatever the path separator", () => {
  const metadata: ExternalSubtitleMetadata = {
    url: "https://subs.example/a.srt",
    lang: "ell",
    title: "Provider title",
    provider: "opensubtitles",
    prepared: true,
  };
  const { subtitles } = parseMpvTrackList(
    [{ type: "sub", id: 7, external: true, "external-filename": "C:\\tmp\\a.srt", lang: "und" }],
    null,
    new Map([["C:/tmp/a.srt", metadata]]),
  );
  assert.equal(subtitles[0].lang, "ell");
  assert.equal(subtitles[0].title, "Provider title");
  assert.equal(subtitles[0].url, "https://subs.example/a.srt");
  assert.equal(subtitles[0].provider, "opensubtitles");
  assert.equal(subtitles[0].prepared, true);
});

test("chapter-list drops invalid starts and sorts by time", () => {
  assert.deepEqual(
    parseMpvChapterList([
      { title: "End", time: 90 },
      { time: -1 },
      { title: "Start", time: 0 },
      { title: 5, time: 30 },
    ]),
    [
      { title: "Start", startSec: 0 },
      { title: "", startSec: 30 },
      { title: "End", startSec: 90 },
    ],
  );
});

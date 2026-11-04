// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { html5BridgeHarness } from "./helpers/html5-bridge-harness.ts";
import { parseMpvTrackList, type ExternalSubtitleMetadata } from "../src/lib/player/mpv-tracks.ts";
import { pickDesiredSubtitleTrack } from "../src/lib/subtitles/track-selection.ts";

test("Windows path separators cannot drop loaded subtitle metadata", () => {
  const meta: ExternalSubtitleMetadata = {
    url: "https://subs.test/a.srt",
    lang: "en",
    provider: "Fixture",
    release: "Movie.2026.WEB-DL",
    prepared: true,
  };
  const { subtitles } = parseMpvTrackList(
    [
      {
        type: "sub",
        id: 3,
        external: true,
        "external-filename": "C:\\Temp\\harbor-subs\\a.srt",
        selected: true,
      },
    ],
    null,
    new Map([["C:/Temp/harbor-subs/a.srt", meta]]),
  );
  assert.equal(subtitles[0].provider, "Fixture");
  assert.equal(subtitles[0].release, "Movie.2026.WEB-DL");
  assert.equal(subtitles[0].url, "https://subs.test/a.srt");
});

const external = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  lang: "en",
  external: true,
  prepared: true,
  autoSelectionEligible: true,
  ...extra,
});

test("automatic subtitle selection excludes known incompatible releases", () => {
  assert.equal(
    pickDesiredSubtitleTrack([external("a", { matchConfidence: "incompatible" })], ["en"], false),
    null,
    "an incompatible release alone is never auto-picked",
  );
  assert.equal(
    pickDesiredSubtitleTrack(
      [
        external("bad", { matchConfidence: "incompatible", matchScore: 100 }),
        external("ok", { matchConfidence: "low", matchScore: 1 }),
      ],
      ["en"],
      false,
    )?.id,
    "ok",
  );
  assert.equal(
    pickDesiredSubtitleTrack(
      [
        external("low", { matchConfidence: "low", matchScore: 90 }),
        external("exact", { matchConfidence: "exact", matchScore: 10 }),
      ],
      ["en"],
      false,
    )?.id,
    "exact",
    "a more confident release wins over a higher raw score",
  );
});

test("subtitle load failures do not print private subtitle URLs", async () => {
  const url = "https://subs.test/download?token=SECRET";
  const h = html5BridgeHarness({ [url]: new Error(`fetch ${url} failed`) });
  assert.equal(await h.bridge.addSubtitle(url, "en", "A", true, { provider: "Fixture" }), false);
  assert.equal(h.warnings.length, 1, "the failure is still logged");
  assert.doesNotMatch(JSON.stringify(h.warnings), /SECRET|subs\.test/);
  assert.match(JSON.stringify(h.warnings), /Fixture/);
});

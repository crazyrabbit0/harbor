import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyTrust } from "../src/lib/streams/trust.ts";
import type { ParsedStream } from "../src/lib/streams/types.ts";

type ParityCase = {
  name: string;
  stream: {
    season: number | null;
    episode: number | null;
    episodeEnd: number | null;
    seasonPack: boolean;
    fileIdx: number | null;
  };
  opts: {
    expectedSeason: number | null;
    expectedEpisode: number | null;
    isAnime: boolean;
    strict?: boolean;
  };
  expectEpisodeMismatch: boolean;
  expectReason: string | null;
};

// The Rust trust::tests::episode_rule_matches_ts_fixture test reads the same file.
const cases: ParityCase[] = JSON.parse(
  readFileSync("harbor-core/tests/fixtures/trust-episode-parity.json", "utf8"),
);

function stream(c: ParityCase): ParsedStream {
  return {
    addonId: "addon",
    addonName: "Addon",
    infoHash: "a".repeat(40),
    ...(c.stream.fileIdx == null ? {} : { fileIdx: c.stream.fileIdx }),
    parsedTitle: "Sample Show",
    episodeTitle: null,
    resolution: "1080p",
    hdrFormat: null,
    codec: "HEVC",
    source: "WEB-DL",
    audio: { codec: "AAC", channels: 2 },
    audioLanguages: [],
    size: 2 * 1024 ** 3,
    seeders: 50,
    cached: {},
    cacheVerified: {},
    inLibrary: {},
    container: "mkv",
    releaseGroup: null,
    releaseGroupNormalized: null,
    remux: false,
    edition: null,
    year: 2020,
    yearRange: null,
    season: c.stream.season,
    episode: c.stream.episode,
    episodeEnd: c.stream.episodeEnd,
    seasonPack: c.stream.seasonPack,
    discIndex: null,
    repackIteration: 0,
    proper: false,
    hardcoded: false,
    animeHash: null,
    scamScore: 0,
  };
}

test("fixture holds enough cases", () => {
  assert.ok(cases.length >= 12);
});

for (const c of cases) {
  test(`trust episode parity: ${c.name}`, () => {
    const { rejected } = applyTrust([stream(c)], {
      strict: c.opts.strict ?? true,
      isAnime: c.opts.isAnime,
      expectedSeason: c.opts.expectedSeason,
      expectedEpisode: c.opts.expectedEpisode,
    });
    const reason = rejected[0]?.reason ?? null;
    assert.equal(reason, c.expectReason);
    // The season rule runs first, so a cross-season episode mismatch surfaces as season-mismatch.
    assert.equal(/^(season|episode)-mismatch:/.test(reason ?? ""), c.expectEpisodeMismatch);
  });
}

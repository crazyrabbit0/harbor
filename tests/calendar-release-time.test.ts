// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { localDateTimeFromIso } from "../src/lib/calendar-time.ts";
import { loadModule } from "./helpers/hook-harness.ts";

test("calendar timestamps retain their exact release instant", () => {
  const iso = "2026-08-31T18:30:00Z";
  const result = localDateTimeFromIso(iso);
  assert.equal(result.atMs, Date.parse(iso));
  assert.match(result.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(result.time ?? "", /^\d{1,2}:\d{2} (AM|PM)$/);
});

test("AniZip calendar entries prefer the UTC timestamp over the date-only fallback", async (t: any) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.parse("2026-08-01T12:00:00Z") });
  const utc = "2026-08-20T18:30:00Z";
  const local = localDateTimeFromIso(utc);
  const lib = loadModule("src/lib/calendar-library.ts", {
    "./cinemeta": {},
    "./stremio": {},
    "./watchlist": {},
    "./trakt/watchlist": {},
    "./providers/tvmaze": {},
    "./providers/tmdb/tmdb-calendar": {},
    "./providers/anizip": {
      aniZipByKitsu: async () => ({
        titles: { en: "Show" },
        episodes: {
          "1": { episodeNumber: 1, airDate: "2026-08-12", airDateUtc: utc },
          "2": { episodeNumber: 2, airDate: "2026-08-14" },
        },
      }),
      pickEpisodeTitle: () => null,
    },
    "./calendar-time": { localDateTimeFromIso },
    "./storage-recovery": { setItemWithRecovery() {} },
  });
  const [year, month] = local.date.split("-").map(Number);
  const items = await lib.resolveSavedCalendar(
    [{ id: "kitsu:1", type: "series", name: "Show", mtime: 0, temp: false }],
    year,
    month - 1,
    { tmdbKey: "" },
  );
  const byEpisode = new Map(items.map((i: any) => [i.id, i]));
  const timed: any = byEpisode.get("kitsu:1:1:1");
  assert.equal(timed.releaseDate, local.date);
  assert.equal(timed.releaseAtMs, Date.parse(utc));
  assert.equal(timed.releaseTime, local.time);
  const dateOnly: any = byEpisode.get("kitsu:1:1:2");
  assert.equal(dateOnly.releaseDate, "2026-08-14");
  assert.equal(dateOnly.releaseAtMs, undefined);
});

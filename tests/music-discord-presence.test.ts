import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { flushPromises, loadModule } from "./helpers/hook-harness";
import {
  musicAlbumPath,
  musicArtistPath,
  musicBounceUrl,
  musicDeepLinkQuery,
  musicDeepLinkUrl,
  musicTrackPath,
  parseMusicDeepLink,
} from "../src/lib/music/deep-link";

const DISCORD_URL_LIMIT = 512;
const src = (file: string) => fileURLToPath(new URL(`../src/${file}`, import.meta.url));

const config = {
  enabled: true,
  hideTitle: false,
  showWhenPaused: true,
  showWhenBrowsing: true,
  showPoster: true,
  showTimestamp: true,
  showPartyJoin: true,
  showMusic: true,
};
const listening = {
  title: "Roygbiv",
  artist: "Boards of Canada",
  album: "Music Has the Right to Children",
  paused: false,
  positionSec: 10,
  durationSec: 200,
};

function discordPresence() {
  const timers: Array<() => void> = [];
  const sent: Array<{ cmd: string; args: any }> = [];
  const api = loadModule(
    src("lib/discord/presence.ts"),
    {
      "@/lib/config/endpoints": { HARBOR_DATA_BASE: "https://data.test" },
      "@/lib/manga/title": { stripColorTag: (title: string) => title },
      "./manga-cover": { mangaDiscordCover: () => undefined, onMangaCoverResolved: () => {} },
      "@tauri-apps/api/core": {
        invoke: async (cmd: string, args: any) => {
          sent.push({ cmd, args });
        },
      },
    },
    { window: { __TAURI_INTERNALS__: {}, setTimeout: (run: () => void) => timers.push(run) } },
  );
  return {
    api,
    presences: () => sent.filter((c) => c.cmd === "discord_set_presence").map((c) => c.args.p),
    async flush() {
      for (const run of timers.splice(0)) run();
      await flushPromises();
    },
  };
}

test("track, album and artist links round trip through the harbor scheme", () => {
  const track = parseMusicDeepLink(musicDeepLinkUrl(musicTrackPath("AC/DC", "Thunderstruck")));
  assert.deepEqual(track, { kind: "track", artist: "AC/DC", name: "Thunderstruck" });
  const album = parseMusicDeepLink(musicDeepLinkUrl(musicAlbumPath("AC/DC", "Back in Black")));
  assert.deepEqual(album, { kind: "album", artist: "AC/DC", name: "Back in Black" });
  const artist = parseMusicDeepLink(musicDeepLinkUrl(musicArtistPath("Фёдор Чистяков")));
  assert.deepEqual(artist, { kind: "artist", artist: "Фёдор Чистяков", name: undefined });
});

test("malformed and unknown music links parse to null", () => {
  assert.equal(parseMusicDeepLink("harbor://music/"), null);
  assert.equal(parseMusicDeepLink("harbor://music/playlist/x/y"), null);
  assert.equal(parseMusicDeepLink("harbor://music/track//Thunderstruck"), null);
  assert.equal(parseMusicDeepLink("harbor://detail/movie/tt0111161"), null);
  assert.equal(parseMusicDeepLink(musicDeepLinkUrl("track/%E0%A4/x")), null);
});

test("bounce urls stay inside the discord link budget for every script", () => {
  const cases: Array<[string, string]> = [
    ["Fairuz", "فيروز و الأطفال يغنون لبيروت في حفلة الأعياد الكبرى"],
    ["Гражданская оборона", "Всё идёт по плану на большом концерте"],
    ["米津玄師", "パプリカ 🎵 フルバージョン 特別編集 ライブ音源 ボーナストラック"],
    ["A".repeat(400), "B".repeat(400)],
  ];
  for (const [artist, title] of cases) {
    const url = musicBounceUrl(musicTrackPath(artist, title));
    assert.ok(url.startsWith("harbor://music/track/"), `missing link for ${artist}`);
    assert.ok(url.length <= DISCORD_URL_LIMIT, `${artist} produced ${url.length} chars`);
    assert.ok(musicBounceUrl(musicArtistPath(artist)).length <= DISCORD_URL_LIMIT);
    assert.ok(musicBounceUrl(musicAlbumPath(artist, title)).length <= DISCORD_URL_LIMIT);
  }
});

test("a search query is rebuilt from the link", () => {
  const track = { artist: "Boards of Canada", name: "Roygbiv" };
  assert.equal(musicDeepLinkQuery(track), "Boards of Canada Roygbiv");
  assert.equal(musicDeepLinkQuery({ artist: "Burial" }), "Burial");
});

test("music presence is sent to discord but never reaches the social activity feed", async () => {
  const h = discordPresence();
  const seen: unknown[] = [];
  h.api.configureDiscord(config);
  h.api.subscribeActivity((state: unknown) => seen.push(state));
  h.api.setMusicPresence(listening);
  await h.flush();
  const [sent] = h.presences();
  assert.equal(sent.details, listening.title);
  assert.equal(sent.activityType, "listening");
  assert.deepEqual(seen, [{ playback: null, party: null }]);
});

test("a watch party keeps its own activity instead of the listening one", async () => {
  const h = discordPresence();
  h.api.configureDiscord(config);
  h.api.setPartyPresence({ id: "room", size: 2 });
  h.api.setMusicPresence(listening);
  await h.flush();
  const party = h.presences().at(-1);
  assert.notEqual(party.activityType, "listening");
  assert.ok(!JSON.stringify(party).includes(listening.title));
  h.api.setPartyPresence(null);
  await h.flush();
  const music = h.presences().at(-1);
  assert.equal(music.details, listening.title);
  assert.equal(music.activityType, "listening");
});

test("every deep link builder has a caller", () => {
  let publish = () => {};
  const shown: any[] = [];
  const state = {
    phase: "playing",
    currentTime: 5,
    duration: 200,
    current: {
      id: "t1",
      connectorId: "catalog",
      title: listening.title,
      artist: listening.artist,
      album: listening.album,
      durationSeconds: 200,
    },
  };
  const api = loadModule(src("lib/music/presence.ts"), {
    "@/lib/discord/presence": { setMusicPresence: (m: unknown) => shown.push(m) },
    "./player": {
      getMusicState: () => state,
      subscribeMusic: (run: () => void) => {
        publish = run;
        return () => {};
      },
    },
    "./deep-link": {
      musicAlbumPath,
      musicArtistPath,
      musicBounceUrl,
      musicTrackPath,
    },
  });
  api.startMusicPresence();
  publish();
  const [first] = shown;
  assert.equal(first.trackUrl, musicBounceUrl(musicTrackPath(listening.artist, listening.title)));
  assert.equal(first.artistUrl, musicBounceUrl(musicArtistPath(listening.artist)));
  assert.equal(first.albumUrl, musicBounceUrl(musicAlbumPath(listening.artist, listening.album)));
});

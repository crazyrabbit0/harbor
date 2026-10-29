import assert from "node:assert/strict";
import test from "node:test";
import { collectStoredPaths, localLibraryPaths } from "../src/lib/fs-scope.ts";

function storage(items: Record<string, string>) {
  const keys = Object.keys(items);
  return {
    getItem: (key: string) => items[key] ?? null,
    key: (index: number) => keys[index] ?? null,
    get length() {
      return keys.length;
    },
  };
}

test("collects user-chosen folders and files kept only in localStorage", () => {
  const paths = collectStoredPaths(
    storage({
      "harbor.music.download-dir.v1": "D:\\Music",
      "harbor.manga.downloads.dir.v1": "/mnt/manga",
      "harbor.ebook.sources.v1": JSON.stringify([
        { id: "local:1", name: "Books", kind: "local", location: "E:\\Books" },
        { id: "html:1", name: "Site", kind: "html", location: "https://example.test" },
      ]),
      "harbor.manga.sources.v1": JSON.stringify([
        { id: "a", baseUrl: "F:\\Comics", kind: "local" },
        { id: "b", baseUrl: "https://suwayomi.test", kind: "suwayomi" },
      ]),
      "harbor.games.custom.v1:default": JSON.stringify({
        version: 1,
        games: [
          { id: "g", artwork: "G:\\Art\\cover.png" },
          { id: "h", artwork: null },
        ],
        sessions: [],
      }),
      "harbor.games.presentation.v1:kid": JSON.stringify({
        version: 1,
        entries: { "steam:1": { cover: "/home/me/covers/one.jpg" }, "steam:2": { cover: null } },
      }),
      "harbor.subtitle.memory.v1": JSON.stringify({
        movie: { source: "H:\\Subs\\movie.srt", imported: true, updatedAt: 1 },
        other: { source: "https://subs.test/a.srt", imported: true, updatedAt: 1 },
        addon: { source: "I:\\not-imported.srt", updatedAt: 1 },
      }),
      "harbor.unrelated": "J:\\Elsewhere",
    }),
  );
  assert.deepEqual(paths.sort(), [
    "/home/me/covers/one.jpg",
    "/mnt/manga",
    "D:\\Music",
    "E:\\Books",
    "F:\\Comics",
    "G:\\Art\\cover.png",
    "H:\\Subs\\movie.srt",
  ]);
});

test("ignores relative values, broken JSON and duplicates", () => {
  const paths = collectStoredPaths(
    storage({
      "harbor.music.download-dir.v1": "relative/music",
      "harbor.manga.downloads.dir.v1": "",
      "harbor.ebook.sources.v1": "{broken",
      "harbor.manga.sources.v1": JSON.stringify([
        { baseUrl: "C:\\Same", kind: "local" },
        { baseUrl: "C:\\Same", kind: "local" },
      ]),
    }),
  );
  assert.deepEqual(paths, ["C:\\Same"]);
});

test("local library contributes scanned folders, their parents and artwork files", () => {
  const paths = localLibraryPaths([
    {
      folder: "D:\\Shows\\Dark\\Season 1",
      localArt: { poster: "D:\\poster.jpg", logo: undefined },
    },
    { folder: "D:\\Shows\\Dark\\Season 1\\" },
    { folder: "/media/movies" },
    { folder: undefined, localArt: { backdrop: "relative.jpg" } },
  ]);
  assert.deepEqual(paths, [
    "D:\\Shows\\Dark\\Season 1",
    "D:\\Shows\\Dark",
    "D:\\poster.jpg",
    "D:\\Shows\\Dark\\Season 1\\",
    "/media/movies",
    "/media",
  ]);
});

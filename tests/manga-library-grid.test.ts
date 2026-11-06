// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";
import {
  fakeElement,
  icons,
  jsx,
  loadTsx,
  makeT,
  named,
  nodes,
  text,
} from "./helpers/manga-harness.ts";

const lines = (p: string) =>
  new Set(
    readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
      .split(/\r?\n/)
      .map((line: string) => line.trim()),
  );

const FAVS = new Map([
  ["old", { id: "old", title: "Old", cover: "https://c/old.jpg", addedAt: 1 }],
  ["new", { id: "new", title: "New", cover: "https://c/new.jpg", addedAt: 5 }],
]);

function library() {
  const timers: (() => void)[] = [];
  const opened: string[] = [];
  const target = fakeElement();
  const queried: string[] = [];
  const scrollRef = {
    current: {
      querySelector: (sel: string) => (queried.push(sel), target),
    },
  };
  const h = hookHarness(
    "src/views/manga/manga-library.tsx",
    "MangaLibrary",
    {
      "react/jsx-runtime": jsx,
      "lucide-react": icons,
      "@/lib/i18n": { useT: () => makeT().t },
      "@/lib/manga-favorites": {
        useMangaFavorites: () => ({ items: FAVS, repair: () => {} }),
      },
      "@/lib/manga-lists": { mangaLists: "store" },
      "@/lib/manga/open-resolve": { resolveMangaOpen: async () => null },
      "@/lib/manga/sources": { hasAnyMangaSource: () => false },
      "@/lib/view": { useViewActions: () => ({ openManga: (id: string) => opened.push(id) }) },
      "../library/my-lists-tab": { MyListsTab: function MyListsTab() {} },
      "@/components/virtual-grid": { VirtualGrid: function VirtualGrid() {} },
      "@/lib/context-menu": { useContextMenu: () => ({ open: () => {} }) },
      "@/lib/visibility": { observeWithin: () => () => {} },
      "@/lib/remote-image-proxy": { useProxiedImageSrc: (url: string) => url },
    },
    {
      window: {
        setTimeout: (fn: () => void) => timers.push(fn),
        addEventListener: () => {},
        removeEventListener: () => {},
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => {},
      },
      document: { getElementById: () => null },
    },
    ["FavCell"],
  );
  const render = () => nodes(h.render({ scrollRef }));
  return { h, render, scrollRef, target, queried, timers, opened };
}

test("manga library drops the spotlight hero, its rail, and the section ring", () => {
  // The rail module is not among the mocks, so importing it would throw; the screen is just two sections.
  const tree = library().render();
  const sections = tree.filter((n) => n.type === "section");
  assert.deepEqual(
    sections.map((s) => s.props.id),
    ["manga-favorites", "manga-lists"],
  );
  const first = nodes(sections[0].props.children);
  assert.equal(named(first, "VirtualGrid").length, 1);
  assert.equal(first.filter((n) => n.type === "img").length, 0, "no hero artwork above the grid");
});

test("manga library anchors favorites and lists sections", () => {
  const lib = library();
  for (const label of ["Lists", "Favorites"]) {
    lib
      .render()
      .find((n) => n.type === "button" && n.props["aria-label"] === label)!
      .props.onClick();
  }
  assert.deepEqual(lib.queried, ["#manga-lists", "#manga-favorites"]);
  assert.equal(lib.target.scrolled, 2);
  const ids = lib
    .render()
    .filter((n) => n.type === "section")
    .map((s) => s.props.id);
  assert.ok(lib.queried.every((sel) => ids.includes(sel.slice(1))));
});

test("manga library renders the poster grid with swap animation and jump highlight", () => {
  const lib = library();
  const tree = lib.render();
  const grid = named(tree, "VirtualGrid")[0];
  assert.deepEqual(
    grid.props.items.map((m: any) => m.id),
    ["new", "old"],
    "newest favorite first",
  );
  assert.equal(grid.props.scrollRef, lib.scrollRef);
  const cell = grid.props.renderItem(grid.props.items[0]);
  assert.equal(cell.type.name, "FavCell");

  // The cell opens its title through the library's open path.
  const rendered = lib.h.exports.FavCell(cell.props);
  rendered.props.onClick();
  assert.deepEqual(lib.opened, ["new"]);

  // Jumping replays the swap animation on the wrapper and flashes the target section.
  const swap = tree.find((n) => n.props.ref && n.props.className?.includes("animate-media-swap"));
  const wrap = swap!.props.ref.current;
  tree.find((n) => n.props["aria-label"] === "Lists")!.props.onClick();
  assert.deepEqual(wrap.removed, ["animate-media-swap"]);
  assert.deepEqual(wrap.added, ["animate-media-swap"]);
  assert.deepEqual(lib.target.added, ["hset-jumped"]);
  assert.equal(lib.timers.length, 1);
  lib.timers[0]();
  assert.deepEqual(lib.target.removed, ["hset-jumped", "hset-jumped"]);
  const current = lib.render().filter((n) => n.props["aria-current"] === "true");
  assert.deepEqual(
    current.map((n) => n.props["aria-label"]),
    ["Lists"],
  );
});

test("manga poster row exports the memo button with an optional ring", () => {
  const row = loadTsx("src/views/manga/manga-poster-row.tsx", {
    "react/jsx-runtime": jsx,
    react: { memo: (component: unknown) => component },
    "@/components/poster": { Poster: function Poster() {} },
    "@/components/row": { Row: function Row() {} },
    "@/lib/context-menu": { useContextMenu: () => ({ open: () => {} }) },
  });
  const m = { id: "1", title: "T", cover: "c" };
  const poster = (props: Record<string, unknown>) =>
    named(nodes(row.MemoPosterButton({ m, onOpen: () => {}, award: false, ...props })), "Poster")[0]
      .props.className as string;
  assert.ok(poster({ releasePosters: true }).startsWith("harbor-card-ring "));
  assert.ok(!poster({ releasePosters: true, ring: false }).includes("harbor-card-ring"));
});

test("manga view wires the library scroll ref into the screen", () => {
  // manga.tsx has an unmanageable import graph; pin the one wiring line.
  const line = "<MangaLibrary scrollRef={libraryScrollRef} />";
  assert.ok(lines("src/views/manga.tsx").has(line), `manga.tsx lacks: ${line}`);
});

function proxy(quality: string) {
  const calls: { cmd: string; args: any }[] = [];
  let size: unknown = { bytes: 10, files: 2 };
  const h = hookHarness(
    "src/lib/remote-image-proxy.ts",
    "probe",
    {
      "@tauri-apps/api/core": {
        invoke: async (cmd: string, args: any) => {
          calls.push({ cmd, args });
          if (cmd === "harbor_fetch_image") return new Uint8Array([3, 0x61, 0x2f, 0x62, 1]).buffer;
          if (cmd === "thumb_cache_size") return size;
          return null;
        },
      },
      "@/lib/manga/sources/suwayomi/auth-registry": { suwayomiAuthFor: () => undefined },
      "@/lib/settings": {
        useSettingsSelector: (pick: (s: unknown) => unknown) => pick({ posterQuality: quality }),
      },
    },
    { window: { __TAURI_INTERNALS__: {} } },
  );
  h.exports.probe = (a: { url: string; opts?: { forceProxy?: boolean } }) =>
    h.exports.useProxiedImageSrc(a.url, a.opts);
  return {
    h,
    calls,
    setSize: (v: unknown) => void (size = v),
    fetches: () => calls.filter((c) => c.cmd === "harbor_fetch_image"),
  };
}

test("proxied covers request server-side thumbnails", async () => {
  const cover = "https://cdn/cover.jpg";
  for (const [quality, width] of [
    ["standard", 400],
    ["high", 600],
    ["max", undefined],
  ] as const) {
    const p = proxy(quality);
    assert.equal(p.h.render({ url: cover, opts: { forceProxy: true } }), undefined);
    await flushPromises();
    assert.equal(p.fetches().length, 1);
    assert.equal(p.fetches()[0].args.args.thumbWidthPx, width);
    assert.match(p.h.render({ url: cover, opts: { forceProxy: true } }), /^blob:/);
  }

  // Without forceProxy an https cover loads directly.
  const direct = proxy("standard");
  assert.equal(direct.h.render({ url: cover }), cover);
  await flushPromises();
  assert.equal(direct.fetches().length, 0);

  // Clearing drops the cached thumbnails and the disk cache, so the cover is fetched again.
  const p = proxy("standard");
  p.h.render({ url: cover, opts: { forceProxy: true } });
  await flushPromises();
  await p.h.exports.clearThumbCache();
  assert.ok(p.calls.some((c) => c.cmd === "clear_thumb_cache"));
  p.h.render({ url: "https://cdn/other.jpg", opts: { forceProxy: true } });
  p.h.render({ url: cover, opts: { forceProxy: true } });
  await flushPromises();
  assert.equal(
    p.fetches().filter((c) => c.args.args.url === cover).length,
    2,
    "a cleared thumbnail is fetched again",
  );

  assert.deepEqual(await p.h.exports.getThumbCacheSize(), { bytes: 10, files: 2 });
  p.setSize({ bytes: "x" });
  assert.equal(await p.h.exports.getThumbCacheSize(), null);
});

test("thumbnail disk cache persists resizes with age and size caps", async () => {
  // Rust is not executable here; pin the cap checks and the command registrations.
  const disk = lines("src-tauri/src/thumb_cache.rs");
  for (const line of [
    "mtime.elapsed().map(|age| age <= MAX_AGE).unwrap_or(false)",
    "if !is_fresh(modified) {",
    "if listed.len() <= MAX_FILES && total <= MAX_BYTES {",
    "enforce_caps(&dir);",
    "pub fn clear_thumb_dir(app: &tauri::AppHandle) {",
    "pub fn thumb_cache_size(app: &tauri::AppHandle) -> (u64, usize) {",
  ])
    assert.ok(disk.has(line), `thumb_cache.rs lacks: ${line}`);
  const lib = lines("src-tauri/src/lib.rs");
  for (const line of ["http_fetch::clear_thumb_cache,", "http_fetch::thumb_cache_size,"])
    assert.ok(lib.has(line), `lib.rs lacks: ${line}`);

  // The Caches tab reads the thumbnail usage and clears it.
  let cleared = 0;
  let setTab: (id: string) => void = () => {};
  const { t, calls } = makeT();
  const panel = hookHarness(
    "src/views/settings/storage-panel.tsx",
    "StoragePanel",
    {
      "react/jsx-runtime": jsx,
      "./sub-tabs": {
        useSubTabs: (_tabs: unknown, _value: unknown, onChange: (id: string) => void) => {
          setTab = onChange;
        },
      },
      "./player-panel/p2p-advanced-section": { StreamCacheSection: "StreamCacheSection" },
      "./icons": icons,
      "@/lib/i18n": { useT: () => t },
      "@/lib/read-at-version": { readAtVersion: (_v: unknown, fn: () => unknown) => fn() },
      "@/lib/picker-cache": { clearPickerCache: () => {}, pickerCacheCount: () => 0 },
      "@/lib/remote-image-proxy": {
        clearThumbCache: async () => void cleared++,
        getThumbCacheSize: async () => ({ bytes: 2048, files: 3 }),
      },
      "@/lib/manga/api": { clearMangaCache: () => {} },
      "@/lib/iptv/epg-store": { clearEpg: () => {} },
      "@/lib/iptv/store": { clearPlaylistCache: () => {} },
      "@/lib/iptv/xtream-vod": { clearSeriesInfoCache: () => {} },
      "@/lib/dead-streams": { clearDeadStreams: () => {} },
      "@/lib/cw-resurface": { clearResurfaceCache: () => {} },
      "./shared": { Section: function Section() {} },
      "./kit": {
        ROW_DESC: "",
        SettingGroup: function SettingGroup() {},
        SettingRow: function SettingRow() {},
      },
      "./temp-files-card": { TempFilesCard: "TempFilesCard" },
    },
    { navigator: {}, window: { setTimeout: () => 0, clearTimeout: () => {} } },
  );
  panel.render();
  setTab("caches");
  panel.render();
  await flushPromises();
  const row = nodes(panel.render()).find(
    (n) =>
      typeof n.type === "function" &&
      n.type.name === "ClearRow" &&
      n.props.title === "Poster thumbnails",
  );
  assert.ok(row, "Caches tab has the poster thumbnail row");
  assert.match(text(row!.props.usage), /^2 KB across 3 files/);
  assert.ok(calls.some((c) => c.key === "{size} across {n} files"));
  row!.props.onClear();
  await flushPromises();
  assert.equal(cleared, 1);
});

// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { loadModule } from "./helpers/hook-harness.ts";

type Entry = { name: string; isFile: boolean; isDirectory: boolean };
type Tree = { [name: string]: Tree | "epub" | "txt" };

/** Loads providers.ts over a fake folder tree joined with Windows backslashes. */
function scanner(tree: Tree | ((dir: string) => Entry[])) {
  const reads: string[] = [];
  const at = (dir: string): Tree | undefined => {
    let node: Tree | undefined = tree as Tree;
    for (const part of dir.split("\\").slice(1)) {
      const next: Tree[string] | undefined = node?.[part];
      node = typeof next === "object" ? next : undefined;
    }
    return node;
  };
  const readDir = async (dir: string): Promise<Entry[]> => {
    reads.push(dir);
    if (typeof tree === "function") return tree(dir);
    return Object.entries(at(dir) ?? {}).map(([name, value]) => ({
      name,
      isFile: typeof value === "string",
      isDirectory: typeof value === "object",
    }));
  };
  const mod = loadModule(
    "src/lib/ebook/providers.ts",
    {
      "./extensions": {
        loadEBookExtensions: async () => {},
        installedEBookPlugins: () => [],
        subscribeEBookExtensions: () => {},
      },
      "./api": {},
      "./epub": {},
      "./gutendex": {},
      "./sources": { listEBookSources: () => [] },
      "@/assets/gutenberg.png": { default: "gutenberg.png" },
      "@/lib/safe-fetch": {},
      "./translation": {},
      "./cache": {},
      "@/lib/manga/plugins/worker-host": { PluginWorker: class {} },
      "./chapter-locations": {},
      "./reader-state": {},
      "@tauri-apps/plugin-fs": { readDir },
      "@tauri-apps/api/path": { join: async (a: string, b: string) => `${a}\\${b}` },
    },
    {},
    ["scanLocalBooks", "LOCAL_SCAN_MAX_DEPTH", "LOCAL_SCAN_MAX_DIRS"],
  );
  const scan = async () =>
    Object.fromEntries(
      (await mod.scanLocalBooks({ id: "lib", location: "C:" })) as Map<
        string,
        { title: string; paths: string[] }
      >,
    );
  return { scan, reads, maxDepth: mod.LOCAL_SCAN_MAX_DEPTH, maxDirs: mod.LOCAL_SCAN_MAX_DIRS };
}

test("the library walk starts at the chosen folder and goes deeper than one level", async () => {
  // Author/Book/Book.epub is as common as a flat folder, and one pass found neither.
  const s = scanner({ Author: { Saga: { "Saga.epub": "epub" }, "notes.txt": "txt" } });
  assert.deepEqual(await s.scan(), {
    "C:\\Author\\Saga": { title: "Saga", paths: ["C:\\Author\\Saga\\Saga.epub"] },
  });
  assert.equal(s.reads[0], "C:", "the chosen folder is the root");
});

test("the walk is bounded in both depth and breadth", async () => {
  // readDir follows symlinks, so an unbounded walk can loop or swallow a whole drive.
  const deep = scanner((dir) => [
    { name: "x.epub", isFile: true, isDirectory: false },
    { name: `d${dir.split("\\").length}`, isFile: false, isDirectory: true },
  ]);
  const found = Object.keys(await deep.scan());
  assert.equal(deep.reads.length, deep.maxDepth + 1);
  assert.equal(Math.max(...found.map((path) => path.split("\\").length - 1)), deep.maxDepth);

  const loop = scanner(() => [{ name: "self", isFile: false, isDirectory: true }]);
  await loop.scan();
  assert.ok(loop.reads.length <= loop.maxDepth + 1, "a symlink loop stops at the depth cap");

  const wide = scanner((dir) =>
    dir === "C:"
      ? Array.from({ length: 5000 }, (_, i) => ({
          name: `f${i}`,
          isFile: false,
          isDirectory: true,
        }))
      : [],
  );
  await wide.scan();
  assert.equal(wide.reads.length, wide.maxDirs);
});

test("a folder is titled by its own name, never by a split path", async () => {
  // Windows separates with a backslash, so slicing the path string titles books wrong.
  const s = scanner({ Shelf: { "My-Great_Book": { "a.epub": "epub" } } });
  assert.equal((await s.scan())["C:\\Shelf\\My-Great_Book"].title, "My Great Book");
});

test("loose files at the top stay separate books while a folder groups its volumes", async () => {
  const s = scanner({
    "Loose_One.epub": "epub",
    "Loose-Two.EPUB": "epub",
    Series: { "Vol 2.epub": "epub", "Vol 10.epub": "epub", "cover.jpg": "txt" },
  });
  assert.deepEqual(await s.scan(), {
    "C:\\Loose_One.epub": { title: "Loose One", paths: ["C:\\Loose_One.epub"] },
    "C:\\Loose-Two.EPUB": { title: "Loose Two", paths: ["C:\\Loose-Two.EPUB"] },
    "C:\\Series": {
      title: "Series",
      paths: ["C:\\Series\\Vol 2.epub", "C:\\Series\\Vol 10.epub"],
    },
  });
});

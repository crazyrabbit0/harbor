// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";
import {
  icons,
  jsx,
  loadTsx,
  makeT,
  named,
  nodes,
  suwayomiStack,
  text,
  type FakeClient,
} from "./helpers/manga-harness.ts";

const BASE = "http://srv";
const config = { baseUrl: BASE };
const SOURCES = [{ id: "7", name: "Source", lang: "en" }];

async function settle() {
  for (let i = 0; i < 6; i++) await flushPromises();
}

function fakeClient(o: {
  rest?: unknown[] | null;
  gql?: (query: string, variables: any) => any;
  getOk?: (path: string) => boolean;
}) {
  const log = { get: [] as string[], ok: [] as string[], del: [] as string[], post: [] as any[] };
  const client: FakeClient = {
    server: { base: BASE },
    async getJson(path) {
      log.get.push(path);
      return path === "/api/v1/source/list" ? (o.rest ?? null) : null;
    },
    async getOk(path) {
      log.ok.push(path);
      return o.getOk?.(path) ?? true;
    },
    async deleteOk(path) {
      log.del.push(path);
      return true;
    },
    async postJson(_path, body) {
      log.post.push(body);
      if (body.query.includes("aboutServer")) return { data: { aboutServer: { version: "1" } } };
      return o.gql?.(body.query, body.variables) ?? null;
    },
    async probeStatus() {
      return 200;
    },
  };
  return { client, log };
}

const extensionReply = (isInstalled: boolean) => ({
  data: { updateExtension: { extension: { pkgName: "pkg", isInstalled } } },
});

const pickerMocks = (t: unknown, extra: Record<string, unknown>) => ({
  "react/jsx-runtime": jsx,
  "lucide-react": icons,
  "@/components/icons/search-icon": { Search: "Search" },
  "@/lib/manga/types": { languageName: (lang: string) => lang },
  "@/lib/i18n": { useT: () => t },
  "../shared": { CARD: "card", INPUT: "input" },
  "./types": { initials: (name: string) => name.slice(0, 2) },
  ...extra,
});

test("extension changes invalidate tags and refresh installed sources", async () => {
  // A refused REST install falls back to GraphQL, then announces the change for this server.
  const { client, log } = fakeClient({
    rest: SOURCES,
    getOk: () => false,
    gql: (q) => (q.includes("updateExtension") ? extensionReply(!q.includes("uninstall")) : null),
  });
  const stack = suwayomiStack(client);
  const changed: string[] = [];
  stack.events.subscribeSuwayomiSourcesChanged((base: string) => changed.push(base));
  const before = stack.events.suwayomiSourcesRevision();
  await stack.api.installExtension(config, "pkg");
  assert.deepEqual(log.ok, ["/api/v1/extension/install/pkg"]);
  assert.deepEqual(changed, [BASE]);
  assert.equal(stack.events.suwayomiSourcesRevision(), before + 1);
  await stack.api.uninstallExtension(config, "pkg");
  assert.deepEqual(changed, [BASE, BASE]);

  // An uninstall the server did not apply rejects and announces nothing.
  const still = suwayomiStack(
    fakeClient({ gql: (q) => (q.includes("updateExtension") ? extensionReply(true) : null) })
      .client,
  );
  let notified = 0;
  still.events.subscribeSuwayomiSourcesChanged(() => notified++);
  await assert.rejects(still.api.uninstallExtension(config, "pkg"));
  assert.equal(notified, 0);

  // The tags cache is keyed by the sources revision.
  let tagCalls = 0;
  const provider = { id: "suwayomi", tags: async () => [{ id: `t${++tagCalls}` }] };
  const mangaApi = loadModule(
    "src/lib/manga/api.ts",
    {
      "@/lib/storage-recovery": { setItemWithRecovery: () => true },
      "./sources": {
        ensureMangaSources: async () => {},
        activeMangaSourceId: () => "suwayomi",
        activeMangaProvider: () => provider,
        activeMangaSource: () => ({ baseUrl: BASE }),
        aggregateSubProviders: () => [provider],
      },
      "./sources/aggregate": {},
      "./sources/suwayomi/source-events": stack.events,
      "./library-events": { mangaLibraryRevision: () => 0 },
      "./lang-filter": { loadMangaLangFilter: () => ["en"], mangaLangFilterRevision: () => 0 },
      "./model": {},
    },
    { window: { setTimeout: () => 0, clearTimeout: () => {} } },
  );
  assert.deepEqual(await mangaApi.mangaTags(), [{ id: "t1" }]);
  assert.deepEqual(await mangaApi.mangaTags(), [{ id: "t1" }]);
  stack.events.notifySuwayomiSourcesChanged(BASE);
  assert.deepEqual(await mangaApi.mangaTags(), [{ id: "t2" }]);

  // The source picker reloads its list when the sources change.
  let listed = 0;
  let listener: ((base: string) => void) | undefined;
  const { t } = makeT();
  const picker = hookHarness(
    "src/views/manga/manga-sources-panel/suwayomi/source-picker.tsx",
    "SourcePicker",
    pickerMocks(t, {
      "@/lib/manga/sources/suwayomi/provider": {
        listSources: async () => (listed++, SOURCES),
      },
      "@/lib/manga/sources/suwayomi/source-events": {
        subscribeSuwayomiSourcesChanged: (fn: (base: string) => void) => {
          listener = fn;
          return () => {};
        },
      },
    }),
  );
  picker.render({ config, onPick: () => {} });
  await settle();
  assert.equal(listed, 1);
  listener!(BASE);
  picker.render({ config, onPick: () => {} });
  await settle();
  assert.equal(listed, 2);
});

test("a refused extension action surfaces the server's reason", async () => {
  // The server refuses over GraphQL; REST would accept, so a transport retry would hide the reason.
  const { client, log } = fakeClient({
    rest: [],
    gql: (q) =>
      q.includes("updateExtension")
        ? {
            errors: [
              {
                message:
                  "Exception while fetching data (/updateExtension) : Same version\njava.lang.IllegalStateException: Same version",
              },
            ],
          }
        : null,
  });
  const stack = suwayomiStack(client);
  await assert.rejects(stack.api.updateExtension(config, "pkg"), {
    name: "SuwayomiServerError",
    message: "Same version",
  });
  assert.deepEqual(log.ok, []);
  assert.equal(log.post.filter((b) => b.query.includes("updateExtension")).length, 1);

  // Update all runs every extension and reports the first failure's reason.
  const tried: string[] = [];
  const { t, calls } = makeT();
  const items = ["a", "b", "c"].map((pkgName) => ({
    pkgName,
    name: pkgName,
    lang: "en",
    installed: true,
    hasUpdate: true,
  }));
  const manager = hookHarness(
    "src/views/manga/manga-sources-panel/suwayomi/extensions-manager.tsx",
    "ExtensionsManager",
    pickerMocks(t, {
      "@/lib/manga/sources/suwayomi/provider": {
        listExtensions: async () => items,
        updateExtension: async (_config: unknown, pkg: string) => {
          tried.push(pkg);
          if (pkg !== "b") throw new Error(`refused ${pkg}`);
        },
      },
      "./extension-row": { ExtensionRow: function ExtensionRow() {} },
      "./extension-repos": { ExtensionRepos: function ExtensionRepos() {} },
    }),
  );
  manager.render({ config });
  await settle();
  const updateAll = nodes(manager.render({ config })).find(
    (n) => n.props["aria-label"] === "Update all",
  );
  updateAll!.props.onClick();
  await settle();
  const status = nodes(manager.render({ config })).find((n) => n.props.role === "status");
  assert.deepEqual(tried, ["a", "b", "c"]);
  assert.match(text(status), /refused a$/);
  const summary = calls.filter((c) => c.key === "{ok} updated · {failed} failed").at(-1);
  assert.deepEqual(summary?.vars, { ok: 1, failed: 2 });

  // A single row shows the server's sentence, or the generic key when there is none.
  for (const [err, shown] of [
    [new Error("Server says no"), "Server says no"],
    [new Error(""), "Action failed"],
  ] as const) {
    const row = hookHarness(
      "src/views/manga/manga-sources-panel/suwayomi/extension-row.tsx",
      "ExtensionRow",
      pickerMocks(makeT().t, {
        "@/lib/manga/sources/suwayomi/provider": {
          extensionIconUrl: () => undefined,
          installExtension: async () => {
            throw err;
          },
        },
      }),
    );
    const props = { config, ext: { ...items[0], installed: false }, onChanged: () => {} };
    nodes(row.render(props))
      .find((n) => n.type === "button")!
      .props.onClick();
    await settle();
    const spans = nodes(row.render(props)).filter((n) => n.type === "span");
    assert.ok(spans.some((n) => text(n) === ` · ${shown}`));
  }
});

function joystick() {
  const frames: ((now: number) => void)[] = [];
  const pans: [number, number][] = [];
  const h = hookHarness(
    "src/views/mobile/manga-remote/zoom-joystick.tsx",
    "ZoomJoystick",
    {
      "react/jsx-runtime": jsx,
      "lucide-react": icons,
      "@/lib/i18n": { useT: () => makeT().t },
      "@/lib/use-reduced-motion": { useReducedMotion: () => false },
    },
    {
      requestAnimationFrame: (cb: (now: number) => void) => frames.push(cb),
      cancelAnimationFrame: () => {},
      performance: { now: () => 1000 },
      window: { addEventListener: () => {}, removeEventListener: () => {} },
      document: { addEventListener: () => {}, removeEventListener: () => {} },
    },
  );
  const props = {
    zoom: 2,
    min: 1,
    max: 4,
    canZoom: true,
    onZoom: () => {},
    onPan: (dx: number, dy: number) => pans.push([dx, dy]),
  };
  nodes(h.render(props))
    .find((n) => n.type === "button")!
    .props.onClick();
  const pad = nodes(h.render(props)).find((n) => n.props.role === "group")!;
  return {
    drag(x: number, y: number) {
      pad.props.onPointerDown({ pointerId: 1, clientX: 0, clientY: 0 });
      pad.props.onPointerMove({ pointerId: 1, clientX: x, clientY: y });
      h.render(props);
      for (const frame of frames.splice(0)) frame(1050);
      return pans;
    },
  };
}

test("manga phone joystick uses direct horizontal and vertical pan directions", () => {
  assert.deepEqual(joystick().drag(52, 0), [[44, 0]]);
  assert.deepEqual(joystick().drag(0, 52), [[0, 44]]);
  assert.deepEqual(joystick().drag(-52, 0), [[-44, 0]]);
});

test("available extensions are collapsed until opened or searched", async () => {
  const items = [
    { pkgName: "i", name: "Installed", lang: "en", installed: true, hasUpdate: false },
    { pkgName: "a", name: "Avail", lang: "en", installed: false, hasUpdate: false },
  ];
  const manager = hookHarness(
    "src/views/manga/manga-sources-panel/suwayomi/extensions-manager.tsx",
    "ExtensionsManager",
    pickerMocks(makeT().t, {
      "@/lib/manga/sources/suwayomi/provider": { listExtensions: async () => items },
      "./extension-row": { ExtensionRow: function ExtensionRow() {} },
      "./extension-repos": { ExtensionRepos: function ExtensionRepos() {} },
    }),
  );
  manager.render({ config });
  await settle();
  const available = () => {
    const tree = nodes(manager.render({ config }), ["Group"]);
    const list = tree.find((n) => n.props.id === "suwayomi-available-extensions")!;
    const toggle = tree.find((n) => n.props["aria-controls"] === "suwayomi-available-extensions")!;
    return { tree, list, toggle, rows: named(nodes(list), "ExtensionRow") };
  };
  let view = available();
  assert.equal(view.toggle.props["aria-expanded"], false);
  assert.equal(view.list.props.hidden, true);
  assert.equal(view.rows.length, 0);

  view.toggle.props.onClick();
  view = available();
  assert.equal(view.toggle.props["aria-expanded"], true);
  assert.equal(view.list.props.hidden, false);
  assert.deepEqual(
    view.rows.map((r) => r.props.ext.pkgName),
    ["a"],
  );

  view.toggle.props.onClick();
  view = available();
  assert.equal(view.list.props.hidden, true);
  view.tree
    .find((n) => n.type === "input")!
    .props.onChange({ target: { value: "av" } });
  view = available();
  assert.equal(view.list.props.hidden, false);
  assert.equal(view.rows.length, 1);
});

test("universe matching searches installed sources instead of only the library", async () => {
  // searchAll fans out over installed sources, four at a time, with unthrottled clients.
  const sources = Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), name: "S", lang: "en" }));
  const pending: { source: string; resolve: (v: unknown) => void }[] = [];
  const { client } = fakeClient({
    gql: (q) => {
      if (q.includes("sources {")) return { data: { sources: { nodes: sources } } };
      if (!q.includes("fetchSourceManga")) return null;
      const source = /source: "(\d+)"/.exec(q)![1];
      return new Promise((resolve) => pending.push({ source, resolve }));
    },
  });
  const stack = suwayomiStack(client);
  let done = false;
  const search = stack.provider.searchAll("One Piece").then((r: unknown) => ((done = true), r));
  await settle();
  assert.equal(pending.length, 4);
  assert.ok(stack.gaps.includes(0), "searchAll uses a client without a throttle gap");
  pending[1].resolve({
    data: { fetchSourceManga: { hasNextPage: false, mangas: [{ id: 9, title: "One Piece" }] } },
  });
  await settle();
  assert.equal(done, true, "a strong match ends the search without waiting for every source");
  assert.deepEqual(
    (await search).map((m: any) => m.id),
    [`${pending[1].source}~9`],
  );

  // The combined view merges every provider's searchAll, owner-prefixed, in provider order.
  const { aggregateProvider } = loadModule(
    "src/lib/manga/sources/aggregate.ts",
    {
      "@/lib/manga/sources": {
        aggregateSubProviders: () => [
          { id: "a", searchAll: async () => [{ id: "1", title: "Other" }] },
          { id: "b", searchAll: async () => [{ id: "2", title: "One Piece" }] },
        ],
      },
    },
    { setTimeout: () => 0, clearTimeout: () => {} },
  );
  assert.deepEqual(
    (await aggregateProvider.searchAll("One Piece")).map((m: any) => m.id),
    ["a::1", "b::2"],
  );

  // Picking a universe searches everywhere for its query and opens the best match.
  const searched: string[] = [];
  const opened: string[] = [];
  const universes = hookHarness("src/views/manga/manga-universes.tsx", "MangaUniverses", {
    "react/jsx-runtime": jsx,
    "lucide-react": icons,
    "@/lib/visibility": { usePageVisible: () => true },
    "@/lib/i18n": { useT: () => makeT().t },
    "@/lib/manga/backdrop": { mangaBackdrop: async () => null },
    "@/lib/manga/character": { topCharacterImage: async () => null },
    "@/lib/manga/universe-logo": { universeLogo: async () => null },
    "@/lib/manga/api": {
      searchMangaEverywhere: async (q: string) => {
        searched.push(q);
        return [
          { id: "x", title: "One Piece Party" },
          { id: "y", title: "One Piece" },
        ];
      },
    },
    "@/lib/manga/universes": {
      MANGA_UNIVERSES: [{ id: "op", query: "One Piece", name: "Straw Hats" }],
    },
  });
  const props = { onOpen: (id: string) => opened.push(id), onBack: () => {} };
  named(nodes(universes.render(props)), "UniverseCard")[0].props.onSelect();
  await settle();
  assert.deepEqual(searched, ["One Piece"]);
  assert.deepEqual(opened, ["y"]);
});

test("Harbor favorites mirror the Suwayomi library state", async () => {
  const synced: [string, boolean][] = [];
  const favorites = (stored: unknown[]) => {
    localStorage.setItem("harbor.mangafav.v1.default", JSON.stringify(stored));
    const mod = loadTsx("src/lib/manga-favorites.tsx", {
      "react/jsx-runtime": jsx,
      react: {
        createContext: () => ({ Provider: "Provider" }),
        useContext: () => null,
        useEffect: () => {},
        useMemo: (create: () => unknown) => create(),
        useState: (init: any) => [typeof init === "function" ? init() : init, () => {}],
      },
      "./profiles": { useProfiles: () => ({ activeId: null }) },
      "./storage-recovery": { persistCritical: () => true },
      "./manga/library-events": { notifyMangaLibraryChanged: () => {} },
      "./manga/api": {
        setMangaInLibrary: async (id: string, on: boolean) => void synced.push([id, on]),
      },
    });
    return mod.MangaFavoritesProvider({ children: null }).props.value;
  };
  favorites([]).toggle({ id: "7~1", title: "Saved" });
  await settle();
  favorites([{ id: "7~2", title: "Old" }]).toggle({ id: "7~2" });
  await settle();
  assert.deepEqual(synced, [
    ["7~1", true],
    ["7~2", false],
  ]);

  // REST adds with GET and removes with DELETE on the manga's library endpoint.
  const rest = fakeClient({ rest: SOURCES });
  const restStack = suwayomiStack(rest.client);
  await restStack.provider.setLibrary("7~1", true);
  await restStack.provider.setLibrary("7~1", false);
  assert.deepEqual(rest.log.ok, ["/api/v1/manga/1/library"]);
  assert.deepEqual(rest.log.del, ["/api/v1/manga/1/library"]);

  // GraphQL patches inLibrary from the variable it sends.
  const gql = fakeClient({
    gql: (q) => (q.includes("updateManga") ? { data: { updateManga: { manga: { id: 1 } } } } : null),
  });
  await suwayomiStack(gql.client).provider.setLibrary("7~1", false);
  const update = gql.log.post.find((b) => b.query.includes("updateManga"));
  assert.deepEqual(update.variables, { id: 1, inLibrary: false });
  assert.match(update.query, /patch: \{ inLibrary: \$inLibrary \}/);
});

test("chapter batches expose pause and resume controls", async () => {
  const asked: string[] = [];
  const waiting = new Map<string, (urls: string[]) => void>();
  const downloads = loadModule("src/lib/manga-downloads.ts", {
    react: {},
    "@/lib/manga/api": {
      chapterPages: (id: string) => {
        asked.push(id);
        return new Promise((resolve) => waiting.set(id, resolve));
      },
    },
    "@/lib/manga/sources/suwayomi/auth-registry": { isSuwayomiServerUrl: () => false },
  });
  const job = downloads.downloadAllChapters("m", [{ chapterId: "c1" }, { chapterId: "c2" }]);
  await settle();
  assert.deepEqual(asked, ["c1"]);
  downloads.pauseMangaDownloadBatch("m");
  assert.equal(downloads.mangaDownloadBatchStatus("m").status, "paused");
  assert.equal(downloads.mangaDownloadStatus("c1").status, "paused");
  waiting.get("c1")!([]);
  await settle();
  assert.deepEqual(asked, ["c1"], "a paused batch does not start the next chapter");
  assert.equal(downloads.mangaDownloadStatus("c2").status, "idle");
  downloads.resumeMangaDownloadBatch("m");
  assert.equal(downloads.mangaDownloadBatchStatus("m").status, "downloading");
  await settle();
  assert.deepEqual(asked, ["c1", "c2"]);
  waiting.get("c2")!([]);
  await job;
  assert.deepEqual(downloads.mangaDownloadBatchStatus("m"), {
    status: "error",
    done: 0,
    total: 2,
    failed: 2,
  });

  // chapter-list.tsx is too large to render here; pin the button's wiring lines.
  const lines = new Set(
    readFileSync(new URL("../src/views/manga/manga-detail/chapter-list.tsx", import.meta.url), "utf8")
      .split(/\r?\n/)
      .map((line: string) => line.trim()),
  );
  for (const line of [
    "pauseMangaDownloadBatch(mangaId);",
    "resumeMangaDownloadBatch(mangaId);",
    '? t("Pause downloads")',
    '? t("Resume downloads")',
  ])
    assert.ok(lines.has(line), `chapter-list.tsx lacks: ${line}`);
});

test("Suwayomi browse results include alphabetical ordering", () => {
  const modes: string[] = [];
  const feedItems = [{ title: "beta" }, { title: "Alpha" }, { title: "Gamma" }];
  const browse = hookHarness(
    "src/views/manga/manga-sources-panel/suwayomi/browse-results.tsx",
    "BrowseResults",
    {
      "react/jsx-runtime": jsx,
      "lucide-react": icons,
      "@/components/icons/search-icon": { Search: "Search" },
      "@/lib/i18n": { useT: () => makeT().t },
      "../shared": { CARD: "card", INPUT: "input" },
      "./manga-grid": { MangaGrid: function MangaGrid() {}, MangaGridSkeleton: "Skeleton" },
      "./use-source-feed": {
        useSourceFeed: (_c: unknown, _s: string, mode: string) => {
          modes.push(mode);
          return { state: "ready", items: feedItems, hasNext: false };
        },
      },
    },
  );
  const props = { config, source: { id: "7", name: "S", supportsLatest: true }, onBack: () => {} };
  const titles = () =>
    named(nodes(browse.render(props)), "MangaGrid")[0].props.items.map((m: any) => m.title);
  assert.deepEqual(titles(), ["beta", "Alpha", "Gamma"]);
  const tab = named(nodes(browse.render(props)), "ModeTab").find((n) => n.props.children === "A-Z");
  tab!.props.onClick();
  assert.deepEqual(titles(), ["Alpha", "beta", "Gamma"]);
  assert.equal(modes.at(-1), "popular");
  assert.deepEqual(
    feedItems.map((m) => m.title),
    ["beta", "Alpha", "Gamma"],
  );
});

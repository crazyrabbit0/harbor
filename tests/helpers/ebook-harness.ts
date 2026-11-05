import * as fflate from "fflate";
import { hookHarness, loadModule } from "./hook-harness.ts";

type Vars = Record<string, unknown> | undefined;
export const t = (key: string, vars?: Vars) =>
  key.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name]));

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
export const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
export const icons = new Proxy({}, { get: (_target, name) => String(name) });
export const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];
export const text = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text((n as N).props?.children)
        : "";

export function loadEBookApi(): Record<string, any> {
  return loadModule("src/lib/ebook/api.ts", {
    "@/lib/anilist/client": { anilistRequest: async () => ({}) },
    "@/lib/anilist/relations": { animeRelations: async () => [] },
    "@/lib/i18n": { getUiLanguage: () => "en" },
    "@/lib/safe-fetch": {
      safeFetch: async () => {
        throw new Error("offline");
      },
    },
    "@/lib/storage-recovery": { setItemWithRecovery: () => true },
  });
}

export type FakePlugin = {
  id: string;
  name: string;
  enabled: boolean;
  impl: Record<string, (...args: any[]) => unknown>;
};

/** Loads providers.ts with fake plugin workers and a metadata lookup that finds nothing. */
export function loadEBookProviders(api: Record<string, any>, plugins: FakePlugin[]) {
  class PluginWorker {
    plugin: FakePlugin;
    constructor(plugin: FakePlugin) {
      this.plugin = plugin;
    }
    call(method: string, args: unknown[]) {
      return Promise.resolve(this.plugin.impl[method](...args));
    }
    dispose() {}
  }
  return loadModule("src/lib/ebook/providers.ts", {
    "./extensions": {
      loadEBookExtensions: async () => {},
      installedEBookPlugins: () => plugins,
      subscribeEBookExtensions: () => {},
    },
    "./api": { ...api, fetchEBookMetadata: async () => [] },
    "./epub": {},
    "./gutendex": {},
    "./sources": { listEBookSources: () => [] },
    "@/assets/gutenberg.png": { default: "gutenberg.png" },
    "@/lib/safe-fetch": { safeFetch: async () => ({ ok: false }) },
    "./translation": {},
    "./cache": {},
    "@/lib/manga/plugins/worker-host": { PluginWorker },
    "./chapter-locations": {},
    "./reader-state": {},
  });
}

/** Loads reader-state.ts over an in-memory store; `events` records dispatched window events. */
export function loadReaderState() {
  const store = new Map<string, string>();
  const events: CustomEvent[] = [];
  const localStorage = {
    get length() {
      return store.size;
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
  };
  const api = loadModule(
    "src/lib/ebook/reader-state.ts",
    {
      "@/lib/storage-recovery": {
        persistCritical: (key: string, value: string) => (store.set(key, value), true),
      },
      "./chapter-locations": {},
    },
    { localStorage, window: { dispatchEvent: (event: CustomEvent) => events.push(event) } },
  );
  return { api, store, events };
}

/** Loads offline-export.ts against a fake Tauri window, iframe printer and deterministic clock. */
export function loadOfflineExport(chapterCount: number) {
  const chapters = Array.from({ length: chapterCount }, (_, index) => ({
    id: `c${index + 1}`,
    title: `Chapter ${index + 1}`,
  }));
  const contentCalls: unknown[][] = [];
  const written: { path: string; bytes: Uint8Array }[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const printed: string[] = [];
  const html: string[] = [];
  const sections: string[] = [];
  let clock = 0;
  const iframe = {
    style: {},
    setAttribute() {},
    remove() {},
    contentDocument: {
      open() {},
      write: (value: string) => html.push(value),
      close() {},
      getElementById: () => ({
        insertAdjacentHTML: (_where: string, value: string) => sections.push(value),
      }),
    },
    contentWindow: {
      addEventListener() {},
      focus() {},
      print: () => printed.push("print"),
    },
  };
  class FileReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
      this.result = "data:image/png;base64,AA==";
      this.onload?.();
    }
  }
  const api = loadModule(
    "src/lib/ebook/offline-export.ts",
    {
      fflate,
      "@tauri-apps/api/path": { downloadDir: async () => "/downloads" },
      "@tauri-apps/plugin-fs": {
        exists: async () => false,
        mkdir: async () => {},
        writeFile: async (path: string, bytes: Uint8Array) => written.push({ path, bytes }),
      },
      "@/lib/i18n": { t },
      "@/lib/download/downloads-store": { enqueueManagedDownload: () => "id" },
      "@/lib/safe-fetch": {
        safeFetch: async () => ({
          ok: true,
          headers: { get: () => "image/png" },
          arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
        }),
      },
      "./providers": {
        sourceEBookChapters: async () => chapters,
        sourceEBookContent: async (...args: unknown[]) => {
          contentCalls.push(args);
          return { text: `Text of ${String(args[2])}\n\nSecond paragraph` };
        },
      },
    },
    {
      window: {
        __TAURI_INTERNALS__: {},
        setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
      },
      document: { createElement: () => iframe, body: { appendChild() {} } },
      performance: { now: () => (clock += 500) },
      requestAnimationFrame: (fn: () => void) => fn(),
      FileReader,
    },
  );
  return { api, contentCalls, written, timers, printed, html, sections };
}

/** Renders DownloadRow with the real downloads-format helpers. */
export function renderDownloadRow(item: Record<string, unknown>) {
  const format = loadModule("src/views/downloads/downloads-format.ts", { "@/lib/i18n": { t } });
  const noop = () => {};
  const h = hookHarness("src/views/downloads/download-row.tsx", "DownloadRow", {
    "lucide-react": icons,
    "@/components/icons/play-filled": { Play: "Play" },
    "@/components/download-action-icons": {
      DownloadCancelIcon: "DownloadCancelIcon",
      DownloadPauseResumeIcon: "DownloadPauseResumeIcon",
    },
    "@/components/poster": { Poster: "Poster", usePosterChain: () => ({ src: "" }) },
    "@/lib/settings": { useSettingsSelector: (pick: any) => pick({ rpdbKey: "" }) },
    "@/lib/view": { useViewActions: () => ({ openPlayer: noop }) },
    "@/lib/i18n": { useT: () => t },
    "@/lib/download/downloads-store": {
      cancelDownload: noop,
      pauseDownload: noop,
      removeDownload: noop,
      resumeDownload: noop,
      revealDownload: noop,
    },
    "./downloads-format": format,
    "react/jsx-runtime": jsx,
  });
  return h.render({ d: item });
}

type WheelOptions = {
  resume?: unknown;
  route?: string | null;
  detail?: Record<string, unknown> | null;
  chapters?: Record<string, unknown>[];
};

/** Renders the eBook wheel menu with recording mocks; call `render()` again after state changes. */
export function wheelHarness(ebook: Record<string, any>, options: WheelOptions = {}) {
  const calls = {
    detail: [] as string[],
    chapters: [] as string[],
    exports: [] as unknown[][],
    views: [] as string[],
    closed: 0,
  };
  const h = hookHarness(
    "src/views/ebook/ebook-wheel-menu.tsx",
    "EBookWheelMenu",
    {
      "lucide-react": icons,
      "react-dom": { createPortal: (node: unknown) => node },
      "@/components/lists/list-toast": { emitListToast: () => {} },
      "@/lib/ebook/library": {
        ebookInLibrary: () => false,
        eBookIsReadLater: () => false,
        toggleEBookLibrary: () => true,
        toggleEBookReadLater: () => true,
      },
      "@/lib/ebook/offline-export": {
        enqueueEBookExport: async (...args: unknown[]) => (calls.exports.push(args), "id"),
        sourceRouteForEBook: () => options.route ?? null,
      },
      "@/lib/ebook/providers": {
        sourceEBookDetail: async (route: string) => (calls.detail.push(route), options.detail),
        sourceEBookChapters: async (route: string) => (
          calls.chapters.push(route),
          options.chapters ?? []
        ),
      },
      "@/lib/ebook/reader-state": { loadEBookResume: () => options.resume ?? null },
      "@/lib/i18n": { useT: () => t },
      "@/lib/ebook/tracking": {
        getEBookTracking: () => ({ status: "PLANNING", progress: 0 }),
        saveEBookTracking: async () => {},
      },
      "@/lib/view": {
        useViewActions: () => ({ setView: (view: string) => calls.views.push(view) }),
      },
      "react/jsx-runtime": jsx,
    },
    {
      window: {
        innerWidth: 1280,
        innerHeight: 800,
        addEventListener() {},
        removeEventListener() {},
      },
      document: { body: {} },
    },
  );
  const props = {
    target: { ebook, x: 400, y: 300 },
    profile: "profile",
    onClose: () => calls.closed++,
    onOpenDetails: () => {},
    onStartReading: () => {},
  };
  const menuItems = (tree: unknown) =>
    all(tree).filter((node) => node.type === "button" && node.props.role === "menuitem");
  return { calls, render: () => h.render(props), menuItems };
}

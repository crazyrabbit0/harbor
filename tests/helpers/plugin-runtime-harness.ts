import { loadModule } from "./hook-harness.ts";

type Hooks = { outage: (text: string) => void; log: (level: string, text: string) => void };

// The real stream-plugin runtime over an Android extension whose run `behave` scripts; saves land in `saves`.
export function pluginRuntimeHarness(stored: Record<string, unknown> | null) {
  let record = stored;
  let script: (hooks: Hooks) => Promise<unknown> = async () => [];
  const saves: Record<string, unknown>[] = [];
  const mod = loadModule("src/lib/streams/plugins/runtime.ts", {
    "@/lib/manga/plugins/worker-host": { PluginWorker: class {} },
    "@/lib/debug": { dwarn() {} },
    "./extension/run": { runExtensionPlugin: async (...args: any[]) => script(args[4]) },
    "./gate": { acquire: async () => {}, release() {} },
    "./provider-compat/prelude": { PRELUDE_VERSION: 1 },
    "./source": { settingsFingerprint: () => "", workerPluginFor: (plugin: unknown) => plugin },
    "./store": {
      saveStreamPlugin: async (next: Record<string, unknown>) => {
        saves.push(next);
        record = next;
      },
      streamPluginById: () => record,
    },
  });
  const plugin = { id: "ext", name: "Ext", format: "android-extension", hash: "h" };
  const request = { title: "Dune", type: "movie", settings: {} };
  return {
    mod,
    saves,
    plugin,
    behave(fn: (hooks: Hooks) => Promise<unknown>) {
      script = fn;
    },
    go: () => mod.runStreamPlugin(plugin, request, new AbortController().signal, 1000),
  };
}

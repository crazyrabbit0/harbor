import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

type Profiler = typeof import("../src/lib/memory-profiler");

function load() {
  const compiled = ts.transpileModule(
    readFileSync(new URL("../src/lib/memory-profiler.ts", import.meta.url), "utf8"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const mocks: Record<string, unknown> = {
    "./fetch-bridge-stats": { bridgeRows: () => [], resetBridgeStats: () => {} },
    "./memory-dump-text": { buildDumpText: () => "" },
    "./native-memory": { getNativeMem: () => null, getRamTier: () => "mid" },
  };
  let baseCalls = 0;
  const baseFetch = async () => {
    baseCalls += 1;
    return new Response("ok");
  };
  const clicks = new Set<unknown>();
  const observers: { disconnected: boolean }[] = [];
  class FakeObserver {
    state = { disconnected: false };
    constructor() {
      observers.push(this.state);
    }
    observe() {}
    disconnect() {
      this.state.disconnected = true;
    }
  }
  const win = {
    fetch: baseFetch as typeof fetch,
    location: { href: "http://localhost/" },
    setInterval: () => 1,
  };
  const doc = {
    getElementsByTagName: () => [],
    images: [],
    addEventListener: (_t: string, fn: unknown) => clicks.add(fn),
    removeEventListener: (_t: string, fn: unknown) => clicks.delete(fn),
  };
  const api = {} as Profiler;
  new Function(
    "require",
    "exports",
    "window",
    "document",
    "PerformanceObserver",
    "console",
    "clearInterval",
    compiled,
  )(
    (id: string) => {
      assert.ok(id in mocks, `Unexpected import: ${id}`);
      return mocks[id];
    },
    api,
    win,
    doc,
    FakeObserver,
    { info() {}, groupCollapsed() {}, groupEnd() {}, table() {}, warn() {} },
    () => {},
  );
  return { api, win, clicks, observers, baseCalls: () => baseCalls };
}

test("reopening the profiler keeps one fetch wrapper and stopping releases its observers", async () => {
  const { api, win, clicks, observers, baseCalls } = load();
  api.startProfiler();
  const wrapped = win.fetch;
  api.stopProfiler();
  api.startProfiler();
  api.stopProfiler();
  api.startProfiler();
  assert.equal(win.fetch, wrapped, "start after stop must not wrap window.fetch again");
  await win.fetch("https://example.com/");
  assert.equal(baseCalls(), 1);
  api.stopProfiler();
  assert.equal(clicks.size, 0, "stop removes the click listener");
  assert.ok(
    observers.every((o) => o.disconnected),
    "stop disconnects every long-task observer",
  );
  const before = api.getSamples().length;
  await win.fetch("https://example.com/");
  assert.equal(api.getSamples().length, before, "a stopped profiler records nothing");
});

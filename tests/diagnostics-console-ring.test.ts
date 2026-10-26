import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

type Runtime = typeof import("../src/lib/diagnostics/collect-runtime");

function load() {
  const printed: unknown[][] = [];
  const fakeConsole = {
    log: (...args: unknown[]) => printed.push(args),
    info: (...args: unknown[]) => printed.push(args),
    warn: (...args: unknown[]) => printed.push(args),
    error: (...args: unknown[]) => printed.push(args),
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL("../src/lib/diagnostics/collect-runtime.ts", import.meta.url), "utf8"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const mocks: Record<string, unknown> = {
    "../fetch-bridge-stats": { bridgeRows: () => [], formatBridgeSection: () => [] },
    "../memory-profiler": {
      getInstrumentationSupport: () => ({ jsHeap: false, longTasks: false, nativeRss: false }),
    },
  };
  const api = {} as Runtime;
  new Function("require", "exports", "window", "console", "localStorage", compiled)(
    (id: string) => {
      assert.ok(id in mocks, `Unexpected import: ${id}`);
      return mocks[id];
    },
    api,
    {},
    fakeConsole,
    { length: 0, key: () => null, getItem: () => null },
  );
  return { api, console: fakeConsole, printed };
}

function consoleSection(text: string): string[] {
  return text.split("===== APP CONSOLE =====\n")[1]?.split("\n") ?? [];
}

test("objects are captured as text when logged; primitives are joined only at collection", () => {
  const h = load();
  const payload: Record<string, unknown> = { kind: "payload" };
  h.console.warn("loaded", 3, payload);
  payload.kind = "changed later";
  assert.deepEqual(h.printed, [["loaded", 3, payload]]);
  const lines = consoleSection(h.api.collectRuntime());
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\d{4}-\d\d-\d\dT[\d:.]+Z \[warn\] loaded 3 \{"kind":"payload"\}$/);
});

test("errors, strings and unserializable values keep the existing format", () => {
  const h = load();
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  h.console.error(new TypeError("boom"), "plain", circular);
  const [line] = consoleSection(h.api.collectRuntime());
  assert.match(line, /\[error\] TypeError: boom plain \[object Object\]$/);
});

test("an empty ring still reports no entries", () => {
  const h = load();
  assert.deepEqual(consoleSection(h.api.collectRuntime()), ["(no console entries)"]);
});

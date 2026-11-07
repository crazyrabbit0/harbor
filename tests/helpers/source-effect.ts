// Runs one `useEffect` callback from a module too large to load (App.tsx), with its free names supplied by the test.
import { readFileSync } from "node:fs";
import ts from "typescript";

/** Finds the `useEffect(...)` whose callback contains `marker` and compiles its callback and dependency list. */
export function sourceEffect(file: string, marker: string) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "useEffect" &&
      node.arguments[0]?.getText(source).includes(marker)
    )
      found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (found.length !== 1) throw new Error(`${found.length} effects in ${file} contain ${marker}`);
  const [callback, deps] = found[0].arguments.map((arg) => arg.getText(source));
  const js = ts.transpileModule(`exports.effect = ${callback};\nexports.deps = () => ${deps};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  /** Runs the effect against `scope`; returns its cleanup and its evaluated dependency list. */
  return (scope: Record<string, unknown>) => {
    const out: { effect?: () => unknown; deps?: () => unknown[] } = {};
    new Function("exports", ...Object.keys(scope), js)(out, ...Object.values(scope));
    const cleanup = out.effect!();
    return { cleanup: cleanup as (() => void) | undefined, deps: out.deps!() };
  };
}

/** A window stand-in that records listeners so a test can fire key events at them. */
export function listenerWindow() {
  const listeners: { type: string; fn: (e: any) => void; options: unknown }[] = [];
  return {
    listeners,
    window: {
      addEventListener: (type: string, fn: (e: any) => void, options?: unknown) =>
        listeners.push({ type, fn, options }),
      removeEventListener: (type: string, fn: (e: any) => void) => {
        const at = listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (at >= 0) listeners.splice(at, 1);
      },
      dispatchEvent() {},
    },
    fire(type: string, event: Record<string, unknown>) {
      for (const l of listeners.filter((entry) => entry.type === type)) l.fn(event);
    },
  };
}

/** A keyboard event that records preventDefault and stopPropagation. */
export function keyEvent(key: string, init: Record<string, unknown> = {}) {
  const event = {
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    target: { nodeType: 1, tagName: "BODY", isContentEditable: false, getAttribute: () => null },
    prevented: false,
    stopped: false,
    preventDefault() {
      event.prevented = true;
    },
    stopPropagation() {
      event.stopped = true;
    },
    ...init,
  };
  return event;
}

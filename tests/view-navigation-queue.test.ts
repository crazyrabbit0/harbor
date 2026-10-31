import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { navigateUnderPreview, previewPageStack } from "../src/lib/player/docked-navigation.ts";

const source = ts.createSourceFile(
  "view.tsx",
  readFileSync(new URL("../src/lib/view.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.ESNext,
  true,
  ts.ScriptKind.TSX,
);

function declaration(name: string): string {
  let text = "";
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) text = node.getText(source);
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      text = `const ${node.getText(source)};`;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(text, `Missing view declaration: ${name}`);
  return text;
}

// React state that applies updates later, like a batched render, and runs updaters twice like StrictMode.
function fixture(initial: any[]) {
  const stackRef = { current: initial };
  const forwardStackRef = { current: [] as any[] };
  const scrollMem = { current: new Map<string, unknown>() };
  const rowScrollMem = { current: new Map<string, number>() };
  let rendered = initial;
  const queue: unknown[] = [];
  const names = ["STACK_MAX", "pushFrame", "pop", "clearForwardStack", "setNavStack", "setView"];
  const code = ts.transpileModule(names.map(declaration).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const scope = {
    stackRef,
    forwardStackRef,
    scrollMem,
    rowScrollMem,
    navigateUnderPreview,
    previewPageStack,
    useCallback: (fn: any) => fn,
    consumeBack: () => false,
    setStack: (value: unknown) => queue.push(value),
    setForwardStack: () => {},
    setHomeResetTick: () => {},
    window: { dispatchEvent() {}, requestAnimationFrame() {}, setTimeout() {} },
    CustomEvent: class {
      constructor(_name: string, _options: unknown) {}
    },
  };
  const nav = new Function(...Object.keys(scope), `${code}\nreturn {setView, pop, setNavStack};`)(
    ...Object.values(scope),
  );
  const flush = () => {
    for (const update of queue.splice(0)) {
      if (typeof update === "function") {
        update(rendered);
        rendered = update(rendered);
      } else rendered = update as any[];
    }
    return rendered;
  };
  return { ...nav, flush, scrollMem };
}

test("a pop after a queued navigation keeps both changes", () => {
  const home = { kind: "home" };
  const meta = { kind: "meta", meta: { id: "a" } };
  const h = fixture([home, meta]);
  h.setNavStack((s: any[]) => [...s, { kind: "person", id: 1 }]);
  h.pop();
  assert.deepEqual(h.flush(), [home, meta]);
});

test("two queued navigations both apply in order", () => {
  const h = fixture([{ kind: "home" }]);
  h.setNavStack((s: any[]) => [...s, { kind: "person", id: 1 }]);
  h.setNavStack((s: any[]) => [...s, { kind: "person", id: 2 }]);
  assert.deepEqual(
    h.flush().map((f: any) => f.id ?? f.kind),
    ["home", 1, 2],
  );
});

test("a root navigation clears scroll memory once, outside React's updater", () => {
  const h = fixture([{ kind: "home" }, { kind: "meta", meta: { id: "a" } }]);
  h.scrollMem.current.set("meta:a", { fallback: 10 });
  h.setView("movies");
  h.scrollMem.current.set("movies", { fallback: 20 });
  h.flush();
  assert.equal(h.scrollMem.current.get("movies") !== undefined, true, "flush must not clear again");
});

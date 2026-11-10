import { readFileSync } from "node:fs";
import ts from "typescript";
import { treeHarness } from "./tree-render";

/** Runs a hook or component as one render pass per `render()` on the shared fake React of `tree-render.ts`. */
export function hookHarness(
  file: string,
  exportName: string,
  mocks: Record<string, any>,
  globals: Record<string, any> = {},
  /** Module-local functions to make renderable as exports (e.g. a private child component). */
  expose: string[] = [],
) {
  const harness = treeHarness(file, mocks, { globals, expose, deferLazy: true, mockJsx: true });
  return {
    exports: harness.exports,
    render: (args?: any) => harness.run(() => harness.exports[exportName](args)),
    unmount: () => harness.unmount(),
  };
}

/** Compiles a module with mocked imports (dynamic `import()` included) and returns its exports. */
export function loadModule(
  file: string,
  mocks: Record<string, any>,
  globals: Record<string, any> = {},
  /** Module-local functions to expose alongside the exports. */
  expose: string[] = [],
): Record<string, any> {
  const output =
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText + expose.map((name) => `\nexports.${name} = ${name};`).join("");
  const api: any = {};
  new Function("require", "exports", ...Object.keys(globals), output)(
    (name: string) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
      return mocks[name];
    },
    api,
    ...Object.values(globals),
  );
  return api;
}

export const flushPromises = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

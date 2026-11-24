// Runs one function declared inside a large view (`const name = (...) => ...`), JSX included, with its free names from `scope`.
import { readFileSync } from "node:fs";
import ts from "typescript";

type Element = { type: unknown; props: Record<string, any> };
const element = (type: unknown, props: Record<string, any>): Element => ({ type, props });
const jsxRuntime = { jsx: element, jsxs: element, Fragment: "Fragment" };

/** Compiles the initializer of the first `const <name>` in `file` and returns it bound to `scope`. */
export function sourceFunction(file: string, name: string, scope: Record<string, unknown>): any {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name)
      found ??= node.initializer;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found) throw new Error(`no const ${name} in ${file}`);
  const code = ts.transpileModule(`exports.value = ${found.getText(source)};`, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const out: { value?: unknown } = {};
  const require = (id: string) => {
    if (id === "react/jsx-runtime") return jsxRuntime;
    throw new Error(`Unexpected dependency ${id}`);
  };
  new Function("require", "exports", ...Object.keys(scope), code)(
    require,
    out,
    ...Object.values(scope),
  );
  return out.value;
}

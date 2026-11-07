import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

type Pick = (node: ts.Node, source: ts.SourceFile) => ts.Node | undefined;

/** Evaluates the first expression `pick` selects in a large view, with `scope` as its free names. */
export function sourceCallback(file: string, pick: Pick, scope: Record<string, unknown>): any {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    found ??= pick(node, source);
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(found, `no matching expression in ${file}`);
  const code = ts.transpileModule(`return (${found.getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return new Function(...Object.keys(scope), code)(...Object.values(scope));
}

/** Picks the first argument of the hook call that initializes `const <name>`. */
export const hookArgument =
  (name: string): Pick =>
  (node, source) =>
    ts.isVariableDeclaration(node) &&
    node.name.getText(source) === name &&
    node.initializer &&
    ts.isCallExpression(node.initializer)
      ? node.initializer.arguments[0]
      : undefined;

/** Picks the first argument of a `callee(...)` call whose callback text contains `marker`. */
export const callbackContaining =
  (callee: string, marker: string): Pick =>
  (node, source) =>
    ts.isCallExpression(node) &&
    node.expression.getText(source) === callee &&
    node.arguments[0]?.getText(source).includes(marker)
      ? node.arguments[0]
      : undefined;

/** Picks the first argument of a `useEffect` whose callback text contains `marker`. */
export const effectContaining = (marker: string): Pick => callbackContaining("useEffect", marker);

/** Picks the value of JSX attribute `attr` on the first `<tag>` element. */
export const jsxAttribute =
  (tag: string, attr: string): Pick =>
  (node, source) => {
    if (!ts.isJsxAttribute(node) || node.name.getText(source) !== attr) return undefined;
    const owner = node.parent.parent;
    if (!ts.isJsxSelfClosingElement(owner) && !ts.isJsxOpeningElement(owner)) return undefined;
    if (owner.tagName.getText(source) !== tag) return undefined;
    return node.initializer && ts.isJsxExpression(node.initializer)
      ? node.initializer.expression
      : undefined;
  };

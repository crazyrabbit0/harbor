import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadDedupe() {
  const source = readFileSync("src/lib/safe-fetch.ts", "utf8");
  const ast = ts.createSourceFile("safe-fetch.ts", source, ts.ScriptTarget.Latest, true);
  const picked = ast.statements.filter(
    (node) =>
      (ts.isFunctionDeclaration(node) &&
        ["sharedGetKey", "dedupedGet"].includes(node.name?.text ?? "")) ||
      (ts.isVariableStatement(node) &&
        node.declarationList.declarations.some((d) => d.name.getText(ast) === "inflightGets")),
  );
  assert.equal(picked.length, 3);
  const code = ts
    .transpileModule(picked.map((node) => node.getText(ast)).join("\n"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(/^export /gm, "");
  return new Function(`${code}; return dedupedGet;`)() as (
    url: string,
    init: RequestInit | undefined,
    run: (url: string, init?: RequestInit) => Promise<Response>,
  ) => Promise<Response>;
}

test("identical concurrent GETs share one request and each caller reads its own body", async () => {
  const dedupedGet = loadDedupe();
  let calls = 0;
  const run = async () => {
    calls += 1;
    return new Response("payload");
  };
  const [a, b] = await Promise.all([
    dedupedGet("https://example.com/a", undefined, run),
    dedupedGet("https://example.com/a", { headers: { accept: "x" } }, run),
  ]);
  assert.equal(calls, 2, "different headers are different requests");
  const [c, d] = await Promise.all([
    dedupedGet("https://example.com/a", undefined, run),
    dedupedGet("https://example.com/a", undefined, run),
  ]);
  assert.equal(calls, 3);
  assert.equal(await c.text(), "payload");
  assert.equal(await d.text(), "payload");
  assert.equal(await a.text(), "payload");
  assert.equal(await b.text(), "payload");
  await dedupedGet("https://example.com/a", undefined, run);
  assert.equal(calls, 4, "a settled request is not reused");
});

test("requests with a signal, a body or a non-GET method never share", async () => {
  const dedupedGet = loadDedupe();
  let calls = 0;
  const run = async () => {
    calls += 1;
    return new Response("x");
  };
  const signal = new AbortController().signal;
  await Promise.all([
    dedupedGet("https://example.com/b", { signal }, run),
    dedupedGet("https://example.com/b", { signal }, run),
    dedupedGet("https://example.com/b", { method: "POST" }, run),
    dedupedGet("https://example.com/b", { method: "POST" }, run),
  ]);
  assert.equal(calls, 4);
});

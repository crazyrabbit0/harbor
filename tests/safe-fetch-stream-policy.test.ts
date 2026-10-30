import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { hasSensitiveRequestHeaders } from "../src/lib/fetch-fallback-policy.ts";

type PluginCall = { url: string; init: RequestInit & { maxRedirections?: number } };

function loadStream(plugin: (url: string, init: PluginCall["init"]) => Promise<Response>) {
  const source = readFileSync("src/lib/safe-fetch.ts", "utf8");
  const ast = ts.createSourceFile("safe-fetch.ts", source, ts.ScriptTarget.Latest, true);
  const wanted = ["urlOf", "withDeadline", "HARBOR_FETCH_DEADLINE_MS", "safeFetchStream"];
  const picked = ast.statements.filter(
    (node) =>
      (ts.isFunctionDeclaration(node) && wanted.includes(node.name?.text ?? "")) ||
      (ts.isVariableStatement(node) &&
        node.declarationList.declarations.some((d) => wanted.includes(d.name.getText(ast)))),
  );
  assert.equal(picked.length, 4);
  const code = ts
    .transpileModule(picked.map((node) => node.getText(ast)).join("\n"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(/^export /gm, "");
  const scope = {
    isTauri: true,
    isBlockedUrl: () => false,
    noteBlocked: () => {},
    TrackerBlockedError: Error,
    hasSensitiveRequestHeaders,
    rewriteForWeb: (url: string, init?: RequestInit) => ({ url, init }),
    pluginHttpFetch: (input: RequestInfo | URL, init: PluginCall["init"]) =>
      plugin(String(input instanceof Request ? input.url : input), init),
  };
  return new Function(...Object.keys(scope), `${code}; return safeFetchStream;`)(
    ...Object.values(scope),
  ) as typeof fetch;
}

test("a credentialed stream request never follows redirects on the plugin path", async () => {
  const calls: PluginCall[] = [];
  const stream = loadStream(async (url, init) => {
    calls.push({ url, init });
    return new Response("ok");
  });
  await stream("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  });
  await stream("https://www.youtube.com/feeds/videos.xml?channel_id=x");
  assert.equal(calls[0].init.maxRedirections, 0);
  assert.equal(calls[1].init.maxRedirections, undefined, "public feeds keep redirects");
});

test("a credentialed stream request over plain HTTP is refused before any request", async () => {
  let called = false;
  const stream = loadStream(async () => {
    called = true;
    return new Response("ok");
  });
  await assert.rejects(
    stream("http://api.example.com/x", { headers: { "X-API-Key": "secret" } }),
    /HTTPS/,
  );
  assert.equal(called, false);
});

test("the caller's abort and the deadline both settle the stream request", async () => {
  let seen: AbortSignal | undefined;
  const stream = loadStream(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        seen = init.signal ?? undefined;
        init.signal?.addEventListener("abort", () => reject(new Error("plugin aborted")));
      }),
  );
  const controller = new AbortController();
  const pending = stream("https://www.youtube.com/feeds/videos.xml", {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, (e: Error) => e.name === "AbortError");
  assert.equal(seen?.aborted, true, "the plugin request is cancelled too");
});

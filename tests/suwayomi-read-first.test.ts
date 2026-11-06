// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises } from "./helpers/hook-harness.ts";
import { suwayomiStack, type FakeClient } from "./helpers/manga-harness.ts";

const BASE = "http://srv";

function scripted(reply: (query: string) => unknown, rest: Record<string, unknown> = {}) {
  const queries: string[] = [];
  const got: string[] = [];
  const client: FakeClient = {
    server: { base: BASE },
    async getJson(path) {
      got.push(path);
      return path in rest ? rest[path] : null;
    },
    getOk: async () => true,
    deleteOk: async () => true,
    async postJson(_path, body) {
      queries.push(body.query);
      return reply(body.query) ?? null;
    },
    probeStatus: async () => 200,
  };
  return { client, queries, got, stack: suwayomiStack(client) };
}

const has = (queries: string[], needle: string) => queries.findIndex((q) => q.includes(needle));

test("saved manga detail reads the server DB before any live source fetch", async () => {
  const cached = { id: 5, title: "Cached", sourceId: "7", initialized: true };
  const warm = scripted((q) => (q.includes("manga(id: 5)") ? { data: { manga: cached } } : null));
  assert.deepEqual(await warm.stack.graphql.gqlManga(warm.client, "5"), cached);
  assert.equal(has(warm.queries, "fetchMangaAndChapters"), -1, "an initialized row is final");

  const cold = scripted((q) => {
    if (q.includes("fetchMangaAndChapters"))
      return { data: { fetchMangaAndChapters: { manga: { id: 5, title: "Live" } } } };
    return { data: { manga: { id: 5, title: "Stub", initialized: false } } };
  });
  assert.equal((await cold.stack.graphql.gqlManga(cold.client, "5")).title, "Live");
  const query = has(cold.queries, "manga(id: 5)");
  const mutation = has(cold.queries, "fetchMangaAndChapters");
  assert.ok(query >= 0 && mutation > query, "live fetch is only the fallback");

  const failed = scripted((q) =>
    q.includes("fetchMangaAndChapters") ? null : { data: { manga: { id: 5, initialized: false } } },
  );
  assert.equal((await failed.stack.graphql.gqlManga(failed.client, "5")).id, 5);
});

test("saved manga chapters read the server DB before any live source fetch", async () => {
  const node = (id: number, name: string) => ({ id, name, chapterNumber: id, pageCount: 3 });
  const warm = scripted((q) =>
    q.includes("chapters(condition: { mangaId: 5 })")
      ? { data: { chapters: { nodes: [node(11, "Cached")] } } }
      : null,
  );
  const cached = await warm.stack.graphql.gqlChapters(warm.client, "5");
  assert.deepEqual(
    cached.map((c: any) => [c.key, c.name]),
    [["11", "Cached"]],
  );
  assert.equal(has(warm.queries, "fetchChapters(input:"), -1, "a filled DB is never re-primed");

  const empty = scripted((q) =>
    q.includes("fetchChapters(input:")
      ? { data: { fetchChapters: { chapters: [node(12, "Primed")] } } }
      : { data: { chapters: { nodes: [] } } },
  );
  const primed = await empty.stack.graphql.gqlChapters(empty.client, "5");
  assert.deepEqual(
    primed.map((c: any) => c.key),
    ["12"],
  );
  const query = has(empty.queries, "chapters(condition: { mangaId: 5 })");
  const mutation = has(empty.queries, "fetchChapters(input:");
  assert.ok(query >= 0 && mutation > query, "fetchChapters is only the empty-DB prime fallback");
});

test("graphql failures still fall through to REST", async () => {
  const dead = scripted(() => null);
  await assert.rejects(dead.stack.graphql.gqlManga(dead.client, "5"), /suwayomi_graphql_error/);
  await assert.rejects(dead.stack.graphql.gqlChapters(dead.client, "5"), /suwayomi_graphql_error/);

  // The server answers the REST source list empty and GraphQL only for aboutServer, so it picks GraphQL first.
  const mixed = scripted(
    (q) => (q.includes("aboutServer") ? { data: { aboutServer: { version: "1" } } } : null),
    {
      "/api/v1/source/list": [],
      "/api/v1/manga/5/full": { id: 5, title: "From REST" },
    },
  );
  const detail = await mixed.stack.provider.detail("7~5");
  assert.equal(detail.title, "From REST");
  assert.ok(has(mixed.queries, "manga(id: 5)") >= 0, "GraphQL was tried first");
  await flushPromises();
});

test("refs with an empty sourceId still decode (fetch only needs mangaId)", () => {
  const { model } = suwayomiStack(scripted(() => null).client);
  assert.deepEqual(model.decodeMangaId("~5"), { sourceId: "", mangaId: "5" });
  assert.deepEqual(model.decodeChapterId("~5~k"), { sourceId: "", mangaId: "5", key: "k" });
  assert.equal(model.decodeMangaId("7~"), null);
  assert.equal(model.decodeMangaId("nodelimiter"), null);
  assert.equal(model.decodeChapterId("7~5~"), null);
  assert.equal(model.decodeChapterId("7~~k"), null);
});

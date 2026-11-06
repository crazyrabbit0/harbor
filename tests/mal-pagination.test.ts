// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import { MAL_API_BASE } from "../src/lib/mal/config.ts";
import { resolveMalRequestUrl } from "../src/lib/mal/url.ts";
import { loadModule } from "./helpers/hook-harness.ts";

type Reply = { status: number; body?: unknown };

function malClient(replies: Reply[], refreshed: { accessToken: string } | null = null) {
  const calls: { url: string; authorization: string | undefined }[] = [];
  const queue = [...replies];
  const response = ({ status, body }: Reply) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => "",
  });
  const safeFetch = async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, authorization: init.headers["Authorization"] });
    return response(queue.shift() ?? { status: 500 });
  };
  const client = loadModule("src/lib/mal/client.ts", {
    "@/lib/safe-fetch": { safeFetch },
    "./config": { MAL_API_BASE },
    "./session": { getSession: () => ({ accessToken: "old", userName: "me" }) },
    "./url": { resolveMalRequestUrl },
    "./auth": { ensureRefreshed: async () => refreshed },
  });
  return { client, calls };
}

test("keeps absolute MyAnimeList pagination URLs intact", () => {
  const nextPage = `${MAL_API_BASE}/users/@me/animelist?offset=1000&limit=1000`;

  assert.equal(resolveMalRequestUrl(MAL_API_BASE, nextPage), nextPage);
});

test("prefixes relative MyAnimeList API paths", () => {
  assert.equal(
    resolveMalRequestUrl(MAL_API_BASE, "/users/@me/animelist?limit=1000"),
    `${MAL_API_BASE}/users/@me/animelist?limit=1000`,
  );
});

test("the paginating client requests an absolute next-page URL as is", async () => {
  const nextPage = `${MAL_API_BASE}/users/@me/animelist?offset=1000&limit=1000`;
  const { client, calls } = malClient([{ status: 200, body: { ok: true } }]);

  await client.malRequest(nextPage);

  assert.deepEqual(
    calls.map((c) => c.url),
    [nextPage],
  );
});

test("the paginating client resolves the URL again for the retry after a token refresh", async () => {
  const nextPage = `${MAL_API_BASE}/users/@me/animelist?offset=1000&limit=1000`;
  const { client, calls } = malClient([{ status: 401 }, { status: 200, body: { ok: true } }], {
    accessToken: "new",
  });

  await client.malRequest(nextPage);

  assert.deepEqual(
    calls.map((c) => c.url),
    [nextPage, nextPage],
  );
  assert.deepEqual(
    calls.map((c) => c.authorization),
    ["Bearer old", "Bearer new"],
  );
});

test("a relative path is prefixed with the API base on the first request", async () => {
  const { client, calls } = malClient([{ status: 200, body: { ok: true } }]);

  await client.malRequest("/users/@me/animelist?limit=1000");

  assert.equal(calls[0].url, `${MAL_API_BASE}/users/@me/animelist?limit=1000`);
});

test("the list loop feeds paging.next straight back into the next request", async () => {
  const nextPage = `${MAL_API_BASE}/users/@me/animelist?offset=1000&limit=1000`;
  const node = (id: number, status: string) => ({
    node: {
      id,
      title: `Anime ${id}`,
      main_picture: null,
      alternative_titles: null,
      num_episodes: 12,
      mean: 7,
      media_type: "tv",
      my_list_status: {
        status,
        score: 0,
        num_episodes_watched: 0,
        is_rewatching: false,
        updated_at: "2026-01-01T00:00:00+00:00",
      },
    },
  });
  const { client, calls } = malClient([
    { status: 200, body: { data: [node(1, "watching")], paging: { next: nextPage } } },
    { status: 200, body: { data: [node(2, "completed")], paging: {} } },
  ]);
  const lists = loadModule("src/lib/mal/lists.ts", {
    "@/lib/active-profile-id": { activeProfileId: () => "p1" },
    "./client": client,
    "./session": { getSession: () => ({ userName: "me" }) },
  });

  const groups = await lists.fetchMalList();

  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.startsWith(`${MAL_API_BASE}/users/@me/animelist?`));
  assert.equal(calls[1].url, nextPage);
  assert.deepEqual(
    groups.map((g: { status: string; entries: { anime: { id: number } }[] }) => [
      g.status,
      g.entries.map((e) => e.anime.id),
    ]),
    [
      ["watching", [1]],
      ["completed", [2]],
    ],
  );
});

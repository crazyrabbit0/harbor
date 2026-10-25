import assert from "node:assert/strict";
import test from "node:test";

const host = { location: { hostname: "harbor.local" } };
(globalThis as unknown as { window: typeof host }).window = host;

let calls = 0;
let status = 200;
let release: () => void = () => {};

globalThis.fetch = (async (input: RequestInfo | URL) => {
  calls += 1;
  const url = String(input);
  await new Promise<void>((resolve) => {
    release = resolve;
  });
  if (status !== 200) return new Response("fail", { status });
  const body = { metas: [{ id: `tt${calls}`, type: "movie", name: url }] };
  return new Response(JSON.stringify(body), { status: 200 });
}) as typeof fetch;

const { topMovies } = await import("../src/lib/cinemeta.ts");

test("concurrent catalog callers share one request and get their own arrays", async () => {
  calls = 0;
  const a = topMovies("Drama");
  const b = topMovies("Drama");
  await new Promise((r) => setTimeout(r, 0));
  release();
  const [left, right] = await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.deepEqual(left, right);
  assert.notEqual(left, right);
  left.pop();
  const again = await topMovies("Drama");
  assert.equal(calls, 1);
  assert.equal(again.length, 1);
});

test("failed catalog responses are not cached", async () => {
  calls = 0;
  status = 500;
  const first = topMovies("Horror");
  await new Promise((r) => setTimeout(r, 0));
  release();
  assert.deepEqual(await first, []);
  status = 200;
  const second = topMovies("Horror");
  await new Promise((r) => setTimeout(r, 0));
  release();
  assert.equal((await second).length, 1);
  assert.equal(calls, 2);
});

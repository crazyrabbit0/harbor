import assert from "node:assert/strict";
import test from "node:test";
import { createRequestScheduler } from "../src/lib/request-scheduler";
import { flushPromises, loadModule } from "./helpers/hook-harness.ts";

const DEADLINE_MS = 15000;
const never = () => new Promise<never>(() => {});

/** tmdb-client over a scripted fetch: `headersAt`/`bodyAt` are ms after the request, null never answers. */
function client({ headersAt, bodyAt }: { headersAt: number | null; bodyAt: number | null }) {
  const signals: AbortSignal[] = [];
  const later = <T>(ms: number | null, value: () => T) =>
    ms == null ? never() : new Promise<T>((resolve) => setTimeout(() => resolve(value()), ms));
  const mod = loadModule("src/lib/providers/tmdb/tmdb-client.ts", {
    "@/lib/safe-fetch": {
      // Abort is recorded but never acted on, as a transport that ignores its signal would.
      safeFetch: (_url: string, init: { signal: AbortSignal }) => {
        signals.push(init.signal);
        return later(headersAt, () => ({
          ok: true,
          status: 200,
          arrayBuffer: () => later(bodyAt, () => new TextEncoder().encode('{"id":1}').buffer),
        }));
      },
    },
    "@/lib/request-scheduler": { createRequestScheduler },
    "./tmdb-catalog-cache": {
      createCatalogCache: () => ({ get: () => undefined, set() {} }),
      createPersistentCatalog: () => ({ read: async () => null, write() {} }),
      isCatalogPath: () => false,
      isTitlePath: () => false,
    },
  });
  let settled = false;
  let value: unknown;
  const pending = mod.get("key", "search/movie", { query: "q" }).then((v: unknown) => {
    settled = true;
    value = v;
  });
  return { signals, pending, state: () => ({ settled, value }) };
}

async function advance(t: { mock: { timers: { tick(ms: number): void } } }, ms: number) {
  await flushPromises();
  t.mock.timers.tick(ms);
  await flushPromises();
}

test("the TMDB request deadline covers the response body, not only the headers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const c = client({ headersAt: 100, bodyAt: null });
  await advance(t, DEADLINE_MS - 1);
  assert.equal(
    c.state().settled,
    false,
    "a stalled body keeps the request open until the deadline",
  );
  await advance(t, 1);
  assert.deepEqual(c.state(), { settled: true, value: null });
  assert.equal(c.signals[0].aborted, true, "the stalled body read is aborted");
});

test("the TMDB transport keeps one deadline and never releases it at the headers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const slow = client({ headersAt: 10000, bodyAt: 10000 });
  await advance(t, 10000);
  await advance(t, DEADLINE_MS - 10000);
  assert.deepEqual(
    slow.state(),
    { settled: true, value: null },
    "headers do not restart the clock",
  );
  assert.equal(slow.signals.length, 1, "a timeout is not retried");

  const quick = client({ headersAt: 5000, bodyAt: 5000 });
  await advance(t, 5000);
  await advance(t, 5000);
  assert.deepEqual(quick.state(), { settled: true, value: { id: 1 } });
  assert.equal(quick.signals[0].aborted, false, "a response inside the deadline is not aborted");
  await advance(t, DEADLINE_MS);
  assert.equal(quick.signals[0].aborted, false, "the deadline is released once the body arrives");
});

test("the deadline settles on its own timer rather than relying on abort propagation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const c = client({ headersAt: null, bodyAt: null });
  await advance(t, DEADLINE_MS);
  assert.deepEqual(c.state(), { settled: true, value: null });
  assert.equal(c.signals[0].aborted, true);
});

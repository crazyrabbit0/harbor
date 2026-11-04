import assert from "node:assert/strict";
import test from "node:test";

import { firstInOrder } from "../src/lib/first-in-order.ts";

const later = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const failLater = (ms: number) =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error("down")), ms));

test("an earlier base wins even when a later base answers first", async () => {
  const result = await firstInOrder([later(30, "first"), later(1, "second")]);
  assert.equal(result, "first");
});

test("a later base wins only after every earlier base failed or was empty", async () => {
  const result = await firstInOrder<string>([failLater(20), later(5, null), later(1, "third")]);
  assert.equal(result, "third");
});

test("all bases run together, so the answer arrives when the slowest one settles", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let result: string | null | undefined;
  void firstInOrder([later(40, null), later(40, null), later(40, "c")]).then((r) => (result = r));
  t.mock.timers.tick(40);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(result, "c", "three 40 ms bases finish at 40 ms, not 120 ms");
});

test("returns null when no base has a usable result", async () => {
  assert.equal(await firstInOrder<string>([later(1, null), failLater(1)]), null);
});

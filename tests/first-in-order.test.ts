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

test("all bases are started together rather than one after another", async () => {
  const started: number[] = [];
  const t0 = Date.now();
  const task = (ms: number, value: string | null) => {
    started.push(Date.now() - t0);
    return later(ms, value);
  };
  const result = await firstInOrder([task(40, null), task(40, null), task(40, "c")]);
  assert.equal(result, "c");
  assert.ok(Date.now() - t0 < 110, "three 40 ms bases finish in about 40 ms, not 120 ms");
  assert.ok(started.every((ms) => ms < 10));
});

test("returns null when no base has a usable result", async () => {
  assert.equal(await firstInOrder<string>([later(1, null), failLater(1)]), null);
});

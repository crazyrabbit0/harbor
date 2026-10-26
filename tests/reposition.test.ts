import assert from "node:assert/strict";
import test from "node:test";

type Listener = (event: Event) => void;

const listeners = new Map<string, Set<Listener>>();
const frames = new Map<number, () => void>();
let nextFrame = 0;

Object.assign(globalThis, {
  window: {
    addEventListener: (type: string, fn: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: Listener) => listeners.get(type)?.delete(fn),
  },
  requestAnimationFrame: (fn: () => void) => {
    nextFrame += 1;
    frames.set(nextFrame, fn);
    return nextFrame;
  },
  cancelAnimationFrame: (id: number) => frames.delete(id),
});

const { trackReposition } = await import("../src/lib/reposition.ts");

const fire = (type: string, target: unknown = {}) => {
  for (const fn of listeners.get(type) ?? []) fn({ type, target } as unknown as Event);
};
const flush = () => {
  const due = [...frames.values()];
  frames.clear();
  for (const fn of due) fn();
};

test("several scroll and resize events in one frame run the callback once", () => {
  let calls = 0;
  const untrack = trackReposition(() => (calls += 1));
  fire("scroll");
  fire("scroll");
  fire("resize");
  assert.equal(calls, 0);
  flush();
  assert.equal(calls, 1);
  fire("scroll");
  flush();
  assert.equal(calls, 2);
  untrack();
});

test("accept filters out scroll events it rejects", () => {
  let calls = 0;
  const inside = {};
  const untrack = trackReposition(
    () => (calls += 1),
    (event) => event.target !== inside,
  );
  fire("scroll", inside);
  flush();
  assert.equal(calls, 0);
  untrack();
});

test("cleanup removes the listeners and cancels a pending frame", () => {
  let calls = 0;
  const untrack = trackReposition(() => (calls += 1));
  fire("scroll");
  assert.equal(frames.size, 1);
  untrack();
  assert.equal(frames.size, 0);
  assert.equal(listeners.get("scroll")?.size, 0);
  assert.equal(listeners.get("resize")?.size, 0);
  fire("scroll");
  flush();
  assert.equal(calls, 0);
});

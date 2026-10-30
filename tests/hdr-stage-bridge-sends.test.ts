import assert from "node:assert/strict";
import test from "node:test";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

test("the HDR stage receives the player state only when it changes", async () => {
  const sent: unknown[] = [];
  const listeners = new Map<string, (event: { payload: unknown }) => void>();
  const intervals: Array<() => void> = [];
  const window = {
    __TAURI_INTERNALS__: {},
    setInterval: (fn: () => void) => intervals.push(fn),
    clearInterval: () => {},
  };
  const harness = hookHarness(
    "src/views/player/hdr-stage-bridge.tsx",
    "HdrStageBridge",
    {
      "@/lib/hdr-overlay": {
        hdrOverlayEmitProps: async (payload: unknown) => void sent.push(payload),
      },
      "@/lib/view": { usePlayerNavigation: () => ({}) },
      "@/lib/player/subtitle-fps": { buildSubtitleTimingMediaKey: () => "key" },
      "@tauri-apps/api/event": {
        listen: async (event: string, fn: (e: { payload: unknown }) => void) => {
          listeners.set(event, fn);
          return () => listeners.delete(event);
        },
        emitTo: async () => {},
      },
    },
    { window },
  );
  const payload = (time: number) => ({ snap: { time }, src: { url: "u", meta: { id: "m" } } });
  harness.render({ active: true, payload: payload(1), handlers: {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
  assert.equal(sent.length, 1, "the first payload goes out once listeners are ready");

  harness.render({ active: true, payload: payload(1), handlers: {} });
  for (const tick of intervals) tick();
  assert.equal(sent.length, 1, "an equal payload in a new object is not re-sent");

  harness.render({ active: true, payload: payload(2), handlers: {} });
  assert.equal(sent.length, 2, "a changed payload is sent");

  listeners.get("hdr-stage://request")?.({ payload: {} });
  assert.equal(sent.length, 3, "the stage asking again always gets the state");
});

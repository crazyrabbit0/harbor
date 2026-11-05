// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"]) => ({ type, props });
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];

// Renders the overlay on mpv, lets its first poll settle, and returns the requested props and rows.
async function renderStats(values: Record<string, number>) {
  const requested: string[] = [];
  const h = hookHarness(
    "src/components/player/stats-overlay.tsx",
    "StatsOverlay",
    {
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
      "@tauri-apps/api/core": {
        invoke: async (_command: string, { name }: { name: string }) => {
          requested.push(name);
          if (!(name in values)) throw new Error("Property unavailable");
          return values[name];
        },
      },
      "@/lib/i18n": { useT: () => (value: string) => value },
      "@/lib/visibility": { usePageVisible: () => true },
    },
    { window: { __TAURI_INTERNALS__: {}, setInterval: () => 1, clearInterval: () => {} } },
  );
  const props = {
    snap: { audioTracks: [], subtitleTracks: [], rate: 1, volume: 1 },
    engine: "mpv",
  };
  h.render(props);
  await flushPromises();
  const rows = new Map(
    all(h.render(props))
      .filter((n) => n.props.className?.includes("justify-between"))
      .map((row) => {
        const [dt, dd] = row.props.children as N[];
        return [dt.props.children, dd.props.children] as const;
      }),
  );
  h.unmount();
  return { requested, drops: rows.get("Dropped (decode / vo)") };
}

test("playback stats distinguish decoder drops from video-output drops", async () => {
  const result = await renderStats({ "decoder-frame-drop-count": 3, "frame-drop-count": 7 });
  assert.ok(result.requested.includes("decoder-frame-drop-count"));
  assert.ok(result.requested.includes("frame-drop-count"));
  assert.ok(!result.requested.includes("vo-drop-frame-count"));
  assert.equal(result.drops, "3 / 7");
});

test("unavailable drop counters are not reported as measured zero", async () => {
  assert.equal((await renderStats({ "frame-drop-count": 7 })).drops, "— / 7");
  assert.equal((await renderStats({ "decoder-frame-drop-count": 3 })).drops, "3 / —");
  assert.equal((await renderStats({})).drops, undefined, "no counters, no row");
});

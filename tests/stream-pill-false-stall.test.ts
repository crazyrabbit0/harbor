// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { emptySnapshot, type PlayerSnapshot } from "../src/lib/player/bridge.ts";
import { resolveStreamPillVariant } from "../src/views/player/hooks/use-stream-pill.ts";
import { hookHarness } from "./helpers/hook-harness.ts";

const base = {
  dismissed: false,
  pillSuppressed: false,
  pipMode: false,
  showWaiting: false,
  isLocalSrc: false,
  slowLoad: false,
  inRoom: false,
  streamCheckOpen: false,
};

const snapshot = (over: Partial<PlayerSnapshot>): PlayerSnapshot => ({ ...emptySnapshot, ...over });

function fakeTimers() {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  const window = {
    setTimeout: (fn: () => void, ms: number) => (timers.set(++id, { fn, ms }), id),
    clearTimeout: (i: number) => timers.delete(i),
    setInterval: () => ++id,
    clearInterval: () => {},
  };
  const fire = (ms: number) => {
    for (const [i, t] of timers) {
      if (t.ms !== ms) continue;
      timers.delete(i);
      t.fn();
    }
  };
  return { window, fire };
}

test("a slow load that already produced a frame never shows the stalled pill", () => {
  assert.equal(
    resolveStreamPillVariant({
      ...base,
      slowLoad: true,
      snap: snapshot({ status: "playing", firstFrameReady: true, durationSec: 0 }),
    }),
    null,
  );
});

test("a slow load with no frame still shows the stalled pill", () => {
  assert.equal(
    resolveStreamPillVariant({
      ...base,
      slowLoad: true,
      snap: snapshot({ status: "loading", firstFrameReady: false, durationSec: 0 }),
    }),
    "stalled",
  );
});

function autoRetry() {
  const timers = fakeTimers();
  const noop = () => {};
  const h = hookHarness(
    "src/views/player/hooks/use-auto-retry.ts",
    "useAutoRetry",
    {
      "@/lib/player/playback-clock": {
        getPlaybackBuffered: () => 0,
        getPlaybackPosition: () => 0,
        usePlaybackFlag: (predicate: () => boolean) => predicate(),
      },
      "@/lib/player/playback-end": { isTruncatedEnd: () => false },
      "@/lib/player/local-url": { isLocalUrl: () => false },
      "@/lib/picker-cache": { clearOnePickerCache: noop },
      "@/lib/streams/resolve": { resolveViaDebrids: async () => ({ ok: false }) },
      "@/lib/stream-proxy": { registerStreamProxy: async () => ({ url: "" }) },
      "@/lib/stremio-server": { buildTranscodedUrl: (u: string) => u, probeStremioServer: noop },
      "../player-utils": {
        BLACK_SCREEN_GRACE_MS: 6_000,
        MAX_AUTORETRY_ATTEMPTS: 5,
        NEVER_STARTED_CEILING_MS: 45_000,
        ROOM_STALL_MS: 9_000,
        SLOW_LOAD_MS: 50_000,
        STUCK_AUTORETRY_MS: 18_000,
      },
      "@/lib/torrent/engine-stats": { GENUINE_FAILURE_WINDOW_MS: 30_000 },
    },
    { window: timers.window },
  );
  const render = (over: Partial<PlayerSnapshot>) =>
    h.render({
      bridgeRef: { current: null },
      src: { url: "https://media.test/a.mkv", meta: { id: "tt100" } },
      snap: snapshot({ status: "loading", ...over }),
      stremioServerTranscode: false,
      instantPlay: false,
      inRoom: false,
      debrids: [],
      selfFrameReadyRef: { current: false },
      openPicker: noop,
      engineFailure: false,
      isP2pEngine: false,
      engineStats: null,
    }).slowLoad as boolean;
  return { render, fire: timers.fire };
}

test("a stream without a container duration is not treated as a stall", () => {
  const { render, fire } = autoRetry();
  render({ firstFrameReady: true, durationSec: 0 });
  fire(50_000);
  assert.equal(render({ firstFrameReady: true, durationSec: 0 }), false);
});

test("a frame arriving during a slow load cancels the pending stall", () => {
  const { render, fire } = autoRetry();
  render({ firstFrameReady: false });
  render({ firstFrameReady: true });
  fire(50_000);
  assert.equal(render({ firstFrameReady: true }), false);

  const stalled = autoRetry();
  stalled.render({ firstFrameReady: false });
  stalled.fire(50_000);
  assert.equal(stalled.render({ firstFrameReady: false }), true, "no frame still stalls");
});

type Node = { type: unknown; props: { children?: unknown; onClick?: unknown } };
const buttons = (node: unknown): Node[] => {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!node || typeof node !== "object") return [];
  const n = node as Node;
  return [...(n.type === "button" ? [n] : []), ...buttons(n.props.children)];
};

test("every stream pill variant can be dismissed", () => {
  const element = (type: unknown, props: Node["props"]) => ({ type, props });
  const pill = hookHarness("src/components/player/stream-check-pill.tsx", "StreamCheckPill", {
    "lucide-react": { Check: "Check", AlertCircle: "AlertCircle" },
    "@/lib/i18n": { useT: () => (s: string) => s },
    "@/lib/profiles": { useActiveKid: () => false },
    "react/jsx-runtime": { jsx: element, jsxs: element },
  });
  const onDismiss = () => {};
  for (const variant of ["check", "stalled", "failed"]) {
    for (const live of [false, true]) {
      const tree = pill.render({ variant, visible: true, onDismiss, onPickAnother() {}, live });
      assert.ok(
        buttons(tree).some((b) => b.props.onClick === onDismiss),
        `${variant}${live ? " (live)" : ""} has a dismiss button`,
      );
    }
  }
  assert.equal(
    resolveStreamPillVariant({
      ...base,
      dismissed: true,
      slowLoad: true,
      snap: snapshot({ status: "loading" }),
    }),
    null,
  );
});

test("dismissal resets when the source changes", () => {
  const timers = fakeTimers();
  const h = hookHarness(
    "src/views/player/hooks/use-stream-pill.ts",
    "useStreamPill",
    {},
    {
      window: timers.window,
    },
  );
  const render = (srcUrl: string) =>
    h.render({
      srcUrl,
      snap: snapshot({ status: "loading" }),
      pipMode: false,
      showWaiting: false,
      isLocalSrc: false,
      slowLoad: true,
      inRoom: false,
      streamCheckOpen: false,
    }) as { variant: string | null; dismiss: () => void };
  render("https://media.test/a.mkv").dismiss();
  assert.equal(render("https://media.test/a.mkv").variant, null);
  render("https://media.test/b.mkv");
  assert.equal(render("https://media.test/b.mkv").variant, "stalled");
});

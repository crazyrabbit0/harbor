// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { flushPromises } from "./helpers/hook-harness.ts";
import { pickHandlerHarness } from "./helpers/pick-handler-harness.ts";

const HASH = "c".repeat(40);

/** The real pick handler, re-rendered with a manual-consent picker and the given debrids. */
function picker(options: Parameters<typeof pickHandlerHarness>[0], debrids: unknown[]) {
  const h = pickHandlerHarness({ p2pEligible: true, ...options });
  const opened: { url: string }[] = [];
  const props = {
    meta: { id: "tt100", name: "Fixture" },
    debrids,
    isCached: () => false,
    streamMode: "both",
    p2pAutoConsent: false,
    seasonLock: false,
    inSession: false,
    inviteSentRef: { current: null },
    openPlayer: (src: { url: string }) => opened.push(src),
    intent: "play",
    autoActive: false,
    autoAttemptIdx: 0,
    autoCandidatesLength: 1,
    autoFiredRef: { current: false },
    setAutoAttemptIdx() {},
    setAutoExhausted() {},
    setFailedStreams() {},
    setResolveError() {},
    setResolving() {},
  };
  return { h, opened, render: () => h.render(props) };
}

const forceP2pOf = (args: unknown[]) => args[4];

test("confirming the P2P modal always forces the local torrent engine", async () => {
  // An uncached torrent with no debrid asks first.
  const fresh = picker({ resolve: async () => ({ ok: false, code: "x" }) }, []);
  fresh.render().onPlay({ infoHash: HASH, cached: {} });
  assert.equal(fresh.h.resolveCalls.length, 0, "the modal opens before anything resolves");
  const asked = fresh.render();
  assert.equal(asked.p2pConfirm?.forceP2p, true);
  asked.confirmP2p();
  assert.equal(fresh.h.resolveCalls.length, 1);
  assert.equal(forceP2pOf(fresh.h.resolveCalls[0]), true);

  // A debrid link that turns out to be a stub offers the engine instead.
  let resolved = 0;
  const stub = picker(
    {
      resolve: async () =>
        resolved++ === 0
          ? { ok: true, via: "rd", data: { url: "https://rd.test/file" } }
          : { ok: true, via: "p2p", data: { url: "http://127.0.0.1:9/engine" } },
      preflight: async () => ({ ok: false, reason: "stub", sizeBytes: 5 }),
    },
    [{ slug: "rd" }],
  );
  stub.render().onPlay({ infoHash: HASH, cached: {}, url: undefined }, true, true);
  await flushPromises();
  assert.equal(stub.h.resolveCalls.length, 1);
  assert.equal(forceP2pOf(stub.h.resolveCalls[0]), false);
  const offered = stub.render();
  assert.equal(offered.p2pConfirm?.forceP2p, true);
  offered.confirmP2p();
  assert.equal(stub.h.resolveCalls.length, 2);
  assert.equal(forceP2pOf(stub.h.resolveCalls[1]), true);
  await flushPromises();
  assert.equal(stub.opened[0]?.url, "http://127.0.0.1:9/engine");
});

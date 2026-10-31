import "./_localstorage-stub.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { HostTrustStore } from "../src/lib/lan-trust-host.ts";
import { HostPairing } from "../src/lib/lan-pair-host.ts";
import { createPlayOnRouter } from "../src/lib/remote/play-on-route.ts";

const SELF = { id: "host-1", name: "Den PC", platform: "windows", version: "0.9.300" };
const PEER = { id: "peer-1", name: "Office PC", platform: "linux", version: "0.9.300" };

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

type Sent = { clientId: number; ack: Record<string, unknown> };

function rig() {
  const store = new HostTrustStore(memoryStorage());
  const pairing = new HostPairing({ store, now: () => 1_000_000, identity: async () => SELF });
  const sent: Sent[] = [];
  const router = createPlayOnRouter({
    store,
    pairing,
    reply: (clientId, ack) => void sent.push({ clientId, ack }),
  });
  return { pairing, router, sent };
}

const begin = { t: "pair", step: "begin", proto: 1, id: "b1", peer: PEER };
const playMeta = (id = "m1") => ({
  t: "cmd",
  id,
  command: { action: "playMeta", metaId: "tt1", metaType: "movie", fromInstance: PEER.id },
});

test("a pair begin ack goes only to the socket that asked", async () => {
  const r = rig();
  const dispatch = await r.router.route(begin, 7, false);
  assert.equal(dispatch, null);
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].clientId, 7);
  assert.equal(r.sent[0].ack.id, "b1");
  assert.equal(r.sent[0].ack.ok, true);
});

test("a host-issued pairing token is replied to the pairing socket alone", async () => {
  const r = rig();
  await r.router.route(begin, 7, false);
  const code = r.pairing.current()?.code ?? "";
  await r.router.route({ t: "pair", step: "code", proto: 1, id: "c1", code, peer: PEER }, 7, false);
  assert.deepEqual(
    r.sent.map((s) => s.clientId),
    [7, 7],
  );
  assert.equal(typeof r.sent[1].ack.token, "string");
});

test("a Play-on ack is sent to the requesting client and its command returned for dispatch", async () => {
  const r = rig();
  const dispatch = await r.router.route(playMeta(), 12, true);
  assert.equal(dispatch?.action, "playMeta");
  assert.deepEqual(r.sent, [{ clientId: 12, ack: { t: "ack", id: "m1", ok: true } }]);
});

test("a refused Play-on frame is acked to its own client with no dispatch", async () => {
  const r = rig();
  const dispatch = await r.router.route(playMeta("m2"), 4, false);
  assert.equal(dispatch, null);
  assert.equal(r.sent[0].clientId, 4);
  assert.equal(r.sent[0].ack.code, "not-paired");
});

test("a pair frame without an id sends nothing", async () => {
  const r = rig();
  await r.router.route({ ...begin, id: undefined }, 7, false);
  assert.equal(r.sent.length, 0);
});

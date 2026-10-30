import "./_localstorage-stub.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { HostTrustStore, verifyPlayOnFrame } from "../src/lib/lan-trust-host.ts";
import { HostPairing, PAIR_HOST_TTL_MS } from "../src/lib/lan-pair-host.ts";
import { createPlayOnRouter, hostHello } from "../src/lib/remote/play-on-route.ts";
import {
  normalizePairCode,
  pairTokenFromAck,
  speaksTrust,
  validToken,
} from "../src/lib/lan-trust.ts";
import { remoteFrameAllowed } from "../src/lib/remote/remote-auth.ts";

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

function rig(start = 1_000_000) {
  let clock = start;
  const store = new HostTrustStore(memoryStorage());
  const pairing = new HostPairing({ store, now: () => clock, identity: async () => SELF });
  const router = createPlayOnRouter({ store, pairing });
  return {
    store,
    pairing,
    router,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const begin = (id = "b1") => ({ t: "pair", step: "begin", proto: 1, id, peer: PEER });
const code = (value: string, id = "c1", token?: string) => ({
  t: "pair",
  step: "code",
  proto: 1,
  id,
  code: value,
  peer: PEER,
  ...(token ? { token } : {}),
});
const playMeta = (token?: string, id = "m1") => ({
  t: "cmd",
  id,
  command: { action: "playMeta", metaId: "tt1", metaType: "movie", fromInstance: PEER.id },
  ...(token ? { token } : {}),
});

function ackOf(route: { ack: unknown } | null): Record<string, unknown> {
  assert.ok(route?.ack, "expected an ack");
  return route.ack as Record<string, unknown>;
}

async function pairPeer(r: ReturnType<typeof rig>, proposed?: string): Promise<string> {
  await r.router.handle(begin(), 7, false);
  const shown = r.pairing.current()?.code ?? "";
  const res = await r.router.handle(code(shown, "c1", proposed), 7, false);
  const ack = ackOf(res);
  assert.equal(ack.ok, true);
  return proposed ?? String(ack.token);
}

test("the host hello advertises trust so senders pair first", () => {
  const hello = hostHello();
  assert.equal(hello.t, "hello");
  assert.equal(speaksTrust(hello), true);
});

test("pair begin shows an 8-character code that normalizePairCode keeps intact", async () => {
  const r = rig();
  const res = await r.router.handle(begin(), 7, false);
  const ack = ackOf(res);
  assert.equal(ack.t, "ack");
  assert.equal(ack.id, "b1");
  assert.equal(ack.ok, true);
  assert.equal(ack.len, 8);
  assert.equal(ack.expiresAt, 1_000_000 + PAIR_HOST_TTL_MS);
  const shown = r.pairing.current()?.code ?? "";
  assert.equal(shown.length, 8);
  assert.equal(normalizePairCode(shown), shown);
  assert.equal(r.pairing.current()?.peer.name, "Office PC");
});

test("the right code issues a token, stores the peer and answers with this host's identity", async () => {
  const r = rig();
  await r.router.handle(begin(), 7, false);
  const shown = r.pairing.current()?.code ?? "";
  const typed = `${shown.slice(0, 4).toLowerCase()}-${shown.slice(4)}`;
  const res = await r.router.handle(code(typed), 7, false);
  const ack = ackOf(res);
  assert.equal(ack.ok, true);
  assert.equal(ack.id, "c1");
  assert.equal(validToken(String(ack.token)), true);
  assert.ok(String(ack.token).length >= 32);
  assert.deepEqual(ack.peer, SELF);
  const stored = r.store.peers();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].peerId, PEER.id);
  assert.equal(stored[0].name, "Office PC");
  assert.equal(JSON.stringify(stored).includes(String(ack.token)), false, "only a hash is kept");
  assert.equal(r.pairing.current(), null);
});

test("a token the sender proposes is adopted and never echoed in the broadcast ack", async () => {
  const r = rig();
  const proposed = "a1".repeat(24);
  await r.router.handle(begin(), 7, false);
  const res = await r.router.handle(
    code(r.pairing.current()?.code ?? "", "c1", proposed),
    7,
    false,
  );
  const ack = ackOf(res);
  assert.equal(ack.ok, true);
  assert.equal(ack.token, undefined);
  assert.equal(ack.adopted, true);
  assert.equal(pairTokenFromAck(ack as never, proposed), proposed);
  const ok = await verifyPlayOnFrame(playMeta(proposed), false, r.store);
  assert.equal(ok.ok, true);
});

test("pairTokenFromAck prefers a host-issued token and refuses an ack with neither", () => {
  const issued = "b2".repeat(20);
  assert.equal(
    pairTokenFromAck({ t: "ack", id: "x", ok: true, token: issued }, "c3".repeat(24)),
    issued,
  );
  assert.equal(pairTokenFromAck({ t: "ack", id: "x", ok: true }, "c3".repeat(24)), "");
});

test("a wrong code answers badCode, and the fifth miss expires the pairing", async () => {
  const r = rig();
  await r.router.handle(begin(), 7, false);
  for (let i = 0; i < 4; i++) {
    const res = await r.router.handle(code("ZZZZZZZZ", `w${i}`), 7, false);
    assert.equal(ackOf(res).code, "badCode");
  }
  const fifth = await r.router.handle(code("ZZZZZZZZ", "w5"), 7, false);
  assert.equal(ackOf(fifth).code, "expired");
  assert.equal(r.pairing.current(), null);
  assert.equal(r.store.peers().length, 0);
});

test("a code past its expiry answers expired", async () => {
  const r = rig();
  await r.router.handle(begin(), 7, false);
  const shown = r.pairing.current()?.code ?? "";
  r.advance(PAIR_HOST_TTL_MS + 1);
  const res = await r.router.handle(code(shown), 7, false);
  assert.equal(ackOf(res).code, "expired");
  assert.equal(r.store.peers().length, 0);
});

test("a second sender is told busy while a pairing is open, and cannot submit the code", async () => {
  const r = rig();
  await r.router.handle(begin(), 7, false);
  const shown = r.pairing.current()?.code ?? "";
  const other = await r.router.handle(
    { ...begin("b2"), peer: { ...PEER, id: "peer-2" } },
    9,
    false,
  );
  assert.equal(ackOf(other).code, "busy");
  const stolen = await r.router.handle(code(shown, "c9"), 9, false);
  assert.equal(ackOf(stolen).code, "busy");
  assert.equal(r.store.peers().length, 0);
});

test("cancelling on the host ends the pairing", async () => {
  const r = rig();
  await r.router.handle(begin(), 7, false);
  const shown = r.pairing.current()?.code ?? "";
  r.pairing.cancel();
  const res = await r.router.handle(code(shown), 7, false);
  assert.equal(ackOf(res).code, "expired");
});

test("playMeta with a paired token is dispatched and acked ok", async () => {
  const r = rig();
  const token = await pairPeer(r);
  const res = await r.router.handle(playMeta(token), 3, false);
  assert.deepEqual(res?.ack, { t: "ack", id: "m1", ok: true });
  assert.equal(res?.dispatch?.action, "playMeta");
});

test("playMeta without a token is refused not-paired, with a wrong one untrusted", async () => {
  const r = rig();
  await pairPeer(r);
  const missing = await r.router.handle(playMeta(), 3, false);
  assert.deepEqual(missing?.ack, { t: "ack", id: "m1", ok: false, code: "not-paired" });
  assert.equal(missing?.dispatch, null);
  const wrong = await r.router.handle(playMeta("f".repeat(48)), 3, false);
  assert.deepEqual(wrong?.ack, { t: "ack", id: "m1", ok: false, code: "untrusted" });
  assert.equal(wrong?.dispatch, null);
});

test("a token presented under another instance id is untrusted", async () => {
  const r = rig();
  const token = await pairPeer(r);
  const frame = playMeta(token);
  frame.command.fromInstance = "someone-else";
  const res = await r.router.handle(frame, 3, false);
  assert.equal(ackOf(res).code, "untrusted");
});

test("a forgotten peer's token stops working", async () => {
  const r = rig();
  const token = await pairPeer(r);
  r.store.forget(PEER.id);
  const res = await r.router.handle(playMeta(token), 3, false);
  assert.equal(ackOf(res).code, "untrusted");
});

test("an authed socket's Play-on command is accepted without a token", async () => {
  const r = rig();
  const res = await r.router.handle(playMeta(), 3, true);
  assert.equal(ackOf(res).ok, true);
  assert.equal(res?.dispatch?.action, "playMeta");
});

test("the phone remote's authed playMeta has no envelope and stays on the normal path", async () => {
  const r = rig();
  const phone = { t: "cmd", command: { action: "playMeta", metaId: "tt1", metaType: "movie" } };
  assert.equal(await r.router.handle(phone, 3, true), null);
});

test("setConfig is verified, then refused since desktop has no consumer", async () => {
  const r = rig();
  const token = await pairPeer(r);
  const frame = {
    t: "cmd",
    id: "s1",
    command: { action: "setConfig", fromInstance: PEER.id },
    token,
  };
  const res = await r.router.handle(frame, 3, false);
  assert.deepEqual(res?.ack, { t: "ack", id: "s1", ok: false, code: "refused" });
  const bare = await r.router.handle({ ...frame, token: undefined }, 3, false);
  assert.equal(ackOf(bare).code, "not-paired");
});

test("queueMeta is gated by the same check", async () => {
  const r = rig();
  const token = await pairPeer(r);
  const queue = (t?: string) => ({
    t: "cmd",
    id: "q1",
    command: { action: "queueMeta", metaId: "tt2", metaType: "series", fromInstance: PEER.id },
    ...(t ? { token: t } : {}),
  });
  assert.equal((await verifyPlayOnFrame(queue(token), false, r.store)).ok, true);
  assert.deepEqual(await verifyPlayOnFrame(queue(), false, r.store), {
    ok: false,
    code: "not-paired",
  });
  assert.deepEqual(await verifyPlayOnFrame(queue("e".repeat(48)), false, r.store), {
    ok: false,
    code: "untrusted",
  });
  assert.equal((await verifyPlayOnFrame(queue(), true, r.store)).ok, true);
});

test("remoteFrameAllowed no longer lets an unauthed Play-on envelope through", () => {
  assert.equal(remoteFrameAllowed(playMeta() as never, false), false);
});

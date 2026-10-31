import { invoke } from "@tauri-apps/api/core";
import { HostPairing } from "@/lib/lan-pair-host";
import {
  hostTrustStore,
  readPlayOnFrame,
  verifyPlayOnFrame,
  type HostTrustStore,
  type PlayOnCommand,
} from "@/lib/lan-trust-host";
import { REMOTE_PROTO } from "./protocol";

// Any non-empty value tells a sender (speaksTrust in lan-trust.ts) to pair and send its token.
export const HOST_TRUST_VERSION = "1";

export type HostHello = { t: "hello"; proto: number; server: "harbor-remote"; trust: string };

export type TrustAck = { t: "ack"; id: string; ok: boolean } & Record<string, unknown>;

/** The router's answer to a pairing or Play-on frame: the `ack` for the requesting socket, then `dispatch` if set. */
export type TrustRoute = { ack: TrustAck | null; dispatch: PlayOnCommand | null };

/** Delivers one frame to a single /api/remote socket. */
export type RemoteReply = (clientId: number, frame: TrustAck | Record<string, unknown>) => void;

/** Sends a frame to one connected remote socket through `remote_ws_send`; a no-op outside Tauri. */
export const sendToRemoteClient: RemoteReply = (clientId, frame) => {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  void invoke("remote_ws_send", { clientId, payload: JSON.stringify(frame) }).catch(() => {});
};

/** Pairing frames and Play-on commands (nonce id plus a Play-on action) go through the router; the rest is phone remote. */
export function isTrustFrame(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  return (msg as { t?: unknown }).t === "pair" || readPlayOnFrame(msg) !== null;
}

export function hostHello(): HostHello {
  return { t: "hello", proto: REMOTE_PROTO, server: "harbor-remote", trust: HOST_TRUST_VERSION };
}

function frameId(m: Record<string, unknown>): string {
  return typeof m.id === "string" ? m.id.slice(0, 64) : "";
}

export function createPlayOnRouter(deps: {
  store: HostTrustStore;
  pairing: HostPairing;
  reply: RemoteReply;
}) {
  async function pair(m: Record<string, unknown>, clientId: number): Promise<TrustRoute> {
    const id = frameId(m);
    if (m.step === "begin") {
      const reply = deps.pairing.begin(clientId, m.peer);
      return { ack: id ? { t: "ack", id, ...reply } : null, dispatch: null };
    }
    if (m.step === "code") {
      const reply = await deps.pairing.submit(clientId, m.code, m.token);
      if (!id) return { ack: null, dispatch: null };
      if (!reply.ok) return { ack: { t: "ack", id, ok: false, code: reply.code }, dispatch: null };
      // A sender-proposed token is confirmed, never echoed; a host-issued one goes to the pairing socket alone.
      const secret = reply.adopted ? { adopted: true } : { token: reply.token };
      return { ack: { t: "ack", id, ok: true, ...secret, peer: reply.peer }, dispatch: null };
    }
    return { ack: id ? { t: "ack", id, ok: false, code: "refused" } : null, dispatch: null };
  }

  async function handle(
    msg: unknown,
    clientId: number,
    authed: boolean,
  ): Promise<TrustRoute | null> {
    if (!msg || typeof msg !== "object") return null;
    const m = msg as Record<string, unknown>;
    if (m.t === "pair") return pair(m, clientId);
    const frame = readPlayOnFrame(m);
    if (!frame) return null;
    const id = frameId(m);
    const verdict = await verifyPlayOnFrame(frame, authed, deps.store);
    if (!verdict.ok)
      return { ack: { t: "ack", id, ok: false, code: verdict.code }, dispatch: null };
    const action = verdict.command.action;
    if (action === "playMeta" || action === "queueMeta") {
      return { ack: { t: "ack", id, ok: true }, dispatch: verdict.command };
    }
    return { ack: { t: "ack", id, ok: false, code: "refused" }, dispatch: null };
  }

  /** Handles a trust frame, acks it to the socket it came from, and returns the command to dispatch. */
  async function route(
    msg: unknown,
    clientId: number,
    authed: boolean,
  ): Promise<PlayOnCommand | null> {
    const result = await handle(msg, clientId, authed);
    if (result?.ack) deps.reply(clientId, result.ack);
    return result?.dispatch ?? null;
  }

  return { handle, route };
}

let pairing: HostPairing | null = null;
let router: ReturnType<typeof createPlayOnRouter> | null = null;

async function selfIdentity() {
  const { harborIdentity } = await import("@/components/play-on-lan");
  return harborIdentity();
}

/** The main window's pairing state, shared by host-mount and the pairing dialog. */
export function hostPairing(): HostPairing {
  pairing ??= new HostPairing({ store: hostTrustStore(), identity: selfIdentity });
  return pairing;
}

export function playOnRouter(): ReturnType<typeof createPlayOnRouter> {
  router ??= createPlayOnRouter({
    store: hostTrustStore(),
    pairing: hostPairing(),
    reply: sendToRemoteClient,
  });
  return router;
}

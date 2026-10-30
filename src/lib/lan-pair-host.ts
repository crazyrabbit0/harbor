import { PAIR_CODE_LEN, normalizePairCode, validToken } from "./lan-trust";
import { randomHex, sameSecret, type HostTrustStore, type PeerIdentity } from "./lan-trust-host";

export const PAIR_HOST_TTL_MS = 2 * 60 * 1000;
export const PAIR_HOST_MAX_MISSES = 5;

// Digits and capitals without I, L and O, which normalizePairCode folds into 1 and 0.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTUVWXYZ";
const MIN_PROPOSED_TOKEN = 32;

export type PendingPairing = {
  clientId: number;
  peer: PeerIdentity;
  code: string;
  expiresAt: number;
  misses: number;
};

export type PairBeginReply =
  | { ok: true; expiresAt: number; len: number }
  | { ok: false; code: string };

export type PairCodeReply =
  | { ok: true; token: string; adopted: boolean; peer: PeerIdentity }
  | { ok: false; code: string };

type Deps = {
  store: HostTrustStore;
  now?: () => number;
  identity: () => Promise<PeerIdentity | null>;
};

export function randomPairCode(len = PAIR_CODE_LEN): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = "";
  while (out.length < len) {
    const buf = new Uint8Array(len * 2);
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= limit || out.length >= len) continue;
      out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return out;
}

export function readPeer(raw: unknown): PeerIdentity | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const id = text(r.id, 128);
  if (!id) return null;
  return {
    id,
    name: text(r.name, 80),
    platform: text(r.platform, 24),
    version: text(r.version, 32),
  };
}

/** One pairing at a time, bound to the socket that began it; the host shows `current().code` to the user. */
export class HostPairing {
  private pending: PendingPairing | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  current = (): PendingPairing | null => {
    if (this.pending && this.now() >= this.pending.expiresAt) this.set(null);
    return this.pending;
  };

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  cancel = (): void => {
    this.set(null);
  };

  /** Drops the pairing when the socket that began it goes away. */
  release(clientId: number): void {
    if (this.pending?.clientId === clientId) this.set(null);
  }

  begin(clientId: number, rawPeer: unknown): PairBeginReply {
    const peer = readPeer(rawPeer);
    if (!peer) return { ok: false, code: "refused" };
    const open = this.current();
    if (open && open.clientId !== clientId) return { ok: false, code: "busy" };
    const expiresAt = this.now() + PAIR_HOST_TTL_MS;
    this.set({ clientId, peer, code: randomPairCode(), expiresAt, misses: 0 });
    return { ok: true, expiresAt, len: PAIR_CODE_LEN };
  }

  async submit(clientId: number, rawCode: unknown, proposed: unknown): Promise<PairCodeReply> {
    const open = this.current();
    if (!open) return { ok: false, code: "expired" };
    if (open.clientId !== clientId) return { ok: false, code: "busy" };
    const typed = typeof rawCode === "string" ? normalizePairCode(rawCode) : "";
    if (!sameSecret(typed, open.code)) {
      open.misses += 1;
      if (open.misses < PAIR_HOST_MAX_MISSES) return { ok: false, code: "badCode" };
      this.set(null);
      return { ok: false, code: "expired" };
    }
    this.set(null);
    const adopted =
      typeof proposed === "string" && proposed.length >= MIN_PROPOSED_TOKEN && validToken(proposed);
    const token = adopted ? proposed : randomHex(24);
    await this.deps.store.remember(open.peer, token, this.now());
    const self = await this.deps.identity();
    return {
      ok: true,
      token,
      adopted,
      peer: self ?? { id: "", name: "", platform: "", version: "" },
    };
  }

  private set(next: PendingPairing | null): void {
    if (this.pending === next) return;
    this.pending = next;
    this.listeners.forEach((fn) => fn());
  }
}

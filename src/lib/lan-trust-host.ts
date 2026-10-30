// Host side of Harbor-to-Harbor trust: which computers may drive this Harbor with Play on.

export const HOST_TRUST_KEY = "harbor.lan.hosttrust.v1";

export const PLAY_ON_ACTIONS = ["playMeta", "queueMeta", "setConfig", "setTheme"] as const;
export type PlayOnHostAction = (typeof PLAY_ON_ACTIONS)[number];

export type TrustedPeer = {
  peerId: string;
  name: string;
  platform: string;
  version: string;
  tokenHash: string;
  pairedAt: number;
};

export type PeerIdentity = { id: string; name: string; platform: string; version: string };

export type PlayOnCommand = { action: PlayOnHostAction; fromInstance?: string } & Record<
  string,
  unknown
>;

export type PlayOnFrame = { t: "cmd"; id?: string; token?: string; command: PlayOnCommand };

export type PlayOnVerdict =
  | { ok: true; command: PlayOnCommand }
  | { ok: false; code: "not-paired" | "untrusted" };

const HASH_RE = /^[0-9a-f]{64}$/;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanPeer(row: unknown): TrustedPeer | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const peerId = str(r.peerId);
  const tokenHash = str(r.tokenHash);
  if (!peerId || !HASH_RE.test(tokenHash)) return null;
  return {
    peerId,
    tokenHash,
    name: str(r.name),
    platform: str(r.platform),
    version: str(r.version),
    pairedAt: typeof r.pairedAt === "number" ? r.pairedAt : 0,
  };
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class HostTrustStore {
  private readonly rows = new Map<string, TrustedPeer>();
  private readonly listeners = new Set<() => void>();
  private list: TrustedPeer[] = [];
  private loaded = false;
  private readonly storage: () => Storage | null;

  constructor(storage?: Storage | (() => Storage | null)) {
    this.storage = typeof storage === "function" ? storage : () => storage ?? null;
  }

  peers = (): TrustedPeer[] => {
    this.load();
    return this.list;
  };

  peer(peerId: string): TrustedPeer | null {
    this.load();
    return this.rows.get(peerId) ?? null;
  }

  async remember(peer: PeerIdentity, token: string, pairedAt: number): Promise<void> {
    this.load();
    this.rows.set(peer.id, {
      peerId: peer.id,
      name: peer.name,
      platform: peer.platform,
      version: peer.version,
      tokenHash: await hashToken(token),
      pairedAt,
    });
    this.persist();
  }

  forget(peerId: string): void {
    this.load();
    if (this.rows.delete(peerId)) this.persist();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.load();
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  async verify(peerId: string, token: string): Promise<boolean> {
    const row = this.peer(peerId);
    if (!row || !token) return false;
    return sameSecret(await hashToken(token), row.tokenHash);
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = this.storage()?.getItem(HOST_TRUST_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          const clean = cleanPeer(row);
          if (clean) this.rows.set(clean.peerId, clean);
        }
      }
    } catch {
      void 0;
    }
    this.rebuild();
  }

  private rebuild(): void {
    this.list = [...this.rows.values()].sort((a, b) => b.pairedAt - a.pairedAt);
  }

  private persist(): void {
    this.rebuild();
    try {
      this.storage()?.setItem(HOST_TRUST_KEY, JSON.stringify(this.list));
    } catch {
      void 0;
    }
    this.listeners.forEach((fn) => fn());
  }
}

function isPlayOnAction(action: unknown): action is PlayOnHostAction {
  return PLAY_ON_ACTIONS.includes(action as PlayOnHostAction);
}

/** A Play-on command frame (a nonce id plus a Play-on action), as opposed to a phone remote command. */
export function readPlayOnFrame(msg: unknown): PlayOnFrame | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  if (m.t !== "cmd" || typeof m.id !== "string" || !m.id) return null;
  const command = m.command as Record<string, unknown> | undefined;
  if (!command || typeof command !== "object" || !isPlayOnAction(command.action)) return null;
  return m as unknown as PlayOnFrame;
}

/** Whether a Play-on command may act: the socket presented the phone remote key, or the token belongs to the sending peer. */
export async function verifyPlayOnFrame(
  msg: unknown,
  authed: boolean,
  store: HostTrustStore,
): Promise<PlayOnVerdict> {
  const m = (msg ?? {}) as Record<string, unknown>;
  const command = m.command as PlayOnCommand | undefined;
  if (m.t !== "cmd" || !command || !isPlayOnAction(command.action)) {
    return { ok: false, code: "untrusted" };
  }
  if (authed) return { ok: true, command };
  const token = str(m.token);
  if (!token) return { ok: false, code: "not-paired" };
  const ok = await store.verify(str(command.fromInstance), token);
  return ok ? { ok: true, command } : { ok: false, code: "untrusted" };
}

let shared: HostTrustStore | null = null;

export function hostTrustStore(): HostTrustStore {
  shared ??= new HostTrustStore(() => (typeof localStorage === "undefined" ? null : localStorage));
  return shared;
}

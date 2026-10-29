import type { RemoteClientMessage } from "./protocol";

/** Query parameter that carries the web remote pairing key in phone URLs and the WebSocket upgrade. */
export const REMOTE_KEY_PARAM = "k";
export const REMOTE_KEY_STORAGE = "harbor.remote.key.v1";

const KEY_RE = /^[0-9a-f]{64}$/;

export function withRemoteKey(url: string, key: string | null | undefined): string {
  if (!key) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${REMOTE_KEY_PARAM}=${encodeURIComponent(key)}`;
}

function storedKey(): string | null {
  try {
    const raw = localStorage.getItem(REMOTE_KEY_STORAGE);
    return raw && KEY_RE.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** The key from the page URL (remembered for later visits), else the remembered one. */
export function readRemoteKey(search?: string): string | null {
  let fromUrl: string | null = null;
  try {
    const query = search ?? (typeof location !== "undefined" ? location.search : "");
    fromUrl = new URLSearchParams(query).get(REMOTE_KEY_PARAM);
  } catch {
    fromUrl = null;
  }
  if (fromUrl && KEY_RE.test(fromUrl)) {
    try {
      localStorage.setItem(REMOTE_KEY_STORAGE, fromUrl);
    } catch {
      void 0;
    }
    return fromUrl;
  }
  return storedKey();
}

type InboundFrame = RemoteClientMessage & { id?: unknown; command?: { fromInstance?: unknown } };

// Harbor-to-Harbor Play-on sends playMeta with a nonce id and its own instance id; the phone remote sends neither.
function isPlayOnEnvelope(msg: InboundFrame): boolean {
  return (
    msg.t === "cmd" &&
    msg.command.action === "playMeta" &&
    typeof msg.id === "string" &&
    typeof msg.command.fromInstance === "string" &&
    msg.command.fromInstance.length > 0
  );
}

/** Whether host-mount may act on a frame from a connection that did or did not present the pairing key. */
export function remoteFrameAllowed(msg: RemoteClientMessage, authed: boolean): boolean {
  if (authed) return true;
  if (msg.t === "hello") return true;
  if (msg.t !== "cmd") return false;
  if (msg.command.action === "ping") return true;
  return isPlayOnEnvelope(msg as InboundFrame);
}

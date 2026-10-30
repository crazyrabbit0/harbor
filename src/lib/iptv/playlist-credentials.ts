import { buildXtreamUrls } from "./playlist-entry";
import type { StoredPlaylist } from "./playlists-store";

export type PlaylistCredentials = { username: string; password: string };
export type CredentialMap = Record<string, PlaylistCredentials>;

function isCredentials(value: unknown): value is PlaylistCredentials {
  if (!value || typeof value !== "object") return false;
  const { username, password } = value as Record<string, unknown>;
  return typeof username === "string" && typeof password === "string";
}

export function parseCredentials(raw: string | null): CredentialMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: CredentialMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isCredentials(value)) out[id] = { username: value.username, password: value.password };
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeCredentials(map: CredentialMap): string | null {
  return Object.keys(map).length > 0 ? JSON.stringify(map) : null;
}

function plaintextOf(playlist: StoredPlaylist): PlaylistCredentials | null {
  const x = playlist.xtream;
  if (!x || (!x.username && !x.password)) return null;
  return { username: x.username, password: x.password };
}

export function hasPlaintextCredentials(lists: readonly StoredPlaylist[]): boolean {
  return lists.some((p) => plaintextOf(p) != null);
}

/** Moves each Xtream login into the map and blanks the URLs built from it; stored logins of listed ids without one are kept. */
export function splitCredentials(
  lists: readonly StoredPlaylist[],
  stored: CredentialMap,
): { stripped: StoredPlaylist[]; credentials: CredentialMap } {
  const credentials: CredentialMap = {};
  const stripped = lists.map((p) => {
    const creds = plaintextOf(p);
    if (!creds || !p.xtream) {
      if (stored[p.id]) credentials[p.id] = stored[p.id];
      return p;
    }
    credentials[p.id] = creds;
    const built = buildXtreamUrls(p.xtream.server, creds.username, creds.password);
    return {
      ...p,
      url: p.url === built.m3u ? "" : p.url,
      ...(p.epgUrl === built.epg ? { epgUrl: "" } : {}),
      xtream: { server: p.xtream.server, username: "", password: "" },
    };
  });
  return { stripped, credentials };
}

/** Restores logins and blanked URLs; a login still in the stored list is newer than the map's and wins. */
export function joinCredentials(
  lists: readonly StoredPlaylist[],
  credentials: CredentialMap,
): StoredPlaylist[] {
  return lists.map((p) => {
    const creds = credentials[p.id];
    if (!p.xtream || !creds || plaintextOf(p)) return p;
    const built = buildXtreamUrls(p.xtream.server, creds.username, creds.password);
    return {
      ...p,
      url: p.url || built.m3u,
      ...(p.epgUrl === "" ? { epgUrl: built.epg } : {}),
      xtream: { ...p.xtream, username: creds.username, password: creds.password },
    };
  });
}

import { buildXtreamUrls } from "./playlist-entry";
import type { StoredPlaylist } from "./playlists-store";
import { hasUrlSecrets, redactUrl } from "./url-credentials";

export type PlaylistCredentials = { username: string; password: string };
// A login, the typed URLs that embed credentials (stored whole), or both; the list keeps the redacted URL.
// `epgBuilt` marks an EPG URL blanked because it was the Xtream-built one, unlike an EPG the user cleared.
export type CredentialEntry = Partial<PlaylistCredentials> & {
  url?: string;
  epgUrl?: string;
  epgBuilt?: true;
};
export type CredentialMap = Record<string, CredentialEntry>;

function parseEntry(value: unknown): CredentialEntry | null {
  if (!value || typeof value !== "object") return null;
  const { username, password, url, epgUrl, epgBuilt } = value as Record<string, unknown>;
  const entry: CredentialEntry = {};
  if (typeof username === "string" && typeof password === "string") {
    entry.username = username;
    entry.password = password;
    if (epgBuilt === true) entry.epgBuilt = true;
  }
  if (typeof url === "string") entry.url = url;
  if (typeof epgUrl === "string") entry.epgUrl = epgUrl;
  return Object.keys(entry).length > 0 ? entry : null;
}

export function parseCredentials(raw: string | null): CredentialMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: CredentialMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      const entry = parseEntry(value);
      if (entry) out[id] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeCredentials(map: CredentialMap): string | null {
  return Object.keys(map).length > 0 ? JSON.stringify(map) : null;
}

function loginOf(entry: CredentialEntry | undefined): PlaylistCredentials | null {
  if (entry?.username == null || entry.password == null) return null;
  return { username: entry.username, password: entry.password };
}

function plaintextOf(playlist: StoredPlaylist): PlaylistCredentials | null {
  const x = playlist.xtream;
  if (!x || (!x.username && !x.password)) return null;
  return { username: x.username, password: x.password };
}

function typedSecrets(playlist: StoredPlaylist): boolean {
  return hasUrlSecrets(playlist.url) || (playlist.epgUrl != null && hasUrlSecrets(playlist.epgUrl));
}

export function hasPlaintextCredentials(lists: readonly StoredPlaylist[]): boolean {
  return lists.some((p) => plaintextOf(p) != null || typedSecrets(p));
}

// The stored full URL for a list URL: a URL with secrets is its own, a redacted one maps back while it matches.
function fullUrl(listed: string, stored: string | undefined): string | undefined {
  if (hasUrlSecrets(listed)) return listed;
  return stored != null && redactUrl(stored) === listed && stored !== listed ? stored : undefined;
}

function splitOne(p: StoredPlaylist, stored: CredentialEntry | undefined) {
  const entry: CredentialEntry = {};
  let next = p;
  const creds = plaintextOf(p);
  if (creds && p.xtream) {
    Object.assign(entry, creds);
    const built = buildXtreamUrls(p.xtream.server, creds.username, creds.password);
    if (p.epgUrl === built.epg) entry.epgBuilt = true;
    next = {
      ...p,
      url: p.url === built.m3u ? "" : p.url,
      ...(p.epgUrl === built.epg ? { epgUrl: "" } : {}),
      xtream: { server: p.xtream.server, username: "", password: "" },
    };
  } else {
    Object.assign(entry, loginOf(stored));
    if (stored?.epgBuilt && p.epgUrl === "" && loginOf(stored)) entry.epgBuilt = true;
  }
  const url = next.url ? fullUrl(next.url, stored?.url) : undefined;
  if (url != null) {
    entry.url = url;
    next = { ...next, url: redactUrl(url) };
  }
  const epgUrl = next.epgUrl ? fullUrl(next.epgUrl, stored?.epgUrl) : undefined;
  if (epgUrl != null) {
    entry.epgUrl = epgUrl;
    next = { ...next, epgUrl: redactUrl(epgUrl) };
  }
  return { next, entry: Object.keys(entry).length > 0 ? entry : null };
}

/** Moves Xtream logins and credential-bearing typed URLs into the map; the list keeps blanked or redacted URLs. */
export function splitCredentials(
  lists: readonly StoredPlaylist[],
  stored: CredentialMap,
): { stripped: StoredPlaylist[]; credentials: CredentialMap } {
  const credentials: CredentialMap = {};
  const stripped = lists.map((p) => {
    const { next, entry } = splitOne(p, stored[p.id]);
    if (entry) credentials[p.id] = entry;
    return next;
  });
  return { stripped, credentials };
}

/** Restores logins, blanked and redacted URLs; a value still in plaintext in the list is newer than the map's and wins. */
export function joinCredentials(
  lists: readonly StoredPlaylist[],
  credentials: CredentialMap,
): StoredPlaylist[] {
  return lists.map((p) => {
    const entry = credentials[p.id];
    if (!entry) return p;
    let next = p;
    const creds = loginOf(entry);
    if (p.xtream && creds && !plaintextOf(p)) {
      const built = buildXtreamUrls(p.xtream.server, creds.username, creds.password);
      next = {
        ...p,
        url: p.url || built.m3u,
        ...(p.epgUrl === "" && entry.epgBuilt ? { epgUrl: built.epg } : {}),
        xtream: { ...p.xtream, username: creds.username, password: creds.password },
      };
    }
    if (entry.url != null && next.url && !hasUrlSecrets(next.url)) {
      const url = fullUrl(next.url, entry.url);
      if (url != null) next = { ...next, url };
    }
    if (entry.epgUrl != null && next.epgUrl && !hasUrlSecrets(next.epgUrl)) {
      const epgUrl = fullUrl(next.epgUrl, entry.epgUrl);
      if (epgUrl != null) next = { ...next, epgUrl };
    }
    return next;
  });
}

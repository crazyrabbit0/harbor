export const URL_SECRET_PLACEHOLDER = "***";

// Query param names whose value is a credential, compared lowercased after percent-decoding.
const SECRET_PARAMS: ReadonlySet<string> = new Set([
  "user",
  "username",
  "pass",
  "password",
  "passwd",
  "pwd",
  "token",
  "access_token",
  "auth_token",
  "key",
  "apikey",
  "api_key",
]);

const AUTHORITY_RE = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)/i;

function secretPart(value: string): boolean {
  return value !== "" && value !== URL_SECRET_PLACEHOLDER;
}

function mask(value: string): string {
  return secretPart(value) ? URL_SECRET_PLACEHOLDER : value;
}

function paramName(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " ")).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function redactAuthority(head: string): string {
  const match = AUTHORITY_RE.exec(head);
  if (!match) return head;
  const [whole, scheme, authority] = match;
  const at = authority.lastIndexOf("@");
  if (at < 0) return head;
  const userinfo = authority.slice(0, at);
  const colon = userinfo.indexOf(":");
  const masked =
    colon < 0
      ? mask(userinfo)
      : `${mask(userinfo.slice(0, colon))}:${mask(userinfo.slice(colon + 1))}`;
  return `${scheme}${masked}${authority.slice(at)}${head.slice(whole.length)}`;
}

function redactQuery(query: string): string {
  return query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq < 0) return pair;
      const value = pair.slice(eq + 1);
      if (!SECRET_PARAMS.has(paramName(pair.slice(0, eq))) || !secretPart(value)) return pair;
      return `${pair.slice(0, eq + 1)}${URL_SECRET_PLACEHOLDER}`;
    })
    .join("&");
}

/** Replaces userinfo parts and credential query values with the placeholder; every other byte stays as typed. */
export function redactUrl(url: string): string {
  const hash = url.indexOf("#");
  const beforeHash = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? "" : url.slice(hash);
  const question = beforeHash.indexOf("?");
  const head = question < 0 ? beforeHash : beforeHash.slice(0, question);
  const query = question < 0 ? null : beforeHash.slice(question + 1);
  const redactedQuery = query == null ? "" : `?${redactQuery(query)}`;
  return `${redactAuthority(head)}${redactedQuery}${fragment}`;
}

export function hasUrlSecrets(url: string): boolean {
  return redactUrl(url) !== url;
}

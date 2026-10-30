// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  URL_SECRET_PLACEHOLDER,
  hasUrlSecrets,
  redactUrl,
} from "../src/lib/iptv/url-credentials.ts";
import {
  joinCredentials,
  parseCredentials,
  serializeCredentials,
  splitCredentials,
} from "../src/lib/iptv/playlist-credentials.ts";

test("userinfo credentials are detected and replaced part by part", () => {
  assert.equal(URL_SECRET_PLACEHOLDER, "***");
  assert.equal(hasUrlSecrets("http://alice:pa:ss@host.example:81/list.m3u"), true);
  assert.equal(
    redactUrl("http://alice:pa:ss@host.example:81/list.m3u"),
    "http://***:***@host.example:81/list.m3u",
  );
  assert.equal(redactUrl("https://alice@host.example/x"), "https://***@host.example/x");
  assert.equal(redactUrl("https://:only-pass@host.example/x"), "https://:***@host.example/x");
  assert.equal(hasUrlSecrets("http://host.example/a@b.m3u"), false);
  assert.equal(hasUrlSecrets("http://host.example/x?next=a@b"), false);
});

test("credential query params are matched case-insensitively and only their values change", () => {
  const url =
    "http://h.example/get.php?UserName=bob&PassWord=s%26cret&type=m3u_plus&output=ts#frag";
  assert.equal(hasUrlSecrets(url), true);
  assert.equal(
    redactUrl(url),
    "http://h.example/get.php?UserName=***&PassWord=***&type=m3u_plus&output=ts#frag",
  );
  assert.equal(
    redactUrl("http://h.example/e.xml?user=a&pass=b&TOKEN=c&Key=d&api_key=e&apikey=f&pwd=g"),
    "http://h.example/e.xml?user=***&pass=***&TOKEN=***&Key=***&api_key=***&apikey=***&pwd=***",
  );
  assert.equal(
    redactUrl("http://h.example/p?access_token=x&auth_token=y&passwd=z"),
    "http://h.example/p?access_token=***&auth_token=***&passwd=***",
  );
});

test("unrelated params, empty values and placeholders are not secrets", () => {
  for (const url of [
    "http://h.example/get.php?type=m3u_plus&output=ts",
    "http://h.example/list.m3u?keyword=news&user_agent=vlc&monkey=1&passport=2",
    "http://h.example/list.m3u?username=&password=",
    "http://h.example/list.m3u?username=***&password=***",
    "http://***:***@h.example/list.m3u",
    "http://h.example/list.m3u#token=abc",
    "not a url",
    "",
  ]) {
    assert.equal(hasUrlSecrets(url), false, url);
    assert.equal(redactUrl(url), url, url);
  }
});

const TYPED = {
  id: "m3u-typed",
  name: "Typed",
  url: "http://u%40x:p%2Fw@lists.example/get.php?username=Bob&Password=pa%20ss+1&type=m3u_plus&output=ts",
  epgUrl: "http://lists.example/xmltv.php?token=t0k&days=3",
  kind: "m3u" as const,
};
const EPG_ONLY = {
  id: "epg-1",
  name: "Guide",
  url: "",
  epgUrl: "https://g.example/e.xml?key=k3y",
  kind: "epg" as const,
};
const PLAIN = {
  id: "plain",
  name: "Plain",
  url: "http://lists.example/a.m3u?type=m3u_plus",
  kind: "m3u" as const,
};

test("split keeps redacted URLs in the list and join restores them byte for byte", () => {
  const lists = [TYPED, EPG_ONLY, PLAIN];
  const { stripped, credentials } = splitCredentials(lists, {});
  const text = JSON.stringify(stripped);
  for (const secret of ["u%40x", "p%2Fw", "Bob", "pa%20ss", "t0k", "k3y"]) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.equal(
    stripped[0].url,
    "http://***:***@lists.example/get.php?username=***&Password=***&type=m3u_plus&output=ts",
  );
  assert.equal(stripped[0].epgUrl, "http://lists.example/xmltv.php?token=***&days=3");
  assert.equal(stripped[1].epgUrl, "https://g.example/e.xml?key=***");
  assert.deepEqual(stripped[2], PLAIN);
  assert.deepEqual(Object.keys(credentials).sort(), ["epg-1", "m3u-typed"]);
  const reparsed = parseCredentials(serializeCredentials(credentials));
  assert.deepEqual(joinCredentials(stripped, reparsed), lists);
});

test("a URL edited in the list wins over the stored one, and a redacted list keeps its stored URL on split", () => {
  const { stripped, credentials } = splitCredentials([TYPED], {});
  const resplit = splitCredentials(stripped, credentials);
  assert.deepEqual(resplit.credentials, credentials);
  const edited = [{ ...stripped[0], url: "http://other.example/list.m3u" }];
  assert.equal(joinCredentials(edited, credentials)[0].url, "http://other.example/list.m3u");
  assert.equal(splitCredentials(edited, credentials).credentials[TYPED.id].url, undefined);
});

test("old credential entries without URL fields still parse as Xtream logins", () => {
  const raw = JSON.stringify({ a: { username: "u", password: "p" }, b: { nope: 1 } });
  assert.deepEqual(parseCredentials(raw), { a: { username: "u", password: "p" } });
});

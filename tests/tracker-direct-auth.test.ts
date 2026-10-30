// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { HARBOR_TRAKT_CLIENT_ID, LEGACY_TRAKT_CLIENT_ID } from "../src/lib/trakt/config.ts";
import { HARBOR_MAL_CLIENT_ID } from "../src/lib/mal/config.ts";
import {
  hasTraktClientId,
  sessionClientId,
  setTraktCredentials,
  traktApiKey,
  traktClientId,
  traktClientSecretFor,
} from "../src/lib/trakt/credentials.ts";
import { hasMalClientId, malClientId, setMalClientId } from "../src/lib/mal/credentials.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const session = { accessToken: "a", refreshToken: "r", createdAt: 1, expiresIn: 1, username: null };

test("Trakt signs in with the fork's app unless settings name another", () => {
  setTraktCredentials("", "");
  assert.equal(traktClientId(), HARBOR_TRAKT_CLIENT_ID);
  assert.equal(traktClientSecretFor(HARBOR_TRAKT_CLIENT_ID), "");
  setTraktCredentials("  mine  ", " secret ");
  assert.equal(traktClientId(), "mine");
  assert.equal(hasTraktClientId(), true);
});

test("the Trakt secret is only sent for the client it belongs to", () => {
  setTraktCredentials("mine", "secret");
  assert.equal(traktClientSecretFor("mine"), "secret");
  assert.equal(traktClientSecretFor(LEGACY_TRAKT_CLIENT_ID), "");
});

test("existing Trakt sessions keep the API key of the app that issued them", () => {
  setTraktCredentials("mine", "");
  assert.equal(sessionClientId(session), LEGACY_TRAKT_CLIENT_ID);
  assert.equal(traktApiKey(session), LEGACY_TRAKT_CLIENT_ID);
  assert.equal(traktApiKey({ ...session, clientId: "mine" }), "mine");
  assert.equal(traktApiKey(null), "mine");
  setTraktCredentials("", "");
  assert.equal(traktApiKey(null), HARBOR_TRAKT_CLIENT_ID);
});

test("MAL signs in with the fork's client unless settings name another", () => {
  setMalClientId("");
  assert.equal(malClientId(), HARBOR_MAL_CLIENT_ID);
  assert.equal(hasMalClientId(), true);
  setMalClientId(" abc ");
  assert.equal(malClientId(), "abc");
});

test("tracker auth talks to the real services, not harbor.site", () => {
  const sources = [
    "src/lib/trakt/client.ts",
    "src/lib/trakt/device-auth.ts",
    "src/lib/mal/auth.ts",
    "src/lib/anilist/auth.ts",
    "src/lib/simkl/ratings.ts",
    "src/lib/simkl/ratings-url.ts",
  ].map(read);
  for (const src of sources) assert.doesNotMatch(src, /HARBOR_[A-Z]+_BASE|harbor\.site/);
  assert.match(read("src/lib/trakt/device-auth.ts"), /\/oauth\/device\/token/);
  assert.match(read("src/lib/trakt/client.ts"), /\/oauth\/token/);
  assert.match(read("src/lib/mal/config.ts"), /myanimelist\.net\/v1\/oauth2\/token/);
  assert.match(read("src/lib/mal/auth.ts"), /code_challenge_method: "plain"/);
  assert.match(read("src/lib/anilist/auth.ts"), /response_type: "token"/);
  assert.match(read("src/lib/simkl/ratings-url.ts"), /\$\{app\.base\}\/ratings/);
  assert.match(read("src/lib/simkl/ratings.ts"), /base: SIMKL_API_BASE/);
});

test("new tracker hosts are proxied for the browser build", () => {
  const safeFetch = read("src/lib/safe-fetch.ts");
  const vite = read("vite.config.ts");
  const devHosts = JSON.parse(read("src/lib/dev-proxy-hosts.json")) as string[];
  assert.match(vite, /DEV_PROXY_HOST_LIST\.map\(/, "the vite proxy is built from the shared list");
  assert.match(safeFetch, /new Set\(DEV_PROXY_HOST_LIST\)/, "safe-fetch reads the shared list");
  for (const host of [
    "api.trakt.tv",
    "myanimelist.net",
    "api.myanimelist.net",
    "caching.graphql.imdb.com",
  ]) {
    assert.ok(safeFetch.includes(`"${host}"`), `${host} missing from PROXY_HOSTS`);
    assert.ok(devHosts.includes(host), `${host} missing from the dev proxy list`);
  }
});

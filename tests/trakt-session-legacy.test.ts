import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const MARKER = "harbor.trakt.legacy-migrated.v1";

function fixture(opts: { primary?: boolean; blob?: Record<string, unknown> } = {}) {
  const secrets = new Map<string, string>();
  const storage = new Map<string, string>();
  if (opts.blob) storage.set("harbor.settings", JSON.stringify(opts.blob));
  const profile = { primary: opts.primary ?? true };
  const localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
  };
  const mocks: Record<string, unknown> = {
    "@/lib/active-profile-id": {
      activeProfileId: () => "p1",
      activeProfileIsPrimary: () => profile.primary,
    },
    "@/lib/secret-store": {
      getSecret: (k: string) => secrets.get(k) ?? null,
      setSecret: (k: string, v: string | null) => {
        if (v === null) secrets.delete(k);
        else secrets.set(k, v);
      },
      subscribeSecretsReady: () => () => {},
    },
    "./pending-sync": { clearPendingStops: () => {} },
    "./config": { REFRESH_THRESHOLD_SEC: 300 },
  };
  const source = readFileSync(new URL("../src/lib/trakt/session.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const api = {} as typeof import("../src/lib/trakt/session");
  new Function("require", "exports", "window", "localStorage", output)(
    (id: string) => {
      assert.ok(id in mocks, id);
      return mocks[id];
    },
    api,
    undefined,
    localStorage,
  );
  return { api, storage, secrets, profile };
}

const legacyBlob = () => ({
  traktAccessToken: "legacy-access",
  traktRefreshToken: "legacy-refresh",
  traktExpiresAt: Date.now() + 3_600_000,
  traktUsername: "legacy-user",
});

test("legacy settings tokens migrate once and a disconnect stays disconnected", () => {
  const h = fixture({ blob: legacyBlob() });
  const first = h.api.getSession();
  assert.equal(first?.accessToken, "legacy-access");
  assert.equal(first?.username, "legacy-user");
  h.api.setSession(null);
  h.api.resetForProfile();
  assert.equal(h.api.getSession(), null);
});

test("a fresh profile without legacy data has no session", () => {
  const h = fixture();
  assert.equal(h.api.getSession(), null);
  assert.equal(h.storage.get(MARKER) !== undefined, true);
});

test("the migration marker is set on the first read even when nothing migrates", () => {
  const h = fixture();
  h.api.getSession();
  h.storage.set("harbor.settings", JSON.stringify(legacyBlob()));
  h.api.resetForProfile();
  assert.equal(h.api.getSession(), null);
});

test("a secondary profile read leaves the legacy migration for the primary profile", () => {
  const h = fixture({ primary: false, blob: legacyBlob() });
  assert.equal(h.api.getSession(), null);
  assert.equal(h.storage.get(MARKER), undefined);
  h.profile.primary = true;
  h.api.resetForProfile();
  assert.equal(h.api.getSession()?.accessToken, "legacy-access");
});

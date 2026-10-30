import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const KEY = "harbor.iptv.playlists.v1";

function harness(seed: Record<string, unknown>, failWrite = false) {
  const data = new Map<string, string>();
  for (const [k, v] of Object.entries(seed)) data.set(k, JSON.stringify(v));
  const storage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  const compiled = ts.transpileModule(readFileSync("src/lib/iptv/playlists-store.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mocks: Record<string, unknown> = {
    react: { useSyncExternalStore: () => [] },
    "@/lib/storage-recovery": {
      setItemWithRecovery: (k: string, v: string) => (failWrite ? false : (data.set(k, v), true)),
    },
    "@/lib/secret-store": {
      IPTV_CREDENTIALS_KEY: "creds",
      getSecret: () => null,
      getSecretsWriteStatus: () => ({ ok: true }),
      secretsDurable: () => true,
      secretsSettled: () => true,
      setSecret: () => {},
      subscribeSecretsDurable: () => () => {},
      subscribeSecretsSettled: () => () => {},
      subscribeSecretsWriteStatus: () => () => {},
    },
    "./playlist-credentials": {
      hasPlaintextCredentials: () => false,
      joinCredentials: (lists: unknown) => lists,
      parseCredentials: () => ({}),
      serializeCredentials: () => "{}",
      splitCredentials: (lists: unknown) => ({ lists, credentials: {} }),
    },
  };
  const exports: Record<string, any> = {};
  new Function("require", "exports", "localStorage", compiled)(
    (id: string) => {
      assert.ok(Object.hasOwn(mocks, id), `Unexpected import: ${id}`);
      return mocks[id];
    },
    exports,
    storage,
  );
  const blob = (k: string) => JSON.parse(data.get(k) ?? "null");
  return { store: exports, blob };
}

const a = { id: "a", name: "A", url: "http://a/list.m3u" };
const b = { id: "b", name: "B", url: "http://b/list.m3u" };

test("startup moves a playlist saved into a settings blob into the store, even when the store exists", () => {
  const h = harness({ [KEY]: [a], "harbor.settings.shared": { iptvPlaylists: [b], region: "GR" } });
  h.store.migrateLegacyPlaylists();
  assert.deepEqual(
    h.blob(KEY).map((p: { id: string }) => p.id),
    ["a", "b"],
  );
  assert.deepEqual(h.blob("harbor.settings.shared"), { region: "GR" });
});

test("a stored entry wins over the same id left in a settings blob", () => {
  const h = harness({ [KEY]: [a], "harbor.settings": { iptvPlaylists: [{ ...a, name: "old" }] } });
  h.store.migrateLegacyPlaylists();
  assert.equal(h.blob(KEY)[0].name, "A");
  assert.deepEqual(h.blob("harbor.settings"), {});
});

test("a failed store write keeps the playlists in the settings blob", () => {
  const h = harness({ "harbor.settings.p_1_x": { iptvPlaylists: [b] } }, true);
  h.store.migrateLegacyPlaylists();
  assert.equal(h.blob(KEY), null);
  assert.deepEqual(h.blob("harbor.settings.p_1_x"), { iptvPlaylists: [b] });
});

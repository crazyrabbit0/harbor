// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";
import "./_localstorage-stub.ts";

// A Rust secrets.json behind a fake Tauri bridge; the modules read the bridge only at call time.
let secretsFile: string | null = null;
let failSecretWrites = false;
const events = new EventTarget();
(globalThis as { window?: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { content?: string }) => {
      if (cmd === "secrets_read") return secretsFile;
      if (cmd === "secrets_write") {
        if (failSecretWrites) throw new Error("disk full");
        secretsFile = args.content ?? null;
        return null;
      }
      throw new Error(`unexpected command ${cmd}`);
    },
  },
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events),
  dispatchEvent: events.dispatchEvent.bind(events),
};

const PLAYLISTS_KEY = "harbor.iptv.playlists.v1";
const CREDENTIALS_KEY = "harbor.iptv.credentials.v1";
const SERVER = "http://iptv.example:8080";

const secretStore = await import("../src/lib/secret-store.ts");
const { buildXtreamUrls } = await import("../src/lib/iptv/playlist-entry.ts");

function xtream(id: string, username: string, password: string) {
  const { m3u, epg } = buildXtreamUrls(SERVER, username, password);
  return {
    id,
    name: id,
    url: m3u,
    epgUrl: epg,
    kind: "xtream" as const,
    xtream: { server: SERVER, username, password },
  };
}

const M3U = {
  id: "m3u-1",
  name: "Plain",
  url: "http://lists.example/a.m3u",
  epgUrl: "http://lists.example/epg.xml",
  kind: "m3u" as const,
};

function fileCredentials(): Record<string, { username: string; password: string }> {
  const all = JSON.parse(secretsFile ?? "{}") as Record<string, string>;
  return all[CREDENTIALS_KEY] ? JSON.parse(all[CREDENTIALS_KEY]) : {};
}

function storedText(): string {
  return localStorage.getItem(PLAYLISTS_KEY) ?? "";
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  await secretStore.flushSecrets();
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

const LEGACY = xtream("xt-legacy", "alice", "legacy-pass");
localStorage.setItem(PLAYLISTS_KEY, JSON.stringify([LEGACY, M3U]));
const store = await import("../src/lib/iptv/playlists-store.ts");

test("legacy plaintext logins stay readable before secrets load and move to the store once they settle", async () => {
  assert.deepEqual(store.readPlaylists(), [LEGACY, M3U]);
  assert.ok(storedText().includes("legacy-pass"));
  await secretStore.loadSecrets();
  await settle();
  assert.deepEqual(fileCredentials()[LEGACY.id], { username: "alice", password: "legacy-pass" });
  assert.equal(storedText().includes("legacy-pass"), false);
  assert.equal(storedText().includes("alice"), false);
  assert.deepEqual(store.readPlaylists(), [LEGACY, M3U]);
});

test("a write keeps passwords out of localStorage and reads return complete playlists", async () => {
  const next = [xtream("xt-new", "bob", "s3cr3t&=pw"), M3U];
  assert.equal(store.writePlaylists(next), true);
  await settle();
  assert.equal(storedText().includes("s3cr3t"), false);
  assert.equal(storedText().includes("bob"), false);
  assert.ok(storedText().includes(M3U.url));
  assert.deepEqual(store.readPlaylists(), next);
  assert.deepEqual(Object.keys(fileCredentials()), ["xt-new"]);
});

test("while secrets.json writes fail the list keeps its plaintext logins until a write succeeds", async () => {
  failSecretWrites = true;
  const next = [xtream("xt-fail", "carol", "fail-pass")];
  store.writePlaylists(next);
  await settle();
  assert.equal(secretStore.getSecretsWriteStatus().ok, false);
  assert.ok(storedText().includes("fail-pass"));
  assert.deepEqual(store.readPlaylists(), next);
  failSecretWrites = false;
  await settle();
  assert.equal(secretStore.getSecretsWriteStatus().ok, true);
  await settle();
  assert.equal(storedText().includes("fail-pass"), false);
  assert.deepEqual(fileCredentials()["xt-fail"], { username: "carol", password: "fail-pass" });
  assert.deepEqual(store.readPlaylists(), next);
});

// backup.ts is evaluated with its app-only imports stubbed and the real storage modules underneath.
async function loadBackup(): Promise<typeof import("../src/lib/backup.ts")> {
  const source = readFileSync(new URL("../src/lib/backup.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const mocks: Record<string, unknown> = {
    "@/lib/download-text": {},
    "@/lib/profile-sync/backup-payload": { buildSyncBackup: () => ({}) },
    "@/lib/theme-storage": { loadBgImage: async () => null, saveBgImage: async () => {} },
    "@/lib/profiles": { readAllProfilesIdentity: () => [] },
    "@/lib/active-profile-id": { activeProfileId: () => "p_ab_cd" },
    "@/lib/secret-store": secretStore,
    "@/lib/settings/profile-store": await import("../src/lib/settings/profile-store.ts"),
    "@/lib/storage-recovery": await import("../src/lib/storage-recovery.ts"),
    "@/lib/local-library": {
      localLibraryReady: async () => {},
      readLocalLibrary: () => ({}),
      restoreLocalLibrary() {},
    },
  };
  const module = { exports: {} };
  const require = (name: string) => {
    assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
    return mocks[name];
  };
  new Function("require", "module", "exports", "__APP_VERSION__", outputText)(
    require,
    module,
    module.exports,
    "test",
  );
  return module.exports as typeof import("../src/lib/backup.ts");
}

test("Xtream logins export only with the Xtream credentials section and restore under the same key", async () => {
  const backup = await loadBackup();
  store.writePlaylists([xtream("xt-bk", "dave", "bk-pass"), M3U]);
  await settle();
  assert.equal(backup.sectionOf(CREDENTIALS_KEY), "iptvCredentials");
  const liveOnly = await backup.buildBackup(["iptv"]);
  assert.equal(liveOnly.data[CREDENTIALS_KEY], undefined);
  assert.equal(JSON.stringify(liveOnly.data).includes("bk-pass"), false);
  const full = await backup.buildBackup(["iptv", "iptvCredentials"]);
  assert.ok(full.data[CREDENTIALS_KEY]?.includes("bk-pass"));
  assert.equal((full.data[PLAYLISTS_KEY] ?? "").includes("bk-pass"), false);

  secretStore.setSecret(CREDENTIALS_KEY, null);
  localStorage.removeItem(PLAYLISTS_KEY);
  await backup.applyBackup(full);
  await settle();
  assert.equal(secretStore.getSecret(`${CREDENTIALS_KEY}.p_ab_cd`), null);
  assert.deepEqual(store.readPlaylists(), [xtream("xt-bk", "dave", "bk-pass"), M3U]);
});

test("restoring an older backup with plaintext Xtream logins moves them into the store", async () => {
  const backup = await loadBackup();
  const old = xtream("xt-old", "erin", "old-pass");
  await backup.applyBackup({
    format: "harbor-backup",
    version: 1,
    app: "old",
    exportedAt: "",
    sections: ["iptv", "iptvCredentials"],
    data: { [PLAYLISTS_KEY]: JSON.stringify([old]) },
  });
  assert.deepEqual(store.readPlaylists(), [old]);
  await settle();
  assert.equal(storedText().includes("old-pass"), false);
  assert.deepEqual(fileCredentials()["xt-old"], { username: "erin", password: "old-pass" });
  assert.deepEqual(store.readPlaylists(), [old]);
});

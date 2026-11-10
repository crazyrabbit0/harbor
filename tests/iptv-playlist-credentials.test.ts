// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import { loadModule } from "./helpers/hook-harness.ts";
import { profileRosterFor } from "./helpers/profile-roster.ts";

// A Rust secrets.json behind a fake Tauri bridge; the modules read the bridge only at call time.
let secretsFile: string | null = null;
let failSecretWrites = false;
let heldWrite: Promise<void> | null = null;
const events = new EventTarget();
(globalThis as { window?: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { content?: string }) => {
      if (cmd === "secrets_read") return secretsFile;
      if (cmd === "secrets_write") {
        if (heldWrite) await heldWrite;
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

// An Xtream login as stored, with the marker for an EPG URL blanked because it was the built one.
function xtreamLogin(username: string, password: string) {
  return { username, password, epgBuilt: true };
}

function storedText(): string {
  return localStorage.getItem(PLAYLISTS_KEY) ?? "";
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  await secretStore.flushSecrets();
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function typed(id: string, user: string, pass: string) {
  return {
    id,
    name: id,
    url: `http://${user}:${pass}@typed.example/list.m3u?type=m3u_plus&output=ts`,
    epgUrl: `http://typed.example/epg.xml?Token=${pass}-epg`,
    kind: "m3u" as const,
  };
}

const LEGACY = xtream("xt-legacy", "alice", "legacy-pass");
const LEGACY_TYPED = typed("m3u-legacy", "ty-user", "ty-pass");
localStorage.setItem(PLAYLISTS_KEY, JSON.stringify([LEGACY, M3U, LEGACY_TYPED]));
const store = await import("../src/lib/iptv/playlists-store.ts");

test("legacy plaintext logins stay readable before secrets load and move to the store once they settle", async () => {
  assert.deepEqual(store.readPlaylists(), [LEGACY, M3U, LEGACY_TYPED]);
  assert.ok(storedText().includes("legacy-pass"));
  assert.ok(storedText().includes("ty-pass"));
  await secretStore.loadSecrets();
  await settle();
  assert.deepEqual(fileCredentials()[LEGACY.id], xtreamLogin("alice", "legacy-pass"));
  assert.equal(fileCredentials()[LEGACY_TYPED.id]?.url, LEGACY_TYPED.url);
  for (const secret of ["legacy-pass", "alice", "ty-user", "ty-pass"]) {
    assert.equal(storedText().includes(secret), false, secret);
  }
  assert.ok(storedText().includes("http://***:***@typed.example/list.m3u?type=m3u_plus&output=ts"));
  assert.ok(storedText().includes("epg.xml?Token=***"));
  assert.deepEqual(store.readPlaylists(), [LEGACY, M3U, LEGACY_TYPED]);
});

test("a typed URL with credentials stays out of localStorage and reads back in full", async () => {
  const next = [typed("m3u-new", "new-user", "new-pass"), M3U];
  assert.equal(store.writePlaylists(next), true);
  await settle();
  assert.equal(storedText().includes("new-user"), false);
  assert.equal(storedText().includes("new-pass"), false);
  assert.deepEqual(store.readPlaylists(), next);
  assert.deepEqual(Object.keys(fileCredentials()), ["m3u-new"]);
});

test("while secrets.json writes fail a typed URL keeps its plaintext until a write succeeds", async () => {
  failSecretWrites = true;
  const next = [typed("m3u-fail", "fail-user", "fail-typed")];
  store.writePlaylists(next);
  await settle();
  assert.equal(secretStore.getSecretsWriteStatus().ok, false);
  assert.ok(storedText().includes("fail-typed"));
  assert.deepEqual(store.readPlaylists(), next);
  failSecretWrites = false;
  await settle();
  await settle();
  assert.equal(secretStore.getSecretsWriteStatus().ok, true);
  assert.equal(storedText().includes("fail-typed"), false);
  assert.equal(fileCredentials()["m3u-fail"]?.url, next[0].url);
  assert.deepEqual(store.readPlaylists(), next);
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

test("a new login stays in the list until secrets_write lands, then the list drops it", async () => {
  let release = () => {};
  heldWrite = new Promise<void>((r) => (release = r));
  const next = [xtream("xt-held", "henry", "held-pass")];
  store.writePlaylists(next);
  assert.equal(secretStore.secretsDurable(), false);
  assert.ok(storedText().includes("held-pass"));
  const flushing = secretStore.flushSecrets();
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  store.writePlaylists(next);
  assert.ok(storedText().includes("held-pass"));
  assert.equal(fileCredentials()["xt-held"], undefined);

  heldWrite = null;
  release();
  await flushing;
  assert.deepEqual(fileCredentials()["xt-held"], xtreamLogin("henry", "held-pass"));
  assert.equal(storedText().includes("held-pass"), false);
  assert.deepEqual(store.readPlaylists(), next);
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
  assert.deepEqual(fileCredentials()["xt-fail"], xtreamLogin("carol", "fail-pass"));
  assert.deepEqual(store.readPlaylists(), next);
});

test("an Xtream EPG the user cleared stays cleared, a blanked built one comes back", async () => {
  const { splitCredentials, joinCredentials } =
    await import("../src/lib/iptv/playlist-credentials.ts");
  const built = xtream("xt-epg", "ivy", "epg-pass");
  const cleared = { ...xtream("xt-noepg", "jay", "noepg-pass"), epgUrl: "" };
  const split = splitCredentials([built, cleared], {});
  assert.equal(split.stripped[0].epgUrl, "");
  assert.equal(split.stripped[1].epgUrl, "");
  assert.deepEqual(joinCredentials(split.stripped, split.credentials), [built, cleared]);
  const resplit = splitCredentials(split.stripped, split.credentials);
  assert.deepEqual(resplit.credentials, split.credentials);

  store.writePlaylists([built, cleared]);
  await settle();
  assert.deepEqual(store.readPlaylists(), [built, cleared]);
});

// backup.ts is evaluated with its app-only imports stubbed and the real storage modules underneath.
async function loadBackup(): Promise<typeof import("../src/lib/backup.ts")> {
  const mocks: Record<string, unknown> = {
    "@/lib/download-text": {},
    "@/lib/profile-sync/backup-payload": { buildSyncBackup: () => ({}) },
    "@/lib/theme-storage": { loadBgImage: async () => null, saveBgImage: async () => {} },
    "@/lib/profiles": { readAllProfilesIdentity: () => [] },
    "@/lib/profile-roster": profileRosterFor(localStorage),
    "@/lib/active-profile-id": { activeProfileId: () => "p_ab_cd" },
    "@/lib/secret-store": secretStore,
    "@/lib/settings/profile-store": await import("../src/lib/settings/profile-store.ts"),
    "@/lib/storage-recovery": await import("../src/lib/storage-recovery.ts"),
    "@/lib/durable-store": { flushDurableStore: async () => {} },
    "@/lib/ebook/covers": {
      eBookCoverRefs: () => [],
      readEBookCovers: async () => ({}),
      restoreEBookCovers: async () => {},
    },
    "@/lib/collection-images": {
      collectionImageRefs: () => [],
      readCollectionImages: async () => ({}),
      releaseCollectionImage() {},
      restoreCollectionImages: async () => {},
    },
    "@/lib/iptv/url-credentials": await import("../src/lib/iptv/url-credentials.ts"),
    "@/lib/local-library": {
      localLibraryReady: async () => {},
      readLocalLibrary: () => ({}),
      restoreLocalLibrary() {},
    },
  };
  return loadModule("src/lib/backup.ts", mocks, {
    __APP_VERSION__: "test",
  }) as typeof import("../src/lib/backup.ts");
}

test("Xtream logins export only with the Xtream credentials section and restore under the same key", async () => {
  const backup = await loadBackup();
  const typedBk = typed("m3u-bk", "bk-user", "bk-typed");
  store.writePlaylists([xtream("xt-bk", "dave", "bk-pass"), M3U, typedBk]);
  await settle();
  assert.equal(backup.sectionOf(CREDENTIALS_KEY), "iptvCredentials");
  const liveOnly = await backup.buildBackup(["iptv"]);
  assert.equal(liveOnly.data[CREDENTIALS_KEY], undefined);
  assert.equal(JSON.stringify(liveOnly.data).includes("bk-pass"), false);
  assert.equal(JSON.stringify(liveOnly.data).includes("bk-typed"), false);
  // Playlists that need a login are left out whole, so a restore never brings back a URL with *** in it.
  const exported = JSON.parse(liveOnly.data[PLAYLISTS_KEY] ?? "[]") as { id: string }[];
  assert.deepEqual(
    exported.map((p) => p.id),
    [M3U.id],
  );
  const full = await backup.buildBackup(["iptv", "iptvCredentials"]);
  assert.ok(full.data[CREDENTIALS_KEY]?.includes("bk-pass"));
  assert.equal((full.data[PLAYLISTS_KEY] ?? "").includes("bk-pass"), false);

  secretStore.setSecret(CREDENTIALS_KEY, null);
  localStorage.removeItem(PLAYLISTS_KEY);
  await backup.applyBackup(full);
  await settle();
  assert.equal(secretStore.getSecret(`${CREDENTIALS_KEY}.p_ab_cd`), null);
  assert.deepEqual(store.readPlaylists(), [xtream("xt-bk", "dave", "bk-pass"), M3U, typedBk]);
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
  assert.deepEqual(fileCredentials()["xt-old"], xtreamLogin("erin", "old-pass"));
  assert.deepEqual(store.readPlaylists(), [old]);
});

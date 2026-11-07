// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import { loadModule } from "./helpers/hook-harness.ts";
import { profileRosterFor } from "./helpers/profile-roster.ts";

const secretStore = await import("../src/lib/secret-store.ts");
const profileStore = await import("../src/lib/settings/profile-store.ts");
const fields = await import("../src/lib/settings/secret-fields.ts");
const { DEFAULT } = await import("../src/lib/settings/defaults.ts");
const recovery = await import("../src/lib/storage-recovery.ts");

type Settings = typeof DEFAULT;

// A Rust secrets.json behind a fake Tauri bridge; the modules read the bridge only at call time.
let secretsFile: string | null = JSON.stringify({
  "harbor.settings-secrets.v1.shared": JSON.stringify({ rdKey: "stored-rd" }),
});
let secretWrites = 0;
let failSecretWrites = false;
const events = new EventTarget();
(globalThis as { window?: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { content?: string }) => {
      if (cmd === "secrets_read") return secretsFile;
      if (cmd === "secrets_write") {
        if (failSecretWrites) throw new Error("disk full");
        secretWrites++;
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

const SHARED_SCOPE = "harbor.settings-secrets.v1.shared";

function fileSecrets(key: string): Record<string, string> {
  const all = JSON.parse(secretsFile ?? "{}") as Record<string, string>;
  return all[key] ? (JSON.parse(all[key]) as Record<string, string>) : {};
}

function settingsWith(over: Partial<Settings>): Settings {
  return { ...DEFAULT, ...over };
}

function blobOf(key: string): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
}

test("the serialized blob carries none of the secret settings", () => {
  const filled = Object.fromEntries(fields.SECRET_SETTING_KEYS.map((k) => [k, `v-${k}`]));
  const json = profileStore.serializeSettings(settingsWith({ ...filled, tmdbKey: "tmdb" }));
  const parsed = JSON.parse(json) as Record<string, unknown>;
  for (const key of fields.SECRET_SETTING_KEYS) assert.equal(key in parsed, false, key);
  assert.ok(fields.SECRET_SETTING_KEYS.length >= 8);
  for (const key of ["tmdbKey", "tvdbKey", "rdKey", "tbKey", "adKey", "pmKey", "dlKey"] as const) {
    assert.ok((fields.SECRET_SETTING_KEYS as readonly string[]).includes(key), key);
  }
  assert.equal("tmdbKey" in parsed, false);
});

test("legacy Trakt tokens stay in the blob until the Trakt session import has run", () => {
  const legacy = settingsWith({
    traktAccessToken: "a",
    traktRefreshToken: "r",
    traktExpiresAt: 5,
  });
  const before = JSON.parse(profileStore.serializeSettings(legacy)) as Record<string, unknown>;
  assert.equal(before.traktAccessToken, "a");
  localStorage.setItem(fields.TRAKT_LEGACY_MIGRATED_KEY, "1");
  const after = JSON.parse(profileStore.serializeSettings(legacy)) as Record<string, unknown>;
  localStorage.removeItem(fields.TRAKT_LEGACY_MIGRATED_KEY);
  for (const key of fields.LEGACY_TRAKT_KEYS) assert.equal(key in after, false, key);
});

test("an empty value persisted before secrets are ready never erases a stored key", async () => {
  profileStore.persistEffective(settingsWith({ rdKey: "" }), "default", true);
  await secretStore.loadSecrets();
  await secretStore.flushSecrets();
  assert.equal(fileSecrets(SHARED_SCOPE).rdKey, "stored-rd");
  assert.equal(profileStore.loadEffective("default", true).rdKey, "stored-rd");
});

test("blob secrets move into the store once, and the stored value wins", async () => {
  localStorage.setItem(
    profileStore.SHARED_KEY,
    JSON.stringify({ rdKey: "blob-rd", tvdbKey: "blob-tvdb", posterRadius: 7 }),
  );
  const loaded = profileStore.loadEffective("default", true);
  assert.equal(loaded.rdKey, "stored-rd");
  assert.equal(loaded.tvdbKey, "blob-tvdb");
  profileStore.persistEffective(loaded, "default", true);
  await secretStore.flushSecrets();
  assert.deepEqual(fileSecrets(SHARED_SCOPE), { rdKey: "stored-rd", tvdbKey: "blob-tvdb" });
  for (const key of [profileStore.SHARED_KEY, profileStore.MIRROR_KEY]) {
    assert.equal("rdKey" in blobOf(key), false);
    assert.equal("tvdbKey" in blobOf(key), false);
    assert.equal(blobOf(key).posterRadius, 7);
  }
  const writes = secretWrites;
  profileStore.persistEffective(profileStore.loadEffective("default", true), "default", true);
  await secretStore.flushSecrets();
  assert.deepEqual(fileSecrets(SHARED_SCOPE), { rdKey: "stored-rd", tvdbKey: "blob-tvdb" });
  assert.equal(profileStore.loadEffective("default", true).tvdbKey, "blob-tvdb");
  assert.ok(secretWrites <= writes + 1);
});

test("a persisted empty value keeps the stored key, an explicit clear deletes it", async () => {
  profileStore.persistEffective(settingsWith({ tvdbKey: "" }), "default", true);
  assert.equal(profileStore.loadEffective("default", true).tvdbKey, "blob-tvdb");
  profileStore.writeSettingsSecrets("default", true, { tvdbKey: "" });
  await secretStore.flushSecrets();
  assert.equal(fileSecrets(SHARED_SCOPE).tvdbKey, undefined);
  assert.equal(profileStore.loadEffective("default", true).tvdbKey, "");
});

test("linked profiles share one secret scope, unlinked profiles keep their own", async () => {
  profileStore.persistEffective(settingsWith({ rdKey: "own-rd" }), "p_aa_aa", false);
  await secretStore.flushSecrets();
  assert.equal(fileSecrets("harbor.settings-secrets.v1.p_aa_aa").rdKey, "own-rd");
  assert.equal(fileSecrets(SHARED_SCOPE).rdKey, "stored-rd");
  assert.equal(profileStore.loadEffective("p_aa_aa", false).rdKey, "own-rd");
  assert.equal(profileStore.loadEffective("p_bb_bb", true).rdKey, "stored-rd");
  assert.equal("rdKey" in blobOf(profileStore.profileKey("p_aa_aa")), false);

  profileStore.forkToProfile("p_cc_cc");
  assert.equal(profileStore.loadEffective("p_cc_cc", false).rdKey, "stored-rd");
  profileStore.writeSettingsSecrets("p_cc_cc", false, { rdKey: "forked-rd" });
  assert.equal(profileStore.loadEffective("p_cc_cc", false).rdKey, "forked-rd");
  assert.equal(profileStore.loadEffective("default", true).rdKey, "stored-rd");
});

test("importing settings into a profile copies the source scope's secrets and strips the copied blob", async () => {
  const { importDomains } = await import("../src/lib/profile-import.ts");
  localStorage.setItem(
    profileStore.SHARED_KEY,
    JSON.stringify({ posterRadius: 9, dlKey: "blob-dl" }),
  );
  importDomains("default", "p_dd_dd", ["settings"]);
  await secretStore.flushSecrets();
  const imported = profileStore.loadEffective("p_dd_dd", false);
  assert.equal(imported.rdKey, "stored-rd");
  assert.equal(imported.dlKey, "blob-dl");
  assert.equal(imported.posterRadius, 9);
  assert.equal("dlKey" in blobOf(profileStore.profileKey("p_dd_dd")), false);
  assert.equal(fileSecrets("harbor.settings-secrets.v1.p_dd_dd").dlKey, "blob-dl");
});

// backup.ts is evaluated with its app-only imports stubbed and the real storage modules underneath.
function loadBackup(): typeof import("../src/lib/backup.ts") {
  const mocks: Record<string, unknown> = {
    "@/lib/download-text": {},
    "@/lib/profile-sync/backup-payload": { buildSyncBackup: () => ({}) },
    "@/lib/theme-storage": { loadBgImage: async () => null, saveBgImage: async () => {} },
    "@/lib/profiles": { readAllProfilesIdentity: () => [] },
    "@/lib/profile-roster": profileRosterFor(localStorage),
    "@/lib/active-profile-id": { activeProfileId: () => "default" },
    "@/lib/secret-store": secretStore,
    "@/lib/settings/profile-store": profileStore,
    "@/lib/storage-recovery": recovery,
    "@/lib/durable-store": { flushDurableStore: async () => {} },
    "@/lib/collection-images": {
      collectionImageRefs: () => [],
      readCollectionImages: async () => ({}),
      releaseCollectionImage() {},
      restoreCollectionImages: async () => {},
    },
    "@/lib/iptv/url-credentials": { URL_SECRET_PLACEHOLDER: "***", hasUrlSecrets: () => false },
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

test("a backup round-trip keeps the secrets out of the blob and restores them", async () => {
  const backup = loadBackup();
  localStorage.setItem("harbor.profiles.v1", JSON.stringify({ activeId: "default", profiles: [] }));
  const exported = await backup.buildBackup(["settings", "profiles"]);
  const blob = JSON.parse(exported.data[profileStore.SHARED_KEY] ?? "{}") as Record<
    string,
    unknown
  >;
  assert.equal("rdKey" in blob, false);

  for (const key of Object.keys(secretStore.getAllSecrets())) secretStore.setSecret(key, null);
  localStorage.clear();
  await backup.applyBackup(exported);
  assert.equal(profileStore.loadEffective("default", true).rdKey, "stored-rd");
  assert.equal(profileStore.loadEffective("p_aa_aa", false).rdKey, "own-rd");
  assert.equal(profileStore.loadEffective("p_cc_cc", false).rdKey, "forked-rd");
});

test("restoring an older backup moves the keys embedded in its blobs into the store", async () => {
  const backup = loadBackup();
  for (const key of Object.keys(secretStore.getAllSecrets())) secretStore.setSecret(key, null);
  localStorage.clear();
  await backup.applyBackup({
    format: "harbor-backup",
    version: 1,
    app: "old",
    exportedAt: "",
    sections: ["settings"],
    data: {
      [profileStore.SHARED_KEY]: JSON.stringify({ rdKey: "old-rd", posterRadius: 3 }),
      [profileStore.MIRROR_KEY]: JSON.stringify({ rdKey: "old-rd", posterRadius: 3 }),
    },
  });
  await secretStore.flushSecrets();
  assert.equal(fileSecrets(SHARED_SCOPE).rdKey, "old-rd");
  assert.equal("rdKey" in blobOf(profileStore.SHARED_KEY), false);
  assert.equal("rdKey" in blobOf(profileStore.MIRROR_KEY), false);
  assert.equal(profileStore.loadEffective("default", true).rdKey, "old-rd");
});

test("code outside SettingsProvider reads the TMDB key from the store once the mirror no longer carries it", async () => {
  const tmdb = await import("../src/lib/settings/tmdb-key.ts");
  const { letterboxdSource } = await import("../src/lib/ratings/import/sources/letterboxd.ts");
  localStorage.setItem("harbor.profiles.v1", JSON.stringify({ activeId: "default", profiles: [] }));
  localStorage.setItem(
    profileStore.SHARED_KEY,
    JSON.stringify({ tmdbKey: "blob-tmdb", posterRadius: 4 }),
  );
  profileStore.persistEffective(profileStore.loadEffective("default", true), "default", true);
  await secretStore.flushSecrets();
  assert.equal("tmdbKey" in blobOf(profileStore.MIRROR_KEY), false);
  assert.equal(fileSecrets(SHARED_SCOPE).tmdbKey, "blob-tmdb");
  assert.equal(tmdb.getTmdbKey(), "blob-tmdb");
  assert.equal(await letterboxdSource.available(), true);
  tmdb.setTmdbKey("live-tmdb");
  assert.equal(tmdb.getTmdbKey(), "live-tmdb");
});

const HOOKS = {
  ...DEFAULT.webhooks,
  discordUrl: "https://discord.com/api/webhooks/1/discord-token",
  telegramUrl: "https://api.telegram.org/botTG-TOKEN/sendMessage?chat_id=42",
  desktopEnabled: true,
};

function leaksWebhookTokens(text: string | null): boolean {
  return (text ?? "").includes("discord-token") || (text ?? "").includes("TG-TOKEN");
}

test("the serialized blob carries no webhook URLs but keeps the other webhook settings", () => {
  const json = profileStore.serializeSettings(settingsWith({ webhooks: HOOKS }));
  const hooks = (JSON.parse(json) as { webhooks: Record<string, unknown> }).webhooks;
  assert.equal("discordUrl" in hooks, false);
  assert.equal("telegramUrl" in hooks, false);
  assert.equal(hooks.desktopEnabled, true);
  assert.deepEqual(hooks.sources, DEFAULT.webhooks.sources);
});

test("webhook URLs persist to the profile's secret scope and load back into settings", async () => {
  profileStore.persistEffective(settingsWith({ webhooks: HOOKS }), "p_wh_wh", false);
  await secretStore.flushSecrets();
  assert.equal(leaksWebhookTokens(localStorage.getItem(profileStore.profileKey("p_wh_wh"))), false);
  const scope = fileSecrets("harbor.settings-secrets.v1.p_wh_wh");
  assert.equal(scope["webhooks.discordUrl"], HOOKS.discordUrl);
  assert.equal(scope["webhooks.telegramUrl"], HOOKS.telegramUrl);
  const loaded = profileStore.loadEffective("p_wh_wh", false);
  assert.equal(loaded.webhooks.discordUrl, HOOKS.discordUrl);
  assert.equal(loaded.webhooks.telegramUrl, HOOKS.telegramUrl);
  assert.equal(loaded.webhooks.desktopEnabled, true);
});

test("webhook URLs left in a legacy blob move into the store and leave the blob", async () => {
  localStorage.setItem(
    profileStore.profileKey("p_wl_wl"),
    JSON.stringify({
      posterRadius: 5,
      webhooks: { discordUrl: HOOKS.discordUrl, notifyTv: false },
    }),
  );
  const loaded = profileStore.loadEffective("p_wl_wl", false);
  assert.equal(loaded.webhooks.discordUrl, HOOKS.discordUrl);
  profileStore.persistEffective(loaded, "p_wl_wl", false);
  await secretStore.flushSecrets();
  const blob = blobOf(profileStore.profileKey("p_wl_wl")) as { webhooks: Record<string, unknown> };
  assert.equal("discordUrl" in blob.webhooks, false);
  assert.equal(blob.webhooks.notifyTv, false);
  assert.equal(
    fileSecrets("harbor.settings-secrets.v1.p_wl_wl")["webhooks.discordUrl"],
    HOOKS.discordUrl,
  );
  assert.equal(profileStore.loadEffective("p_wl_wl", false).webhooks.discordUrl, HOOKS.discordUrl);
});

test("clearing a webhook URL in settings deletes it from the secret scope", async () => {
  const before = profileStore.loadEffective("p_wh_wh", false);
  const after = settingsWith({ webhooks: { ...before.webhooks, discordUrl: "" } });
  const changes = fields.changedSecrets(before, after);
  assert.deepEqual(changes, { "webhooks.discordUrl": "" });
  profileStore.writeSettingsSecrets("p_wh_wh", false, changes);
  await secretStore.flushSecrets();
  const scope = fileSecrets("harbor.settings-secrets.v1.p_wh_wh");
  assert.equal("webhooks.discordUrl" in scope, false);
  assert.equal(scope["webhooks.telegramUrl"], HOOKS.telegramUrl);
});

test("while secrets.json writes fail the blob keeps webhook URLs, and drops them once a write succeeds", async () => {
  failSecretWrites = true;
  secretStore.setSecret("harbor.settings-secrets.v1.p_wf_wf", JSON.stringify({ rdKey: "x" }));
  await secretStore.flushSecrets();
  assert.equal(secretStore.getSecretsWriteStatus().ok, false);
  profileStore.persistEffective(settingsWith({ webhooks: HOOKS }), "p_wf_wf", false);
  assert.equal(leaksWebhookTokens(localStorage.getItem(profileStore.profileKey("p_wf_wf"))), true);
  failSecretWrites = false;
  await secretStore.flushSecrets();
  assert.equal(secretStore.getSecretsWriteStatus().ok, true);
  profileStore.persistEffective(settingsWith({ webhooks: HOOKS }), "p_wf_wf", false);
  assert.equal(leaksWebhookTokens(localStorage.getItem(profileStore.profileKey("p_wf_wf"))), false);
  await secretStore.flushSecrets();
  assert.equal(
    fileSecrets("harbor.settings-secrets.v1.p_wf_wf")["webhooks.discordUrl"],
    HOOKS.discordUrl,
  );
});

test("forking a linked profile gives it its own copy of the webhook URLs", async () => {
  profileStore.writeSettingsSecrets("default", true, { "webhooks.telegramUrl": HOOKS.telegramUrl });
  localStorage.removeItem(profileStore.SHARED_KEY);
  localStorage.removeItem(profileStore.MIRROR_KEY);
  profileStore.forkToProfile("p_fk_fk");
  await secretStore.flushSecrets();
  const forked = profileStore.loadEffective("p_fk_fk", false);
  assert.equal(forked.webhooks.telegramUrl, HOOKS.telegramUrl);
  assert.equal(
    fileSecrets("harbor.settings-secrets.v1.p_fk_fk").rdKey,
    fileSecrets(SHARED_SCOPE).rdKey,
  );
});

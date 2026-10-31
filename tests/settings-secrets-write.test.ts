// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";

const SCOPE = "harbor.settings-secrets.v1.shared";

// A Rust secrets.json whose secrets_write rejects while failuresLeft > 0.
let secretsFile: string | null = null;
let failuresLeft = 0;
let writeAttempts = 0;
let heldWrite: Promise<void> | null = null;
const events = new EventTarget();
(globalThis as { window?: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { content?: string }) => {
      if (cmd === "secrets_read") return secretsFile;
      if (cmd === "secrets_write") {
        writeAttempts++;
        if (heldWrite) await heldWrite;
        if (failuresLeft > 0) {
          failuresLeft--;
          throw new Error("disk full");
        }
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

const secretStore = await import("../src/lib/secret-store.ts");
const profileStore = await import("../src/lib/settings/profile-store.ts");
const { DEFAULT } = await import("../src/lib/settings/defaults.ts");

function fileSecrets(): Record<string, string> {
  const all = JSON.parse(secretsFile ?? "{}") as Record<string, string>;
  return all[SCOPE] ? (JSON.parse(all[SCOPE]) as Record<string, string>) : {};
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

test("a rejected secrets_write is logged, reported and retried until the key reaches the file", async (t) => {
  await secretStore.loadSecrets();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void logged.push(args));
  let notified = 0;
  const unsubscribe = secretStore.subscribeSecretsWriteStatus(() => notified++);

  failuresLeft = 2;
  secretStore.setSecret(SCOPE, JSON.stringify({ tmdbKey: "kept" }));
  await secretStore.flushSecrets();
  assert.equal(writeAttempts, 1);
  assert.equal(secretStore.getSecretsWriteStatus().ok, false);
  assert.ok(notified >= 1);
  assert.ok(logged.some((args) => String(args[0]).includes("[secrets] secrets_write failed")));
  assert.deepEqual(fileSecrets(), {});

  t.mock.timers.tick(1000);
  await settle();
  assert.equal(writeAttempts, 2);
  assert.equal(secretStore.getSecretsWriteStatus().ok, false);

  t.mock.timers.tick(5000);
  await settle();
  assert.equal(writeAttempts, 3);
  assert.equal(secretStore.getSecretsWriteStatus().ok, true);
  assert.deepEqual(fileSecrets(), { tmdbKey: "kept" });
  assert.equal(secretStore.getSecret(SCOPE), JSON.stringify({ tmdbKey: "kept" }));

  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(writeAttempts, 3);
  unsubscribe();
});

test("while secrets.json writes fail the blob keeps its keys, and the next successful write lets it drop them", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "error", () => {});
  const settings = { ...DEFAULT, tmdbKey: "tmdb-live", rdKey: "rd-live" };
  secretStore.setSecret(SCOPE, null);

  failuresLeft = 1;
  profileStore.persistEffective(settings, "default", true);
  await secretStore.flushSecrets();
  assert.equal(secretStore.getSecretsWriteStatus().ok, false);
  profileStore.persistEffective(settings, "default", true);
  const failing = JSON.parse(localStorage.getItem(profileStore.MIRROR_KEY) ?? "{}");
  assert.equal(failing.tmdbKey, "tmdb-live");
  assert.equal(failing.rdKey, "rd-live");

  t.mock.timers.tick(1000);
  await settle();
  assert.equal(secretStore.getSecretsWriteStatus().ok, true);
  assert.equal(fileSecrets().tmdbKey, "tmdb-live");
  profileStore.persistEffective(settings, "default", true);
  const healthy = JSON.parse(localStorage.getItem(profileStore.MIRROR_KEY) ?? "{}");
  assert.equal("tmdbKey" in healthy, false);
  assert.equal("rdKey" in healthy, false);
  assert.equal(profileStore.loadEffective("default", true).tmdbKey, "tmdb-live");
});

test("a new key stays in the blob until secrets_write lands, then the blob drops it", async () => {
  let release = () => {};
  heldWrite = new Promise<void>((r) => (release = r));
  const settings = { ...DEFAULT, tmdbKey: "tmdb-live", rdKey: "rd-live", omdbKey: "omdb-new" };

  const json = profileStore.persistEffective(settings, "default", true);
  assert.equal(secretStore.secretsDurable(), false);
  assert.equal(
    JSON.parse(localStorage.getItem(profileStore.MIRROR_KEY) ?? "{}").omdbKey,
    "omdb-new",
  );
  assert.equal("omdbKey" in JSON.parse(json), false, "settings.json never takes the key");
  const flushing = secretStore.flushSecrets();
  await settle();
  profileStore.persistEffective(settings, "default", true);
  assert.equal(
    JSON.parse(localStorage.getItem(profileStore.MIRROR_KEY) ?? "{}").omdbKey,
    "omdb-new",
  );
  assert.equal(fileSecrets().omdbKey, undefined);

  heldWrite = null;
  release();
  await flushing;
  assert.equal(secretStore.secretsDurable(), true);
  assert.equal(fileSecrets().omdbKey, "omdb-new");
  for (const key of [profileStore.MIRROR_KEY, profileStore.SHARED_KEY]) {
    assert.equal("omdbKey" in JSON.parse(localStorage.getItem(key) ?? "{}"), false, key);
  }
  profileStore.persistEffective(settings, "default", true);
  assert.equal(
    "omdbKey" in JSON.parse(localStorage.getItem(profileStore.MIRROR_KEY) ?? "{}"),
    false,
  );
  assert.equal(profileStore.loadEffective("default", true).omdbKey, "omdb-new");
});

test("a legacy blob keeps its keys while the migrating write is pending", async () => {
  let release = () => {};
  heldWrite = new Promise<void>((r) => (release = r));
  localStorage.setItem(profileStore.SHARED_KEY, JSON.stringify({ fanartKey: "blob-fanart" }));
  profileStore.migrateBlobSecrets(profileStore.SHARED_KEY);
  assert.equal(
    JSON.parse(localStorage.getItem(profileStore.SHARED_KEY) ?? "{}").fanartKey,
    "blob-fanart",
  );
  const flushing = secretStore.flushSecrets();
  heldWrite = null;
  release();
  await flushing;
  assert.equal(fileSecrets().fanartKey, "blob-fanart");
  assert.equal(
    "fanartKey" in JSON.parse(localStorage.getItem(profileStore.SHARED_KEY) ?? "{}"),
    false,
  );
});

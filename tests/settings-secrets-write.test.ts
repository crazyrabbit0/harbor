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
const events = new EventTarget();
(globalThis as { window?: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { content?: string }) => {
      if (cmd === "secrets_read") return secretsFile;
      if (cmd === "secrets_write") {
        writeAttempts++;
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

import test, { mock } from "node:test";
import assert from "node:assert/strict";

let failWith: unknown = null;
const calls: { cmd: string; args: unknown }[] = [];

// file-store reads the Tauri flag at import time, so the global is set before the dynamic imports.
(globalThis as any).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: unknown) => {
      calls.push({ cmd, args });
      if (failWith !== null) throw failWith;
      return null;
    },
  },
};

const { writeSettingsFile, readSettingsFile } = await import("../src/lib/settings/file-store.ts");
const { getSettingsWriteStatus, subscribeSettingsWriteStatus } =
  await import("../src/lib/settings/write-status.ts");

test("a rejected settings_write is logged, recorded as failed and still resolves", async () => {
  const errors = mock.method(console, "error", () => {});
  const seen: unknown[] = [];
  const unsubscribe = subscribeSettingsWriteStatus(() => seen.push(getSettingsWriteStatus()));
  failWith = new Error("disk full");
  const before = Date.now();

  await writeSettingsFile('{"a":1}');

  unsubscribe();
  errors.mock.restore();
  assert.equal(calls.at(-1)?.cmd, "settings_write");
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0]?.arguments[0]), /^\[settings\]/);
  const status = getSettingsWriteStatus();
  assert.equal(status.ok, false);
  assert.ok(!status.ok && status.error.includes("disk full"));
  assert.ok(!status.ok && status.at >= before);
  assert.equal(seen.length, 1);
});

test("a non-Error rejection is recorded as a string", async () => {
  const errors = mock.method(console, "error", () => {});
  failWith = "plain string rejection";

  await writeSettingsFile("{}");

  errors.mock.restore();
  const status = getSettingsWriteStatus();
  assert.ok(!status.ok && status.error === "plain string rejection");
});

test("a later successful write flips the status back to ok and notifies listeners", async () => {
  const seen: unknown[] = [];
  const unsubscribe = subscribeSettingsWriteStatus(() => seen.push(getSettingsWriteStatus()));
  failWith = null;

  await writeSettingsFile('{"b":2}');

  unsubscribe();
  const status = getSettingsWriteStatus();
  assert.equal(status.ok, true);
  assert.ok(status.at > 0);
  assert.equal(seen.length, 1);
  assert.deepEqual(calls.at(-1)?.args, { content: '{"b":2}' });
});

test("an unsubscribed listener is not notified", async () => {
  let notified = 0;
  const unsubscribe = subscribeSettingsWriteStatus(() => notified++);
  unsubscribe();
  failWith = null;

  await writeSettingsFile("{}");

  assert.equal(notified, 0);
});

test("a rejected settings_read is logged, returns null and leaves the write status alone", async () => {
  const errors = mock.method(console, "error", () => {});
  failWith = null;
  await writeSettingsFile("{}");
  const statusBefore = getSettingsWriteStatus();
  failWith = new Error("read denied");

  const raw = await readSettingsFile();

  errors.mock.restore();
  failWith = null;
  assert.equal(raw, null);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0]?.arguments[0]), /^\[settings\]/);
  assert.equal(getSettingsWriteStatus(), statusBefore);
});

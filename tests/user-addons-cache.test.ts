import assert from "node:assert/strict";
import test from "node:test";

const host = { location: { hostname: "harbor.local" } };
(globalThis as unknown as { window: typeof host }).window = host;

const getCalls: string[] = [];
let setCalls = 0;
let addonNames = ["first"];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("addonCollectionSet")) {
    setCalls += 1;
    return new Response(JSON.stringify({ result: { success: true } }), { status: 200 });
  }
  const body = JSON.parse(String(init?.body ?? "{}")) as { authKey?: string };
  getCalls.push(body.authKey ?? "");
  const addons = addonNames.map((name) => ({
    transportUrl: `https://${name}.example/manifest.json`,
    manifest: { id: name, name },
  }));
  return new Response(JSON.stringify({ result: { addons } }), { status: 200 });
}) as typeof fetch;

const { invalidateUserAddons, setUserAddons, userAddons } = await import("../src/lib/addons.ts");

test("concurrent userAddons calls for one authKey share a single request", async () => {
  getCalls.length = 0;
  invalidateUserAddons();
  const [a, b] = await Promise.all([userAddons("key-a"), userAddons("key-a")]);
  const c = await userAddons("key-a");
  assert.equal(getCalls.length, 1);
  assert.deepEqual(a, b);
  assert.notEqual(a, c);
  await userAddons("key-b");
  assert.deepEqual(getCalls, ["key-a", "key-b"]);
});

test("writing the collection or invalidating refetches the user's addons", async () => {
  getCalls.length = 0;
  invalidateUserAddons();
  await userAddons("key-a");
  addonNames = ["second"];
  assert.equal(await setUserAddons("key-a", []), true);
  assert.equal(setCalls, 1);
  const afterWrite = await userAddons("key-a");
  assert.equal(afterWrite[0]?.manifest.id, "second");
  addonNames = ["third"];
  invalidateUserAddons();
  const afterInvalidate = await userAddons("key-a");
  assert.equal(afterInvalidate[0]?.manifest.id, "third");
  assert.equal(getCalls.length, 3);
});

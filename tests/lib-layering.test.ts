import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test("lib/ never imports from views/", () => {
  const offenders = sources("src/lib").filter((file) =>
    /from\s+["'](?:@\/views\/|(?:\.\.\/)+views\/)/.test(readFileSync(file, "utf8")),
  );
  assert.deepEqual(offenders, []);
});

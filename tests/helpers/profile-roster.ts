import { readFileSync } from "node:fs";
import ts from "typescript";

type Storage = { getItem(key: string): string | null };

// Compiles lib/profile-roster.ts against a test's own storage, for harnesses that mock `require` and `localStorage`.
export function profileRosterFor(
  storage: Storage,
): typeof import("../../src/lib/profile-roster.ts") {
  const source = readFileSync(new URL("../../src/lib/profile-roster.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "localStorage", output)(exports, storage);
  return exports as typeof import("../../src/lib/profile-roster.ts");
}

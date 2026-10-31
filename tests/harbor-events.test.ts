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

const declared = new Set(
  [...readFileSync("src/lib/harbor-events.ts", "utf8").matchAll(/^\s+"(harbor:[\w:.-]+)":/gm)].map(
    (m) => m[1],
  ),
);

// Event names used as values: dispatched, listened to, or held in a constant passed to either.
function usedEvents(): Map<string, string> {
  const used = new Map<string, string>();
  for (const file of sources("src")) {
    if (file.replace(/\\/g, "/").includes("theme-studio/cheat-sheet")) continue;
    const text = readFileSync(file, "utf8");
    const patterns = [
      /new (?:Custom)?Event(?:<[^>]*>)?\(\s*["'`](harbor:[\w:.-]+)["'`]/g,
      /(?:add|remove)EventListener\(\s*["'`](harbor:[\w:.-]+)["'`]/g,
      /emitHarborEvent\(\s*["'`](harbor:[\w:.-]+)["'`]/g,
      /const [A-Za-z_]\w* = ["'`](harbor:[\w-]+(?::[\w-]+)?)["'`];\s*$/gm,
    ];
    for (const re of patterns) for (const m of text.matchAll(re)) used.set(m[1], file);
  }
  return used;
}

test("every harbor:* window event is declared in HarborEventMap", () => {
  const missing = [...usedEvents()].filter(([name]) => !declared.has(name));
  const allowed = new Set([
    "harbor:error:pipeline-load-streams-failed",
    "harbor:title-backdrops",
    "harbor:title-logos",
    "harbor:title-posters",
  ]);
  assert.deepEqual(
    missing.filter(([name]) => !allowed.has(name)),
    [],
  );
});

test("HarborEventMap declares no event that nothing uses", () => {
  const used = usedEvents();
  assert.deepEqual(
    [...declared].filter((name) => !used.has(name)),
    [],
  );
});

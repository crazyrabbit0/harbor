import { readFileSync } from "node:fs";
import { LIST_SEEDS } from "../../src/lib/curated/catalog";
import { hookHarness, loadModule } from "./hook-harness";

export const readJson = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));

/** The real curated registry, canon and useCanon over the bundled JSON; `loadListItems` is scripted. */
export function curatedListsHarness(loadListItems: (id: string) => Promise<readonly unknown[]>) {
  const spine = loadModule("src/lib/curated/spine.ts", {
    "@/data/criterion-spine.json": { default: readJson("src/data/criterion-spine.json") },
  });
  const registry = loadModule("src/lib/curated/registry.ts", {
    "@/data/curated/index.json": { default: readJson("src/data/curated/index.json") },
    "./catalog": { LIST_SEEDS },
    "./spine": spine,
  });
  const canon = loadModule("src/lib/curated/canon.ts", {
    "./registry": registry,
    "./spine": spine,
  });
  const hook = hookHarness("src/lib/curated/use-canon.ts", "probe", {
    "./canon": canon,
    "./items": { loadListItems },
  });
  // render() passes one argument, so a probe spreads it into useCanon's two.
  hook.exports.probe = ({ imdbId, kind }: { imdbId: string | null; kind: "movie" | "series" }) =>
    hook.exports.useCanon(imdbId, kind);
  return { spine, registry, canon, useCanon: hook };
}

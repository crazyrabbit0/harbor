// tauri.conf.json bundles resources/pokemon-engine/; Tauri skips an empty directory but fails on a missing one.
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dest = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src-tauri/resources/pokemon-engine",
);
if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
if (!readdirSync(dest).length) {
  console.warn(
    "[pokemon-engine] not built, so this build has no Pokémon save editing.\n" +
      "[pokemon-engine] To include it (needs the .NET 10 SDK): node tools/pokemon-engine/build.mjs " +
      "--fetch-source <empty dir> --output src-tauri/resources/pokemon-engine",
  );
}

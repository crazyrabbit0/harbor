# Harbor Pokémon engine

A separate, offline process that edits Pokémon save data for Harbor. It is licensed GPL-3.0-or-later (see `LICENSE`) and is built from the pinned upstream revisions in `upstream.json`: PKForge, PKForge-PKHeX and PKHeX-Plugins.

The host owns paths, backups and the final commit; the engine only reads a JSON request on stdin and writes a JSON response on stdout (`Program.cs`).

## Build

Requires the .NET SDK and git.

```
node tools/pokemon-engine/build.mjs --fetch-source <checkout dir> --output src-tauri/resources/pokemon-engine
```

`--fetch-source` clones the pinned revisions into an empty directory; `--source` uses an existing checkout, which must match `upstream.json` and be unmodified. Optional flags: `--rid win-x64|linux-x64|linux-arm64|osx-x64|osx-arm64`, `--dotnet <SDK executable>`, `--artifacts <dir>`.

The output contains the self-contained engine, `engine.json` (protocol, runtime, revision and SHA-256) and `sources/`, the corresponding source for the shipped binary: upstream archives plus the files in this folder.

# scripts/

Node `.mjs` tooling plus a few Python/PowerShell helpers. Release flow, setup sets and the `vp`/formatter commands are in the root `AGENTS.md`.

## Categories

| Kind                   | Files                                                                                                                                                                                                                                      | Run by                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Setup (fetch sidecars) | `fetch-binaries`, `fetch-libmpv`, `fetch-mpv`, `fetch-ffmpeg`, `fetch-fonts`                                                                                                                                                               | `setup:*` scripts                                                                       |
| Stage                  | `capstan-stage` (+ `capstan-jdk`, `capstan-verify`), `pokemon-engine-stage`                                                                                                                                                                | `dev`, `build:desktop`, `setup:capstan`, `check:capstan`                                |
| Validators             | `check-settings`, `check-settings-search` (share `settings-search-entries`, `settings-anchors`), `check-tv-*`, `orphan-strings`, `check-i18n`                                                                                              | `check:*`; `check-i18n` by hand                                                         |
| Release (CI)           | `bump-version`, `release-notes`, `release-assets`, `updater-manifest`, `macos-*.py` (+ `macos_macho.py`)                                                                                                                                   | `.github/workflows/tauri-build.yml`                                                     |
| Redirect regression    | `http-redirect-tests/` (standalone Cargo crate)                                                                                                                                                                                            | `tauri-build.yml` (`cargo test --manifest-path scripts/http-redirect-tests/Cargo.toml`) |
| Test loader            | `node-test-loader.mjs`                                                                                                                                                                                                                     | `pnpm test` and every single-file run                                                   |
| Data generators        | `snapshot-*`, `film-registry-*`, `wikidata-lists`, `scrape-awards`, `brand-index`, `black-and-white-index`, `build-eve-universe`, `build-stream-blocker`, `refresh-game-logo-index`, `thumbbar-icons`, `playnite-audit.py`, `i18n-crowdin` | by hand; review the diff of what they write                                             |
| Live diagnostics       | `harbor-diag.mjs` (CDP on 9333; `harbor-diag-mcp.mjs` wraps it as an MCP server), `dev-diag.ps1`, `perf-discover`, `benchmark-*`                                                                                                           | by hand against a running app                                                           |
| Seasonal               | `stage-spooktober.mjs`, `spooktober-native/`                                                                                                                                                                                               | by hand                                                                                 |

## Dead upstream tooling

- `publish-release.mjs` posts to Harbor's old ops API, and `release-beta.ps1` (+ `verify-managed-payload.mjs`) built and published the managed beta channel. Neither has a caller and the fork's releases come only from `tauri-build.yml`; don't revive them as a release path.

## Rules from the scripts themselves

- `capstan-stage.mjs`: `--check` never builds or stages; `--dev` always exits 0 so the dev server starts; a build stops unless the staged runtime answers `ping` (`capstan-verify.mjs`). The jlink module list keeps `jdk.zipfs`, `jdk.crypto.ec`, `jdk.localedata` and `jdk.charsets`, which jdeps can't see; removing one breaks extensions at runtime only.
- `capstan-jdk.mjs`: GNU tar reads `C:` as a remote host, so archives are unpacked from inside their target dir; the source JDK's `release` file decides the jlink platform. A cross-staged image is checked for shape, never started.
- `macos-bundle-libmpv.py` never falls back to another target directory.
- `build-stream-blocker.mjs` compiles literal domains only and must not execute the app's privacy module; `build-eve-universe.mjs` output is reviewed before updating `EVE_UNIVERSE`; `playnite-audit.py` never infers coverage from a title or overwrites reviewed evidence.
- TV validators and their `tv-*.json` baselines read the gitignored `android-native/`; rebaseline only with that checkout present (`tv-strings-rebaseline.mjs`).

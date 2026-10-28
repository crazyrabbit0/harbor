# src-tauri/src/games/ (game library and launcher backend)

Rust side of the Games room: Steam scan and non-Steam shortcuts, launchers and Battle.net, external emulators, embedded retro cores, Minecraft, Sims, Stardew, WoW addons, Pokémon saves, archives/setup installers, downloads, torrents, cloud/debrid sources, achievements. Frontend logic is in `src/lib/games/` (see its AGENTS.md), UI in `src/views/games/`.

## Where to look

| Task                                  | Location                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command list                          | `mod.rs` (~140 modules, ~210 inline `#[tauri::command]`s), registered as `games::*` in `../lib.rs` `generate_handler!`                                                                                  |
| External emulators                    | `emulation.rs` (detect/launch mgba, dolphin, ppsspp, retroarch)                                                                                                                                         |
| Embedded retro cores                  | `embedded.rs` (token-scoped local axum server, core download), `retro_save_path.rs` (core names, `VERSION`), `retro-runtime.json` (SHA-256 + size manifest), `retro-player.html`/`.js` (`include_str!`) |
| Pokémon engine                        | `pokemon_bank.rs` resolves `resources/pokemon-engine` (.NET JSON-over-stdio process from `tools/pokemon-engine/`)                                                                                       |
| Archive / achievement / Hydra workers | `archives.rs`, `steam_achievements.rs`, `hydra_import*.rs`                                                                                                                                              |

## Conventions

- The games commands are desktop-only: none are in `../mobile.rs`.
- Commands return `Result<T, String>` with static snake_case error codes (`"retro_unsupported"`, `"retro_manifest"`); the frontend matches on those strings, so don't rephrase them.
- Long work runs in `spawn_blocking`. Progress goes out as `games:*` events (`games:archive-progress`, `games:archive-job`, `games:download-queue`, `games:minecraft-progress`, ...); grep the event name in `src/` before renaming one.
- Destructive operations use review → apply: a `review`/plan call returns a token, then `apply(token)` / `discard` / `cancel` (`minecraft_pack_update.rs`, `minecraft_instance_storage.rs`, `sims_reviews.rs`, `archives.rs`). Follow it for anything that deletes or overwrites user files.
- `try_run_achievement_worker`, `try_run_archive_worker` and `try_run_hydra_import_worker` make the same exe act as a child worker; `../lib.rs` checks them before building Tauri. A new worker mode needs a check there too.
- Embedded cores come from `cdn.emulatorjs.org/<VERSION>/` and are verified against `retro-runtime.json`; bumping `VERSION` means regenerating the manifest.
- Windows-only code: `steam_achievements.rs`, `achievement_protocol.rs`, `launcher_scan.rs`, `custom_launch_windows.rs`, much of `battlenet_account_browser.rs`. Many `*_tests.rs` cases are `#[cfg(windows)]`.

## Anti-patterns

- Archive credentials live only for the reviewed operation: never put them in a plan, event or job receipt (`archives.rs`).
- `lpParameters` is an argv string, never a shell expression (`custom_launch_windows.rs`).
- The RAR worker never uses the archive's EXTRACT command (`archive_decoder_rar.rs`); `cloud_files.rs` never creates, selects or deletes remote torrents.
- An external save replacement must not be undone by stale emulator RAM (`embedded.rs`).

## Tests

98 sibling `*_tests.rs` files plus inline `#[cfg(test)]` (e.g. `emulation.rs`, `embedded.rs`, `pokemon_*.rs`). Fixtures: `src-tauri/tests/fixtures/disc/*.iso.gz`; Sims packages are not in the repo (`HARBOR_SIMS_LOT51_FIXTURES`, below).

- Archives, shared transfer storage, Sims and save jobs admit one operation per process, and the Stardew guard rejects any running process named like SMAPI. A test that drives one of them starts with `let _engines = crate::games::test_lock::hold();` (`test_lock.rs`, survives a panicking holder), or parallel `cargo test` fails it with `*_busy` or `stardew_running`.
- A test that re-runs the test binary as a crash worker names the child with `module_path!()` (`fn worker(name)` in those files). A literal path missing the `games::` root matches no test, so the child exits 0 at once.
- The Sims and Stardew stores, their save guards and `launcher_processes::sample` are Windows-only (`*_platform` elsewhere); their tests carry `#[cfg_attr(not(windows), ignore = ...)]`. Tests that need real third-party downloads are `#[ignore = "needs <VAR>"]`: `HARBOR_SIMS_LOT51_FIXTURES`, `HARBOR_TEST_STARDEW_ZIP`, `HARBOR_TEST_SMAPI_DLL`. Run them with `-- --ignored` once the variables point at the files.

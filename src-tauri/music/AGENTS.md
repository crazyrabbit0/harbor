# src-tauri/music/ (music backend, crate `harbor-music`)

The crate root is `src/lib.rs`: `MusicState`, `initialize`, `shutdown`, `pause_for_video`, `try_run_connector_worker`, `invoke_handler`. Paths below are under `src/`. Frontend notes are in `src/lib/music/AGENTS.md`.

## Where to look

| Task                                         | Location                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stream playback (mpv via `libmpv2`)          | `engine.rs` (tests in `engine_tests.rs`)                                                                                                                                        |
| Spotify (librespot playback, Web API browse) | `spotify/`                                                                                                                                                                      |
| Sources                                      | `connectors/` (`youtube_music/`, `soundcloud/`, `jellyfin/`, `plex/`, `subsonic/`, `local/`; `catalog/` is metadata only: Deezer, iTunes, MusicBrainz, ListenBrainz)            |
| Connector subprocess                         | `worker.rs`, `worker_policy.rs`, `connector.rs`, `registry.rs`                                                                                                                  |
| DJ decks, FX, broadcast                      | `deck.rs`, `deck_audio.rs`, `deck_events.rs`, `audio_fx.rs`, `broadcast.rs`; the `harbor-dj` window is the app's `../src/dj_deck.rs`                                            |
| Virtual audio cable                          | `cable_win/`, `cable_mac/` (installs the CoreAudio driver from `harbor-audio-plugin/`), `commands/cable_pipewire.rs`/`commands/cable_linux.rs`, commands in `commands/cable.rs` |
| Local library DB                             | `db/`, `migrations.rs`, `store.rs`, `library.rs`                                                                                                                                |
| Scrobbling                                   | `lastfm.rs`                                                                                                                                                                     |

## Conventions

- `harbor-music` is a workspace member behind the app's default `music` feature and depends on `harbor-shared`, never on the app crate. Every command is `pub`, lives in a submodule (a `#[tauri::command]` in `lib.rs` collides with its macro re-export, E0255), is named `music_*` so the app's `route_commands` sends it here, and is listed in `invoke_handler()`. Music is desktop-only (nothing in `../src/mobile.rs`).
- App functions (secrets, `locate_ffmpeg`, `run_yt_dlp`, `allow_asset_directory`) come through `src/hooks.rs`, which reads the `harbor_shared::app_hooks::AppHooks` the app manages in `setup` before `initialize`; a read before that returns an error (or `None`/`false`) instead of panicking.
- Tests: `cargo test --manifest-path src-tauri/Cargo.toml -p harbor-music`, with `libmpv-2.dll` on `PATH` on Windows; `build.rs` gives the test binaries the delay-loaded comctl32 and stack size the app sets, and `harbor-shared`'s build script (feature `mpv`) adds the libmpv link path: `src-tauri/libmpv` for `mpv.lib` on Windows, and on macOS the same Homebrew/MacPorts dirs `src-tauri/build.rs` searches (`HOMEBREW_PREFIX`, `/opt/homebrew`, `/usr/local`, `/opt/local`, each with `lib`, `opt/mpv/lib`, `opt/libmpv/lib`), so `brew install mpv` is enough there. Linux needs nothing for distro packages (`libmpv-dev`, `mpv-libs-devel`, `mpv`), whose `libmpv.so` sits in the linker's default dirs; a libmpv found only through `PKG_CONFIG_PATH` (Nix, Linuxbrew, `/opt`) links the app but not these test binaries. CI runs these tests on Linux only, so the macOS path is checked by hand.
- `model.rs` exports the catalog refs, row layouts and connections, plus `MusicTrack` (as `MusicTrackCore`; the TS `MusicTrack` adds frontend-only fields), the source candidate and connector health types, `MusicVideoStream`, `MusicMigration` and `MusicBootstrap` from `lib.rs`/`connector.rs`, to `src/lib/generated/music-ipc.ts`; regenerate with `HARBOR_WRITE_BINDINGS=1 cargo test --manifest-path src-tauri/Cargo.toml -p harbor-music export_bindings` (plain `cargo test` runs only the `harbor` package).
- Rust emits `music://event` and `music://lastfm`; `src/lib/music/player.ts` listens. Change both sides together.
- Only one engine is active at a time (`ACTIVE_NONE/STREAM/SPOTIFY` in `lib.rs`); `pause_for_video` is how video playback (the app's `../src/mpv.rs`) silences music.
- `try_run_connector_worker` turns the exe into a connector worker; the app's `../src/lib.rs` checks it before building Tauri.
- Deck event loops run on plain `std::thread`s; mpv handles are dropped on `spawn_blocking`, and Tokio runtimes are dropped on a plain thread, never inside async code (`spotify/mod.rs`, `spotify/control.rs`).
- MusicBrainz, ListenBrainz and the yt-dlp updater have rate-limit gates; reuse them instead of calling those services directly.

## Anti-patterns

- Don't resolve YouTube Music streams from raw innertube URLs: YouTube serves ~1 MB and then 403s ffmpeg's `Range: bytes=0-`. Keep yt-dlp (`connectors/youtube_music/ytdlp.rs`).
- librespot's access token expires within the hour and nothing renews it; every playback path goes through `ensure_session` (`spotify/mod.rs`). Browsing working does not mean playback will.
- Process-wide statics (`audio_fx.rs` `ACTIVE`, `cable_win/select.rs` `HELD`, `commands/cable_pipewire.rs` `CHILD`) are shared by every window and deck; check who else holds them before changing their lifecycle.

# src-tauri/ (Rust shell)

Notes for agents working in this folder.

## Commands and windows

- Desktop commands are registered in `src/lib.rs` (`generate_handler!` around L1003, ~530 entries). Android has its own builder and list in `src/mobile.rs` (L80, ~65 entries: torrent engine, proxy, web server, settings, fetch bridge); it inherits nothing, so add a command there only if Android needs it. Games, music, mpv, casting and ffmpeg features are desktop-only. Gate platform-only entries with `#[cfg(...)]` inside the list.
- `run()` in `src/lib.rs` first checks `music::try_run_connector_worker` and the `games::try_run_*_worker`s (L725-728): the same exe doubles as a worker subprocess, so a new worker mode needs a check there, before the Tauri builder.
- App commands need no capability entry, but plugin APIs do (`capabilities/*.json`), and capabilities match windows by label. A new window label needs adding to a capability's `windows` list; e.g. `harbor-video-pip` is only in `video-pip.json`.
- Secondary windows load the frontend with a `?harbor-*=1` query that `src/main.tsx` dispatches on.

## Cargo and platform gates

- In `[target.'cfg(...)'.dependencies]`, `cfg(desktop)` silently matches nothing. Use `cfg(not(any(target_os = "android", target_os = "ios")))`.
- In `build.rs`, branch on `CARGO_CFG_TARGET_OS`, not `cfg!(...)` (that evaluates the host).
- The dev profile uses `opt-level = 2` for the crate and all deps, so the first build is slow. That is intentional.
- `[profile.release]` here is the shipping profile (fat LTO, one codegen unit, `strip = "debuginfo"` so crash-report backtraces keep function names, `panic = "unwind"` because `crash_report.rs` installs a panic hook). Local release speedups live in the git-excluded root `.cargo/config.toml`, whose `[profile.release]` keys override these (see the root `AGENTS.md`, "Release builds"); don't move them into the tracked `Cargo.toml`.
- Platform files use suffixes (`_windows`, `_win`, `_mac`, `_linux`); follow the suffix already used in the module you're editing.

## mpv

- One OS thread (`spawn_event_loop`, `src/mpv.rs`) waits on mpv and emits everything as `mpv://event` (`{event, ...}`); `time-pos` is throttled to 200 ms. Anything slow on that thread delays every playback event, so move it to `spawn_blocking`/`tokio::spawn`.
- Take a tokio child's pipes through `child_pipe.rs` (`take_stdout`/`take_stderr`/`take_stdin`, `output`, `wait_with_output`), never `child.stdout.take()` or `Command::output()`. On Windows tokio reads them with blocking `File` calls, and std aborts the whole process (`0xc0000409`, "operation failed to complete synchronously") when one is still pending; `child_pipe.rs` wraps them as overlapped named pipes. `std::process` pipes are safe.
- Event payload names are the frontend contract (`src/lib/player/mpv.ts`). Change both sides together.
- On Windows `mpv.rs` finds its embedded child among the main HWND's children by `class == "mpv"` or an empty class with a title starting "Harbor", so no other child window (e.g. the `ytmusic.rs` embed) may have a title starting "Harbor".
- `stream_proxy.rs` never forwards `accept-encoding`: reqwest manages compression and rejects a manual header.
- Every mpv that Harbor starts, whether libmpv (`init.set_property("media-controls", "no")`) or the `mpv.exe` sidecar (`--media-controls=no` in `thumbs.rs`, `multiview.rs`, `dvr.rs` and clip export in `mpv.rs`), must turn mpv's own media controls off. An mpv that leaves them on adds a second card to Windows' media overlay next to Harbor's, titled with the file name.
- Windows' media overlay and the taskbar thumbbar live in `media_controls.rs` and `taskbar.rs`. `taskbar::register_app_identity` sets the AUMID `app.harbor` (the installer's shortcut ID) and writes a `DisplayName` under `HKCU\Software\Classes\AppUserModelId`, so a portable exe is not labelled "Unknown app". Thumbbar buttons can be hidden but never removed once added, so "no media" hides all seven.
- On Windows 11 the volume and media keys show only the small volume bar; the media card (title, artwork, timeline) appears only in Quick Settings (`Win+A`) and on the lock screen. Test the overlay there, not with the keys. Windows 10 still shows the card above the volume bar.

## Subsystems with their own notes

- `src/games/AGENTS.md` (game library, emulators, launchers) and `src/music/AGENTS.md` (music engines, Spotify, DJ decks, audio cable).

## Bundled inputs

- `externalBin` (`yt-dlp`, `ffmpeg`, `ffprobe` as `binaries/<name>-<triple>`), Windows `libmpv/libmpv-2.dll` and `resources/capstan/` come from `pnpm run setup`. `resources/pokemon-engine/` is NOT produced by setup (CI runs `node tools/pokemon-engine/build.mjs`); `scripts/pokemon-engine-stage.mjs` only creates it empty so the bundler accepts it.
- Linux `build.rs` panics if no libmpv is found (pkg-config `mpv`, then fixed lib dirs). CI installs `libmpv-dev`.
- Config overlays: `tauri.windows.conf.json` (auto on Windows), `tauri.linux-system.conf.json` (system ffmpeg/yt-dlp, no sidecars), `tauri.updater.conf.json` (CI Windows release only, so the NSIS `setup.exe` gets its updater `.sig`), `tauri.android.conf.json` (`build:tv`, no capstan).

## vendor/ and patches

- `vendor/leveldb-sys` builds via CMake from `src/build.rs` (not a root `build.rs`), with `CMAKE_POLICY_VERSION_MINIMUM=3.10` and `HAVE_CLANG_THREAD_SAFETY=OFF` pinned for CMake 4.x. On Windows it finds CMake via `vswhere`. Paths with spaces are quoted; keep it that way.
- `vendor/rust_cast` is built without its `thread_safe` feature, so a `CastDevice` is `!Send`. `cast_status` polls through one worker thread that owns its connection (30 s max age, 6 s read timeout via the vendored `set_read_timeout`); the LOAD session thread in `cast.rs` keeps blocking reads.
- `transcode::locate_ffmpeg`/`locate_ffprobe` cache the first path they find for the process, and `thumbs::is_hdr_source` caches each URL's successful probe (a timeout or non-zero ffprobe exit stays uncached).
- An ffmpeg/ffprobe/fpcalc run under `tokio::time::timeout` needs `kill_on_drop(true)`: tokio leaves a dropped `Child` running, so a timed-out probe keeps downloading. Cast control commands (`connect_control_device` in `cast.rs`) set a read timeout, since they hold `TRANSPORT_OPS` while waiting for the device.
- `web_server.rs` listens on `0.0.0.0`; its `/manga-img` proxy fetches through `http_fetch::public_http_client` and checks every redirect hop, so LAN clients cannot reach local addresses through it.
- Open item: the LAN-facing servers have no authentication. Any device on the network can add a magnet to the torrent engine's LAN server (`torrent_engine.rs`, `0.0.0.0:11470`, `/{hash}/create`) and send commands over `/api/remote` (`web_server.rs`). Phones and TVs rely on this, so a fix needs a pairing token those clients also learn.
- `[patch.crates-io]` patches `librespot-core` and `librqbit`. Read the comments in `Cargo.toml` before bumping either.

## Tests

- No integration tests: `tests/` holds only fixtures (pulled in with `include_bytes!`). Tests are inline `#[cfg(test)]` or sibling `*_tests.rs` (`src/games/`, `src/music/engine_tests.rs`).
- Single test: `cargo test --manifest-path src-tauri/Cargo.toml <module::path substring>`, with `TAURI_CONFIG` set as in the root notes if setup wasn't run.

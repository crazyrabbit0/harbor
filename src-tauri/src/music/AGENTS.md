# src-tauri/src/music/ (music backend)

The module root is `../music.rs` (no `mod.rs`): `MusicState`, `initialize`, `shutdown`, `pause_for_video`, `try_run_connector_worker`. Frontend notes are in `src/lib/music/AGENTS.md`.

## Where to look

| Task                                         | Location                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stream playback (mpv via `libmpv2`)          | `engine.rs` (tests in `engine_tests.rs`)                                                                                                                                        |
| Spotify (librespot playback, Web API browse) | `spotify/`                                                                                                                                                                      |
| Sources                                      | `connectors/` (`youtube_music/`, `soundcloud/`, `jellyfin/`, `plex/`, `subsonic/`, `local/`; `catalog/` is metadata only: Deezer, iTunes, MusicBrainz, ListenBrainz)            |
| Connector subprocess                         | `worker.rs`, `worker_policy.rs`, `connector.rs`, `registry.rs`                                                                                                                  |
| DJ decks, FX, broadcast                      | `deck.rs`, `deck_audio.rs`, `deck_events.rs`, `audio_fx.rs`, `broadcast.rs`; the `harbor-dj` window is `../dj_deck.rs`                                                          |
| Virtual audio cable                          | `cable_win/`, `cable_mac/` (installs the CoreAudio driver from `harbor-audio-plugin/`), `commands/cable_pipewire.rs`/`commands/cable_linux.rs`, commands in `commands/cable.rs` |
| Local library DB                             | `db/`, `migrations.rs`, `store.rs`, `library.rs`                                                                                                                                |
| Scrobbling                                   | `lastfm.rs`                                                                                                                                                                     |

## Conventions

- ~100 `music::*` commands are registered in `../lib.rs` only; music is desktop-only (nothing in `../mobile.rs`).
- Rust emits `music://event` and `music://lastfm`; `src/lib/music/player.ts` listens. Change both sides together.
- Only one engine is active at a time (`ACTIVE_NONE/STREAM/SPOTIFY` in `../music.rs`); `pause_for_video` is how video playback (`../mpv.rs`) silences music.
- `try_run_connector_worker` turns the exe into a connector worker; `../lib.rs` checks it before building Tauri.
- Deck event loops run on plain `std::thread`s; mpv handles are dropped on `spawn_blocking`, and Tokio runtimes are dropped on a plain thread, never inside async code (`spotify/mod.rs`, `spotify/control.rs`).
- MusicBrainz, ListenBrainz and the yt-dlp updater have rate-limit gates; reuse them instead of calling those services directly.

## Anti-patterns

- Don't resolve YouTube Music streams from raw innertube URLs: YouTube serves ~1 MB and then 403s ffmpeg's `Range: bytes=0-`. Keep yt-dlp (`connectors/youtube_music/ytdlp.rs`).
- librespot's access token expires within the hour and nothing renews it; every playback path goes through `ensure_session` (`spotify/mod.rs`). Browsing working does not mean playback will.
- Process-wide statics (`audio_fx.rs` `ACTIVE`, `cable_win/select.rs` `HELD`, `commands/cable_pipewire.rs` `CHILD`) are shared by every window and deck; check who else holds them before changing their lifecycle.

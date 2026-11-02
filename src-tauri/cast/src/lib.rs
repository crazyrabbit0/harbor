//! Casting to Chromecast, DLNA, Roku and AirPlay, plus the cast server controls; app code comes through `CastHooks`.
pub mod airplay;
pub mod cast;
#[cfg(test)]
mod cast_ipc;
pub mod cast_server;
pub mod dlna;
pub mod roku;

const COMMANDS: &[&str] = &[
    "cast_discover",
    "cast_load",
    "cast_play",
    "cast_pause",
    "cast_seek",
    "cast_stop",
    "cast_status",
    "cast_server_status",
    "cast_server_restart",
    "cast_server_stop",
];

/// True for exactly the commands `invoke_handler` serves; the app's `cast_ffmpeg_present` stays with the app.
pub fn handles(command: &str) -> bool {
    COMMANDS.contains(&command)
}

/// Every command listed in `handles`; the app's `route_commands` sends those names here.
pub fn invoke_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        cast::cast_discover,
        cast::cast_load,
        cast::cast_play,
        cast::cast_pause,
        cast::cast_seek,
        cast::cast_stop,
        cast::cast_status,
        cast_server::cast_server_status,
        cast_server::cast_server_restart,
        cast_server::cast_server_stop,
    ]
}

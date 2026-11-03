//! Controls for the LAN streaming server (`torrent_engine`) that Settings and the player use; casting is not required.
use tauri::AppHandle;

#[derive(Clone, Debug, serde::Serialize)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct CastServerStatus {
    pub bundled: bool,
    pub running: bool,
    pub ready: bool,
    pub port: Option<u16>,
    pub last_error: Option<String>,
    pub restart_count: u32,
}

#[tauri::command]
pub fn cast_server_status() -> CastServerStatus {
    let (running, port, last_error) = crate::torrent_engine::lan_status();
    CastServerStatus {
        bundled: running,
        running,
        ready: running,
        port,
        last_error,
        restart_count: 0,
    }
}

#[tauri::command]
pub async fn cast_server_restart(app: AppHandle) -> Result<(), String> {
    crate::torrent_engine::start_lan_server(&app)
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn cast_server_stop() {
    crate::torrent_engine::stop_lan_server();
    let _ =
        tauri::async_runtime::spawn_blocking(crate::stremio_sidecar::kill_orphan_sidecars).await;
}

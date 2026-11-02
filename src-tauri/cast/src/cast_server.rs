use harbor_shared::cast_hooks::CastHooks;
use tauri::{AppHandle, Manager};

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

pub fn stop(app: &AppHandle) {
    (app.state::<CastHooks>().stop_lan_server)();
}

#[tauri::command]
pub fn cast_server_status(hooks: tauri::State<'_, CastHooks>) -> CastServerStatus {
    let (running, port, last_error) = (hooks.lan_status)();
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
    let start = app.state::<CastHooks>().start_lan_server.clone();
    start(app).await.map(|_| ())
}

#[tauri::command]
pub async fn cast_server_stop(app: AppHandle) {
    let hooks = app.state::<CastHooks>();
    (hooks.stop_lan_server)();
    let kill = hooks.kill_orphan_sidecars.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || kill()).await;
}

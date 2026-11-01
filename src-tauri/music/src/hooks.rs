//! The app functions music calls, read from the `AppHooks` the app manages before `initialize`.
use std::path::PathBuf;
use std::time::Duration;

use harbor_shared::app_hooks::{AppHooks, YtDlpOutput};
use tauri::Manager;

fn hooks(app: &tauri::AppHandle) -> AppHooks {
    app.state::<AppHooks>().inner().clone()
}

pub(crate) fn secret_value(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
    (hooks(app).secret_value)(app, key)
}

pub(crate) fn read_secrets_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let hooks = hooks(&app);
    (hooks.read_secrets_file)(app)
}

pub(crate) fn write_secrets_file(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let hooks = hooks(&app);
    (hooks.write_secrets_file)(app, content)
}

pub(crate) fn locate_ffmpeg(app: &tauri::AppHandle) -> Option<PathBuf> {
    (hooks(app).locate_ffmpeg)()
}

pub(crate) async fn run_yt_dlp(
    app: &tauri::AppHandle,
    args: Vec<String>,
    timeout: Duration,
    label: &str,
) -> Result<YtDlpOutput, String> {
    (hooks(app).run_yt_dlp)(app.clone(), args, timeout, label.to_string()).await
}

pub(crate) fn allow_asset_directory(app: &tauri::AppHandle, path: &str) -> bool {
    (hooks(app).allow_asset_directory)(app, path)
}

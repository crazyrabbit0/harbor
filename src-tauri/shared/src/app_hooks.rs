//! App functions that member crates reach through managed state, since they cannot depend on the app crate.
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

pub struct YtDlpOutput {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

pub type YtDlpFuture = Pin<Box<dyn Future<Output = Result<YtDlpOutput, String>> + Send>>;

/// Managed state the app registers in `setup` before any member crate initializes.
#[derive(Clone)]
pub struct AppHooks {
    pub secret_value:
        Arc<dyn Fn(&tauri::AppHandle, &str) -> Result<Option<String>, String> + Send + Sync>,
    pub read_secrets_file:
        Arc<dyn Fn(tauri::AppHandle) -> Result<Option<String>, String> + Send + Sync>,
    pub write_secrets_file:
        Arc<dyn Fn(tauri::AppHandle, String) -> Result<(), String> + Send + Sync>,
    pub locate_ffmpeg: Arc<dyn Fn() -> Option<PathBuf> + Send + Sync>,
    pub run_yt_dlp:
        Arc<dyn Fn(tauri::AppHandle, Vec<String>, Duration, String) -> YtDlpFuture + Send + Sync>,
    pub allow_asset_directory: Arc<dyn Fn(&tauri::AppHandle, &str) -> bool + Send + Sync>,
}

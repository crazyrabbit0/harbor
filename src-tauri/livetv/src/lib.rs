//! Live TV recording (DVR) and Multiview tiles, both driven through the mpv sidecar.
pub mod dvr;
pub mod multiview;

use dvr::*;
use multiview::*;

/// Every `dvr_*` and `multiview_*` command; the app's `route_commands` sends those prefixes here.
pub fn invoke_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        dvr_start,
        dvr_stop,
        dvr_list,
        dvr_default_dir,
        dvr_reveal,
        multiview_open,
        multiview_prespawn,
        multiview_geometry,
        multiview_audio_focus,
        multiview_close,
        multiview_visibility,
        multiview_stop_all,
    ]
}

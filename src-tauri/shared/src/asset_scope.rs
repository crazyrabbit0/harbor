use std::path::Path;

use tauri::{AppHandle, Manager, Runtime};

/// Lets the asset protocol load these exact files; relative paths and missing files are skipped.
pub fn allow_asset_files<'a, R: Runtime>(
    app: &AppHandle<R>,
    files: impl IntoIterator<Item = &'a String>,
) {
    let scope = app.asset_protocol_scope();
    for file in files {
        let path = Path::new(file);
        if path.is_absolute() && path.is_file() {
            let _ = scope.allow_file(path);
        }
    }
}

use std::path::{Component, Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

// Top-level settings.json keys whose value is a user-chosen folder the frontend reads, writes, reveals or loads as assets.
const SETTINGS_FOLDER_KEYS: &[&str] = &[
    "downloadDir",
    "ebookDownloadDir",
    "screenshotDir",
    "gifDir",
    "clipDir",
    "playbackCacheDir",
    "streamCacheDir",
];

// One call never widens the scope by more than this many paths.
const MAX_PATHS_PER_CALL: usize = 512;

#[derive(Debug, PartialEq, Eq)]
enum Grant {
    Directory(PathBuf),
    File(PathBuf),
}

#[derive(Debug, PartialEq, Eq)]
enum Rejection {
    Relative,
    Missing,
    Root,
    HomeOrAncestor,
    Sensitive,
    NotDirectory,
}

fn settings_object(json: &str) -> Option<serde_json::Map<String, serde_json::Value>> {
    match serde_json::from_str(json) {
        Ok(serde_json::Value::Object(map)) => Some(map),
        _ => None,
    }
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn settings_folders(json: &str) -> Vec<String> {
    let Some(map) = settings_object(json) else {
        return Vec::new();
    };
    SETTINGS_FOLDER_KEYS
        .iter()
        .filter_map(|key| non_empty(map.get(*key)?.as_str()?))
        .collect()
}

// Screensaver media is a list of picked files, `screensaverMedia: [{ path }]`.
fn settings_media_files(json: &str) -> Vec<String> {
    let Some(map) = settings_object(json) else {
        return Vec::new();
    };
    let Some(items) = map.get("screensaverMedia").and_then(serde_json::Value::as_array) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| non_empty(item.get("path")?.as_str()?))
        .take(MAX_PATHS_PER_CALL)
        .collect()
}

// Dot folders (.ssh, .gnupg, .config) and per-user app state (AppData, Library) hold credentials no media folder needs.
fn sensitive(path: &Path, home: Option<&Path>) -> bool {
    let hidden = path.components().any(|component| {
        matches!(component, Component::Normal(name) if name.to_string_lossy().starts_with('.'))
    });
    let app_state = home.is_some_and(|home| {
        ["AppData", "Library"]
            .iter()
            .any(|dir| path.starts_with(home.join(dir)))
    });
    let system = std::env::var_os("SystemRoot")
        .and_then(|root| dunce::canonicalize(root).ok())
        .is_some_and(|root| path.starts_with(root));
    hidden || app_state || system
}

fn classify(raw: &str, home: Option<&Path>) -> Result<Grant, Rejection> {
    let trimmed = raw.trim();
    let path = Path::new(trimmed);
    if trimmed.is_empty() || !path.is_absolute() {
        return Err(Rejection::Relative);
    }
    let resolved = dunce::canonicalize(path).map_err(|_| Rejection::Missing)?;
    if resolved.parent().is_none() {
        return Err(Rejection::Root);
    }
    let home = home.map(|home| dunce::canonicalize(home).unwrap_or_else(|_| home.to_path_buf()));
    if home.as_deref().is_some_and(|home| home.starts_with(&resolved)) {
        return Err(Rejection::HomeOrAncestor);
    }
    if sensitive(&resolved, home.as_deref()) {
        return Err(Rejection::Sensitive);
    }
    if resolved.is_dir() {
        Ok(Grant::Directory(resolved))
    } else if resolved.is_file() {
        Ok(Grant::File(resolved))
    } else {
        Err(Rejection::Missing)
    }
}

fn apply<R: Runtime>(app: &AppHandle<R>, grant: &Grant) -> tauri::Result<()> {
    let fs = app.try_fs_scope();
    let asset = app.asset_protocol_scope();
    match grant {
        Grant::Directory(path) => {
            if let Some(fs) = &fs {
                fs.allow_directory(path, true)?;
            }
            asset.allow_directory(path, true)
        }
        Grant::File(path) => {
            if let Some(fs) = &fs {
                fs.allow_file(path)?;
            }
            asset.allow_file(path)
        }
    }
}

fn allow_all<R: Runtime>(app: &AppHandle<R>, paths: &[String]) -> Vec<String> {
    let home = app.path().home_dir().ok();
    let mut granted = Vec::new();
    for raw in paths.iter().take(MAX_PATHS_PER_CALL) {
        match classify(raw, home.as_deref()) {
            Ok(grant) => match apply(app, &grant) {
                Ok(()) => granted.push(raw.clone()),
                Err(error) => eprintln!("[harbor::fs-scope] allow failed: {error}"),
            },
            Err(reason) => eprintln!("[harbor::fs-scope] skipped a path: {reason:?}"),
        }
    }
    granted
}

/// Re-allows the folders and media files a settings.json document names; runs at setup and after each settings_write.
pub fn allow_settings_content<R: Runtime>(app: &AppHandle<R>, json: &str) {
    let mut paths = settings_folders(json);
    paths.extend(settings_media_files(json));
    allow_all(app, &paths);
}

pub fn allow_saved_settings<R: Runtime>(app: &AppHandle<R>) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    if let Ok(json) = std::fs::read_to_string(dir.join("settings.json")) {
        allow_settings_content(app, &json);
    }
}

fn asset_directory(raw: &str, home: Option<&Path>) -> Result<PathBuf, Rejection> {
    match classify(raw, home)? {
        Grant::Directory(path) => Ok(path),
        Grant::File(_) => Err(Rejection::NotDirectory),
    }
}

/// Adds a folder Rust persists itself (the local music library) to the asset protocol scope only; false when refused.
pub fn allow_asset_directory<R: Runtime>(app: &AppHandle<R>, path: &str) -> bool {
    let home = app.path().home_dir().ok();
    match asset_directory(path, home.as_deref()) {
        Ok(directory) => match app.asset_protocol_scope().allow_directory(&directory, true) {
            Ok(()) => true,
            Err(error) => {
                eprintln!("[harbor::fs-scope] asset allow failed: {error}");
                false
            }
        },
        Err(reason) => {
            eprintln!("[harbor::fs-scope] skipped an asset folder: {reason:?}");
            false
        }
    }
}

/// Re-allows folders and files the frontend keeps outside settings.json; returns the inputs it granted.
#[tauri::command]
pub fn fs_scope_allow(
    app: AppHandle,
    window: tauri::Window,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    if window.label() != "main" {
        return Err("fs_scope_window".into());
    }
    if paths.len() > MAX_PATHS_PER_CALL {
        return Err("fs_scope_too_many".into());
    }
    Ok(allow_all(&app, &paths))
}

#[cfg(test)]
#[path = "fs_scope_tests.rs"]
mod tests;

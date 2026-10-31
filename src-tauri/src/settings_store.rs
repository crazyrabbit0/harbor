use tauri::Manager;

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn read_optional(path: &std::path::Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// Sync commands run on the main thread, so file I/O (and its fsync) goes to the blocking pool.
async fn off_main<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn settings_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    off_main(move || read_optional(&settings_path(&app)?)).await
}

// Writes share one temp name per file, so they run one at a time.
static WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

// Flushed before the rename, so a power loss leaves the old file or the new one, never an empty one.
fn write_atomic(path: &std::path::Path, content: &str) -> Result<(), String> {
    use std::io::Write;
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let tmp = path.with_extension("json.tmp");
    let mut file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn settings_write(app: tauri::AppHandle, content: String) -> Result<(), String> {
    off_main(move || {
        write_atomic(&settings_path(&app)?, &content)?;
        #[cfg(desktop)]
        crate::fs_scope::allow_settings_content(&app, &content);
        Ok(())
    })
    .await
}

fn secrets_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("secrets.json"))
}

pub(crate) fn read_secrets_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    read_optional(&secrets_path(&app)?)
}

pub(crate) fn write_secrets_file(app: tauri::AppHandle, content: String) -> Result<(), String> {
    write_atomic(&secrets_path(&app)?, &content)
}

#[tauri::command]
pub async fn secrets_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    off_main(move || read_secrets_file(app)).await
}

#[tauri::command]
pub async fn secrets_write(app: tauri::AppHandle, content: String) -> Result<(), String> {
    off_main(move || write_secrets_file(app, content)).await
}

pub(crate) fn secret_value(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
    let Some(content) = read_optional(&secrets_path(app)?)? else {
        return Ok(None);
    };
    let value =
        serde_json::from_str::<serde_json::Value>(&content).map_err(|error| error.to_string())?;
    Ok(value
        .as_object()
        .and_then(|items| items.get(key))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string))
}

pub fn read_torrents_disabled(app: &tauri::AppHandle) -> bool {
    let Ok(path) = settings_path(app) else {
        return false;
    };
    let Ok(s) = std::fs::read_to_string(&path) else {
        return false;
    };
    parse_torrents_disabled(&s)
}

// A settings file without the key (first launch) defers, matching the frontend default.
pub fn read_defer_torrent_engine(app: &tauri::AppHandle) -> bool {
    let Ok(path) = settings_path(app) else {
        return true;
    };
    let Ok(s) = std::fs::read_to_string(&path) else {
        return true;
    };
    parse_defer_torrent_engine(&s)
}

fn parse_defer_torrent_engine(json: &str) -> bool {
    !json.contains("\"deferTorrentEngine\"") || parse_bool_flag(json, "deferTorrentEngine")
}

fn parse_torrents_disabled(json: &str) -> bool {
    parse_bool_flag(json, "torrentsDisabled")
}

fn parse_bool_flag(json: &str, key: &str) -> bool {
    let needle = format!("\"{}\"", key);
    let Some(idx) = json.find(&needle) else {
        return false;
    };
    let rest = &json[idx + needle.len()..];
    let mut chars = rest.chars().peekable();
    while let Some(c) = chars.peek() {
        if c.is_whitespace() || *c == ':' {
            chars.next();
        } else {
            break;
        }
    }
    matches!(chars.next(), Some('t') | Some('T'))
}

#[cfg(test)]
mod tests {
    use super::parse_defer_torrent_engine;

    #[test]
    fn defer_follows_the_saved_choice_and_defaults_on() {
        assert!(parse_defer_torrent_engine("{}"));
        assert!(parse_defer_torrent_engine(r#"{"deferTorrentEngine": true}"#));
        assert!(!parse_defer_torrent_engine(r#"{"deferTorrentEngine":false}"#));
    }
}

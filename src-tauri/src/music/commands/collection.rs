use super::super::{
    bootstrap, library, store, MusicBootstrap, MusicMigration, MusicState, MusicStream, MusicTrack,
};
use std::panic::AssertUnwindSafe;
use std::sync::mpsc::{channel, Sender};
use std::sync::OnceLock;
use tauri::Manager;

fn music_db_file(profile: Option<&str>) -> String {
    let id = profile.unwrap_or("").trim();
    if id.is_empty() || id == "default" {
        return "music.db".to_string();
    }
    let safe: String = id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' })
        .take(48)
        .collect();
    format!("music-{safe}.db")
}

type DbJob = Box<dyn FnOnce() + Send>;

// One worker serializes DB access off the main thread; callers that need ordering await or chain their writes.
fn db_queue() -> &'static Sender<DbJob> {
    static QUEUE: OnceLock<Sender<DbJob>> = OnceLock::new();
    QUEUE.get_or_init(|| {
        let (sender, receiver) = channel::<DbJob>();
        let _ = std::thread::Builder::new()
            .name("music-db".into())
            .spawn(move || {
                for job in receiver {
                    let _ = std::panic::catch_unwind(AssertUnwindSafe(job));
                }
            });
        sender
    })
}

async fn with_music<T: Send + 'static>(
    app: tauri::AppHandle,
    operation: impl FnOnce(&MusicState) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (reply, result) = tokio::sync::oneshot::channel();
    db_queue()
        .send(Box::new(move || {
            let _ = reply.send(operation(&app.state::<MusicState>()));
        }))
        .map_err(|_| "Music database worker is unavailable".to_string())?;
    result
        .await
        .map_err(|_| "Music database worker is unavailable".to_string())?
}

#[tauri::command]
pub async fn music_db_init(
    app: tauri::AppHandle,
    migration: Option<MusicMigration>,
    profile: Option<String>,
) -> Result<MusicBootstrap, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    with_music(app, move |state| {
        state
            .db
            .initialize(&directory.join(music_db_file(profile.as_deref())))?;
        if let Some(migration) = migration {
            store::migrate(&state.db, &migration)?;
        }
        bootstrap(&state.db)
    })
    .await
}

#[tauri::command]
pub async fn music_track_upsert(app: tauri::AppHandle, track: MusicTrack) -> Result<(), String> {
    with_music(app, move |state| state.db.upsert_track(&track)).await
}

#[tauri::command]
pub async fn music_track_get(
    app: tauri::AppHandle,
    id: String,
) -> Result<Option<MusicTrack>, String> {
    with_music(app, move |state| state.db.get_track(&id)).await
}

#[tauri::command]
pub async fn music_resolve_cached(
    app: tauri::AppHandle,
    id: String,
) -> Result<Option<MusicStream>, String> {
    with_music(app, move |state| state.db.cached_stream(&id)).await
}

#[tauri::command]
pub async fn music_get_liked(app: tauri::AppHandle) -> Result<Vec<MusicTrack>, String> {
    with_music(app, |state| store::liked_tracks(&state.db)).await
}

#[tauri::command]
pub async fn music_set_liked(
    app: tauri::AppHandle,
    track: MusicTrack,
    liked: bool,
) -> Result<(), String> {
    with_music(app, move |state| store::set_liked(&state.db, &track, liked)).await
}

#[tauri::command]
pub async fn music_get_recents(app: tauri::AppHandle) -> Result<Vec<MusicTrack>, String> {
    with_music(app, |state| store::recents(&state.db)).await
}

#[tauri::command]
pub async fn music_add_recent(app: tauri::AppHandle, track: MusicTrack) -> Result<(), String> {
    with_music(app, move |state| store::add_recent(&state.db, &track)).await
}

#[tauri::command]
pub async fn music_get_queue(app: tauri::AppHandle) -> Result<Vec<MusicTrack>, String> {
    with_music(app, |state| store::queue(&state.db)).await
}

#[tauri::command]
pub async fn music_set_queue(app: tauri::AppHandle, tracks: Vec<MusicTrack>) -> Result<(), String> {
    with_music(app, move |state| store::set_queue(&state.db, &tracks)).await
}

#[tauri::command]
pub async fn music_list_albums(
    app: tauri::AppHandle,
) -> Result<Vec<library::MusicAlbum>, String> {
    with_music(app, |state| library::list_albums(&state.db)).await
}

#[tauri::command]
pub async fn music_list_artists(
    app: tauri::AppHandle,
) -> Result<Vec<library::MusicArtist>, String> {
    with_music(app, |state| library::list_artists(&state.db)).await
}

#[tauri::command]
pub async fn music_list_playlists(
    app: tauri::AppHandle,
) -> Result<Vec<library::MusicPlaylist>, String> {
    with_music(app, |state| library::list_playlists(&state.db)).await
}

#[tauri::command]
pub async fn music_create_playlist(
    app: tauri::AppHandle,
    name: String,
) -> Result<library::MusicPlaylist, String> {
    with_music(app, move |state| library::create_playlist(&state.db, &name)).await
}

#[tauri::command]
pub async fn music_add_to_playlist(
    app: tauri::AppHandle,
    playlist_id: String,
    track: MusicTrack,
) -> Result<library::MusicPlaylist, String> {
    with_music(app, move |state| {
        library::add_to_playlist(&state.db, &playlist_id, &track)
    })
    .await
}

#[tauri::command]
pub async fn music_add_tracks_to_playlist(
    app: tauri::AppHandle,
    playlist_id: String,
    tracks: Vec<MusicTrack>,
) -> Result<library::MusicPlaylist, String> {
    with_music(app, move |state| {
        library::add_tracks_to_playlist(&state.db, &playlist_id, &tracks)
    })
    .await
}

#[tauri::command]
pub async fn music_rename_playlist(
    app: tauri::AppHandle,
    playlist_id: String,
    name: String,
) -> Result<library::MusicPlaylist, String> {
    with_music(app, move |state| {
        library::rename_playlist(&state.db, &playlist_id, &name)
    })
    .await
}

#[tauri::command]
pub async fn music_delete_playlist(
    app: tauri::AppHandle,
    playlist_id: String,
) -> Result<(), String> {
    with_music(app, move |state| library::delete_playlist(&state.db, &playlist_id)).await
}

#[tauri::command]
pub async fn music_reorder_playlist(
    app: tauri::AppHandle,
    playlist_id: String,
    track_id: String,
    to_index: usize,
) -> Result<library::MusicPlaylist, String> {
    with_music(app, move |state| {
        library::reorder_playlist(&state.db, &playlist_id, &track_id, to_index)
    })
    .await
}

#[tauri::command]
pub async fn music_remove_from_playlist(
    app: tauri::AppHandle,
    playlist_id: String,
    track_id: String,
) -> Result<library::MusicPlaylist, String> {
    with_music(app, move |state| {
        library::remove_from_playlist(&state.db, &playlist_id, &track_id)
    })
    .await
}

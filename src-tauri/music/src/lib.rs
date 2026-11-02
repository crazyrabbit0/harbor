mod audio;
mod catalog_commands;
mod commands;
mod connector;
mod connectors;
mod db;
mod engine;
mod hooks;
mod lastfm;
mod library;
mod m3u;
mod matching;
mod migrations;
mod model;
mod registry;
mod rows;
mod spotify;
mod store;
mod worker;
mod worker_policy;

pub use catalog_commands::*;
pub use commands::*;
pub use model::*;
pub use spotify::library::*;

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::sync::Arc;
use tauri::Manager;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename = "MusicTrackCore", optional_fields = nullable))]
pub struct MusicTrack {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    explicit: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(test, ts(type = r#""audio" | "video""#))]
    media_kind: Option<String>,
    id: String,
    connector_id: Option<String>,
    source_id: Option<String>,
    playback_url: Option<String>,
    title: String,
    artist: String,
    album: Option<String>,
    artwork: String,
    #[cfg_attr(test, ts(type = "number"))]
    duration_seconds: u64,
    duration_label: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicStream {
    url: String,
    mime_type: String,
    bitrate: u64,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    http_headers: std::collections::BTreeMap<String, String>,
}

impl MusicStream {
    fn request_headers(&self) -> Result<reqwest::header::HeaderMap, String> {
        let invalid = || "Music source returned invalid request headers".to_string();
        if self.http_headers.len() > 16 {
            return Err(invalid());
        }
        let mut headers = reqwest::header::HeaderMap::new();
        for (name, value) in &self.http_headers {
            if name.len() > 128 || value.len() > 8192 {
                return Err(invalid());
            }
            let name =
                reqwest::header::HeaderName::from_bytes(name.as_bytes()).map_err(|_| invalid())?;
            let value = reqwest::header::HeaderValue::from_str(value).map_err(|_| invalid())?;
            headers.insert(name, value);
        }
        Ok(headers)
    }
}

/// The video rendition of a track. `audio_url` is separate because YouTube only muxes audio
/// into video up to 720p; above that mpv plays the video and is handed the audio alongside it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct MusicVideoStream {
    url: String,
    audio_url: Option<String>,
    #[serde(skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    #[cfg_attr(test, ts(type = "Record<string, string>", optional))]
    http_headers: std::collections::BTreeMap<String, String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct MusicSourceCandidate {
    connector_id: String,
    connector_name: String,
    health: connector::ConnectorHealth,
    track: MusicTrack,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct MusicMigration {
    liked_ids: Option<Vec<String>>,
    recents: Option<Vec<MusicTrack>>,
    queue: Option<Vec<MusicTrack>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct MusicBootstrap {
    liked_ids: Vec<String>,
    liked_tracks: Vec<MusicTrack>,
    recents: Vec<MusicTrack>,
    queue: Vec<MusicTrack>,
}

fn bootstrap(database: &db::MusicDb) -> Result<MusicBootstrap, String> {
    Ok(MusicBootstrap {
        liked_ids: store::liked_ids(database)?,
        liked_tracks: store::liked_tracks(database)?,
        recents: store::recents(database)?,
        queue: store::queue(database)?,
    })
}

const ACTIVE_NONE: u8 = 0;
const ACTIVE_STREAM: u8 = 1;
const ACTIVE_SPOTIFY: u8 = 2;

pub struct MusicState {
    db: db::MusicDb,
    registry: registry::ConnectorRegistry,
    engine: engine::MusicEngine,
    spotify: Arc<spotify::SpotifyState>,
    active_engine: AtomicU8,
    play_request: AtomicU64,
    play_commit: tokio::sync::Mutex<()>,
}

impl MusicState {
    pub fn new() -> Self {
        let registry = registry::ConnectorRegistry::new();
        let spotify = Arc::new(spotify::SpotifyState::new());
        connectors::register(&registry).expect("register music connectors");
        registry
            .register(Box::new(spotify::connector::SpotifyConnector::new(
                spotify.clone(),
            )))
            .expect("register Spotify connector");
        registry
            .register(Box::new(lastfm::LastFmConnector::new()))
            .expect("register Last.fm connector");
        Self {
            db: db::MusicDb::new(),
            engine: engine::MusicEngine::new(),
            registry,
            spotify,
            active_engine: AtomicU8::new(ACTIVE_NONE),
            play_request: AtomicU64::new(0),
            play_commit: tokio::sync::Mutex::new(()),
        }
    }

    fn set_active_engine(&self, engine: u8) {
        self.active_engine.store(engine, Ordering::SeqCst);
    }

    fn active_engine(&self) -> u8 {
        self.active_engine.load(Ordering::SeqCst)
    }

    fn begin_play_request(&self) -> u64 {
        self.play_request.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn is_current_play_request(&self, request: u64) -> bool {
        self.play_request.load(Ordering::SeqCst) == request
    }
}

pub fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let state = app.state::<MusicState>();
    state.db.initialize(&directory.join("music.db"))?;
    state
        .engine
        .initialize_audio(directory.join("music-audio.json"));
    state.spotify.initialize(app, directory.join("spotify"));
    connectors::local::grant_saved_folder(app);
    worker::initialize(app)
}

pub fn shutdown(app: &tauri::AppHandle) {
    let state = app.state::<MusicState>();
    state.engine.shutdown();
    state.spotify.shutdown();
}

pub fn try_run_connector_worker() -> bool {
    worker::try_run_from_args()
}

pub async fn pause_for_video(app: &tauri::AppHandle) -> Result<bool, String> {
    let state = app.state::<MusicState>();
    match state.active_engine() {
        ACTIVE_SPOTIFY => state.spotify.pause_for_video().await,
        ACTIVE_STREAM => state.engine.pause_for_video().await,
        _ => Ok(false),
    }
}

fn duration_label(seconds: u64) -> String {
    format!("{}:{:02}", seconds / 60, seconds % 60)
}

/// Handler for every `music_*` command; the app routes them here by prefix.
pub fn invoke_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        music_health,
        music_source_candidates,
        music_spotify_status,
        music_spotify_connect,
        music_spotify_disconnect,
        music_spotify_devices,
        music_spotify_set_device,
        music_spotify_device,
        music_spotify_library_page,
        music_spotify_create_playlist,
        music_spotify_add_to_playlist,
        music_lastfm_auth,
        music_lastfm_complete_auth,
        music_lastfm_status,
        music_run_connector_worker,
        music_search,
        music_resolve_stream,
        music_db_init,
        music_track_upsert,
        music_track_get,
        music_resolve_cached,
        music_get_liked,
        music_set_liked,
        music_get_recents,
        music_add_recent,
        music_get_queue,
        music_set_queue,
        music_list_albums,
        music_list_artists,
        music_list_playlists,
        music_create_playlist,
        music_add_to_playlist,
        music_add_tracks_to_playlist,
        music_rename_playlist,
        music_delete_playlist,
        music_reorder_playlist,
        music_remove_from_playlist,
        music_import_m3u,
        music_export_m3u,
        music_play_track,
        music_engine_pause,
        music_paused_for_video,
        music_resume_after_video,
        music_engine_seek,
        music_deck_loop,
        music_deck_scratch,
        music_prewarm_track,
        music_scratch_window,
        music_scratch_hold,
        music_cable_status,
        music_cable_create,
        music_cable_destroy,
        music_deck_play,
        music_deck_pause,
        music_deck_seek,
        music_deck_volume,
        music_deck_stop,
        music_deck_states,
        music_deck_primary,
        music_deck_crossfade,
        music_deck_crossfade_get,
        music_fx_set,
        music_fx_clear,
        music_fx_get,
        music_engine_set_volume,
        music_audio_devices,
        music_audio_settings_get,
        music_audio_meter_set_enabled,
        music_audio_meter_snapshot,
        music_audio_settings_set,
        music_export_filtered,
        music_broadcast_targets,
        music_broadcast_start,
        music_broadcast_stop,
        music_broadcast_status,
        music_engine_stop,
        music_home_rows,
        music_browse_connector,
        music_album_tracks,
        music_artist_top,
        music_artist_catalog,
        music_artist_rows,
        music_catalog_playlist_tracks,
        music_station_tracks,
        music_search_typed,
        music_video_stream,
        music_search_videos,
        music_search_video_page,
        music_connections,
        music_connect,
        music_disconnect,
        music_local_scan,
        music_local_collection,
    ]
}

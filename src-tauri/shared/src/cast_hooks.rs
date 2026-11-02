//! App functions the `harbor-cast` crate reaches through managed state: stream proxy, subtitles and ffmpeg.
use crate::cast_types::{
    AudioCastInput, CastSub, CastSubStyle, PreparedSub, RegisterArgs, RegisterResult,
};
use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;

pub type CastFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;

pub type PrepareSubFn = dyn Fn(
        CastSub,
        CastSubStyle,
        String,
        HashMap<String, String>,
        f64,
    ) -> CastFuture<Option<PreparedSub>>
    + Send
    + Sync;

/// Managed state the app registers on its builder; the cast commands read it through `tauri::State`.
#[derive(Clone)]
pub struct CastHooks {
    pub register_cast: Arc<dyn Fn(RegisterArgs) -> CastFuture<RegisterResult> + Send + Sync>,
    pub register_audio_cast:
        Arc<dyn Fn(AudioCastInput) -> CastFuture<Result<RegisterResult, String>> + Send + Sync>,
    pub audio_cast_input: Arc<dyn Fn(String) -> CastFuture<Option<AudioCastInput>> + Send + Sync>,
    pub stop_hls_session: Arc<dyn Fn(String) -> CastFuture<bool> + Send + Sync>,
    pub prepare_sub: Arc<PrepareSubFn>,
    pub cleanup_subs: Arc<dyn Fn() + Send + Sync>,
    pub ffmpeg_present: Arc<dyn Fn() -> bool + Send + Sync>,
    pub locate_ffmpeg: Arc<dyn Fn() -> Option<PathBuf> + Send + Sync>,
}

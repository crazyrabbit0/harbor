use axum::body::{to_bytes, Body};
use axum::extract::{Path, State};
#[cfg(target_os = "linux")]
use axum::http::{header, Method};
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::Router;
use futures_util::StreamExt;
use std::collections::HashMap;
use std::net::SocketAddr;
#[cfg(target_os = "linux")]
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
#[cfg(target_os = "linux")]
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::net::TcpListener;
use tokio::sync::{watch, RwLock};
use uuid::Uuid;

use crate::cast_hls::HlsState;
use crate::transcode::{handle_transcode, TranscodeProfile};
#[path = "cast_audio.rs"]
mod cast_audio;
pub(crate) use cast_audio::AudioCastInput;
use cast_audio::AudioCastState;

#[derive(Clone)]
struct Session {
    url: String,
    base_url: Option<String>,
    headers: HashMap<String, String>,
    transcode: bool,
    profile: TranscodeProfile,
    burn_sub: Option<(String, String)>,
    /// The embedded audio stream a transcode keeps; every stream when absent.
    audio_ordinal: Option<u32>,
    prebuffer: Option<watch::Receiver<PrebufferState>>,
    /// Where a transcode starts, so a renderer that cannot seek a live stream still resumes.
    start_sec: f64,
    /// Serve MPEG-TS as video/mpeg, the type DLNA renderers accept.
    dlna: bool,
    /// A DLNA transcode's title length; known means a TV remote may time-seek it (`TimeSeekRange.dlna.org`).
    duration_sec: Option<f64>,
    /// Shared by every request of this session, so a new one stops the transcode still running.
    transcode_slot: crate::transcode::TranscodeSlot,
    /// Registered by a cast, so a transcode keeps one audio track for the receiver.
    cast: bool,
    /// Refreshed by every request, so cleanup drops only sessions nobody fetches any more.
    last_used: Instant,
}

#[derive(Clone)]
#[cfg(target_os = "linux")]
struct LocalFile {
    path: PathBuf,
    created_at: Instant,
}

#[derive(Clone)]
enum PrebufferState {
    Loading,
    Ready(Arc<PreparedPrefix>),
    Failed,
}

struct PreparedPrefix {
    bytes: Vec<u8>,
    total_size: u64,
    response_headers: HeaderMap,
}

#[derive(Clone)]
pub struct ProxyState {
    sessions: Arc<RwLock<HashMap<String, Session>>>,
    #[cfg(target_os = "linux")]
    local_files: Arc<RwLock<HashMap<String, LocalFile>>>,
    port: u16,
    #[cfg(target_os = "linux")]
    local_port: u16,
    client: reqwest::Client,
    hls: HlsState,
    audio: AudioCastState,
}

pub use harbor_shared::cast_types::{RegisterArgs, RegisterResult};

impl ProxyState {
    pub fn placeholder() -> Self {
        ProxyState {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            #[cfg(target_os = "linux")]
            local_files: Arc::new(RwLock::new(HashMap::new())),
            port: 0,
            #[cfg(target_os = "linux")]
            local_port: 0,
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("proxy HTTP client"),
            hls: HlsState::new(),
            audio: AudioCastState::default(),
        }
    }

    pub async fn start() -> Result<Self, String> {
        let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], 0)))
            .await
            .map_err(|e| format!("bind failed: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("local_addr: {}", e))?
            .port();
        #[cfg(target_os = "linux")]
        let (local_listener, local_port) =
            match TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await {
                Ok(listener) => {
                    let port = listener
                        .local_addr()
                        .map_err(|e| format!("local media local_addr: {e}"))?
                        .port();
                    (Some(listener), port)
                }
                Err(error) => {
                    eprintln!("[stream-proxy] local media bind failed: {error}");
                    (None, 0)
                }
            };
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .pool_idle_timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| format!("client build: {}", e))?;
        let hls = HlsState::new();
        let state = ProxyState {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            #[cfg(target_os = "linux")]
            local_files: Arc::new(RwLock::new(HashMap::new())),
            port,
            #[cfg(target_os = "linux")]
            local_port,
            client,
            hls: hls.clone(),
            audio: AudioCastState::default(),
        };
        let proxy_routes = Router::new()
            .route("/s/{id}", get(handle_stream).head(handle_stream))
            .route(
                "/p/{id}/{*path}",
                get(handle_playlist).head(handle_playlist),
            )
            .route("/health", get(handle_health))
            .with_state(state.clone());
        let app = proxy_routes
            .merge(crate::cast_hls::router(hls))
            .merge(state.audio.clone().router());
        #[cfg(target_os = "linux")]
        let local_media = Router::new()
            .route(
                "/trailer/{id}",
                get(handle_local_file).head(handle_local_file),
            )
            .with_state(state.clone());
        tokio::spawn(async move {
            if let Err(e) = axum::serve(listener, app).await {
                eprintln!("[stream-proxy] server error: {}", e);
            }
        });
        #[cfg(target_os = "linux")]
        if let Some(local_listener) = local_listener {
            tokio::spawn(async move {
                if let Err(e) = axum::serve(local_listener, local_media).await {
                    eprintln!("[stream-proxy] local media server error: {e}");
                }
            });
        }
        Ok(state)
    }

    #[cfg(target_os = "linux")]
    pub async fn register_local_file(&self, path: PathBuf) -> Result<String, String> {
        if self.local_port == 0 {
            return Err("local media server is unavailable".to_string());
        }
        let path = tokio::fs::canonicalize(path)
            .await
            .map_err(|e| format!("local media path: {e}"))?;
        let metadata = tokio::fs::metadata(&path)
            .await
            .map_err(|e| format!("local media metadata: {e}"))?;
        if !metadata.is_file() {
            return Err("local media path is not a file".to_string());
        }
        let size = metadata.len();
        let id = Uuid::new_v4().to_string();
        self.local_files.write().await.insert(
            id.clone(),
            LocalFile {
                path,
                created_at: Instant::now(),
            },
        );
        let url = format!("http://127.0.0.1:{}/trailer/{}.mp4", self.local_port, id);
        eprintln!("[stream-proxy] serving local trailer bytes={size} url={url}");
        Ok(url)
    }

    pub async fn register(&self, args: RegisterArgs) -> RegisterResult {
        let id = Uuid::new_v4().to_string();
        if !args.transcode {
            if let Some((base, last_seg, query)) = split_playlist_url(&args.url) {
                let session = Session {
                    url: args.url.clone(),
                    base_url: Some(base),
                    headers: args.headers,
                    transcode: false,
                    profile: args.profile.unwrap_or_default(),
                    burn_sub: None,
                    audio_ordinal: None,
                    prebuffer: None,
                    start_sec: 0.0,
                    dlna: false,
                    duration_sec: None,
                    transcode_slot: crate::transcode::TranscodeSlot::default(),
                    cast: false,
                    last_used: Instant::now(),
                };
                self.sessions.write().await.insert(id.clone(), session);
                let qs = query.map(|q| format!("?{}", q)).unwrap_or_default();
                let url = format!("http://127.0.0.1:{}/p/{}/{}{}", self.port, id, last_seg, qs);
                return RegisterResult {
                    session_id: id,
                    url,
                    seekable_sec: None,
                };
            }
        }
        let prebuffer = if !args.transcode {
            args.prebuffer_bytes
                .filter(|bytes| *bytes > 0)
                .map(|bytes| {
                    start_prebuffer(
                        self.client.clone(),
                        args.url.clone(),
                        args.headers.clone(),
                        bytes,
                    )
                })
        } else {
            None
        };
        let session = Session {
            url: args.url.clone(),
            base_url: None,
            headers: args.headers,
            transcode: args.transcode,
            profile: args.profile.unwrap_or_default(),
            burn_sub: None,
            audio_ordinal: None,
            prebuffer,
            start_sec: 0.0,
            dlna: false,
            duration_sec: None,
            transcode_slot: crate::transcode::TranscodeSlot::default(),
            cast: false,
            last_used: Instant::now(),
        };
        self.sessions.write().await.insert(id.clone(), session);
        let suffix = if args.transcode { ".ts" } else { "" };
        let url = format!("http://127.0.0.1:{}/s/{}{}", self.port, id, suffix);
        RegisterResult {
            session_id: id,
            url,
            seekable_sec: None,
        }
    }

    pub async fn register_cast(&self, args: RegisterArgs) -> RegisterResult {
        let id = Uuid::new_v4().to_string();
        let host = args
            .target_host
            .as_deref()
            .and_then(reachable_ip_for)
            .or_else(lan_ip)
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let burn_sub = args
            .burn_sub_path
            .clone()
            .map(|path| (path, args.burn_sub_style.clone().unwrap_or_default()));
        let seek = args.start_time_sec.unwrap_or(0.0).max(0.0);
        if casts_through_hls(&args) {
            match self
                .hls
                .register_with_seek(
                    args.url.clone(),
                    args.headers.clone(),
                    seek,
                    burn_sub.clone(),
                    args.audio_ordinal,
                )
                .await
            {
                Ok(hid) => {
                    let url = format!("http://{}:{}/cast/hls/{}/master.m3u8", host, self.port, hid);
                    eprintln!(
                        "[harbor::proxy] cast HLS session: {} (seek={:.1}s)",
                        url, seek
                    );
                    return RegisterResult {
                        session_id: hid,
                        url,
                        seekable_sec: None,
                    };
                }
                Err(e) => {
                    eprintln!("[harbor::proxy] HLS register failed ({}); falling back to direct transcode", e);
                }
            }
        }
        let playlist_parts = if args.transcode {
            None
        } else {
            split_playlist_url(&args.url)
        };
        if let Some((base, last_seg, query)) = playlist_parts {
            let session = Session {
                url: args.url.clone(),
                base_url: Some(base),
                headers: args.headers,
                transcode: false,
                profile: args.profile.unwrap_or_default(),
                burn_sub: None,
                audio_ordinal: None,
                prebuffer: None,
                start_sec: 0.0,
                dlna: args.dlna,
                duration_sec: None,
                transcode_slot: crate::transcode::TranscodeSlot::default(),
                cast: true,
                last_used: Instant::now(),
            };
            self.sessions.write().await.insert(id.clone(), session);
            let qs = query.map(|q| format!("?{}", q)).unwrap_or_default();
            let url = format!("http://{}:{}/p/{}/{}{}", host, self.port, id, last_seg, qs);
            return RegisterResult {
                session_id: id,
                url,
                seekable_sec: None,
            };
        }
        let start_sec = if args.transcode { seek } else { 0.0 };
        let duration_sec = if args.transcode && args.dlna {
            crate::cast_hls::probe_duration(&args.url, &args.headers)
                .await
                .filter(|d| *d > start_sec)
        } else {
            None
        };
        let session = Session {
            url: args.url.clone(),
            base_url: None,
            headers: args.headers,
            transcode: args.transcode,
            profile: args.profile.unwrap_or_default(),
            burn_sub,
            audio_ordinal: args.audio_ordinal,
            prebuffer: None,
            start_sec,
            dlna: args.dlna,
            duration_sec,
            transcode_slot: crate::transcode::TranscodeSlot::default(),
            cast: true,
            last_used: Instant::now(),
        };
        self.sessions.write().await.insert(id.clone(), session);
        let suffix = if args.transcode { ".ts" } else { "" };
        let url = format!("http://{}:{}/s/{}{}", host, self.port, id, suffix);
        RegisterResult {
            session_id: id,
            url,
            seekable_sec: duration_sec.map(|d| d - start_sec),
        }
    }

    /// The session a request asks for, marked as used so cleanup leaves it alone.
    async fn touch_session(&self, id: &str) -> Option<Session> {
        let mut map = self.sessions.write().await;
        let session = map.get_mut(id)?;
        session.last_used = Instant::now();
        Some(session.clone())
    }

    pub async fn unregister(&self, session_id: &str) {
        self.sessions.write().await.remove(session_id);
    }

    pub(crate) async fn register_audio_cast(
        &self,
        input: AudioCastInput,
    ) -> Result<RegisterResult, String> {
        let host = reachable_ip_for(&input.target_host)
            .or_else(lan_ip)
            .ok_or("No network route to the speaker")?;
        if self.port == 0 {
            return Err("Speaker audio server is not ready".into());
        }
        let session_id = self.audio.register(input).await?;
        let url = format!("http://{host}:{}/cast/audio/{session_id}", self.port);
        Ok(RegisterResult {
            session_id,
            url,
            seekable_sec: None,
        })
    }

    pub(crate) async fn audio_cast_input(&self, id: &str) -> Option<AudioCastInput> {
        self.audio.input(id).await
    }

    pub async fn stop_hls_session(&self, session_id: &str) -> bool {
        if session_id.starts_with("audio-") {
            return self.audio.stop(session_id).await;
        }
        self.hls.stop_session(session_id).await
    }

    pub async fn stop_all_hls(&self) -> usize {
        self.audio.stop_all().await;
        self.hls.stop_all().await
    }

    pub async fn gc_idle(&self) -> usize {
        const PROXY_MAX_AGE: Duration = Duration::from_secs(3 * 60 * 60);
        const HLS_IDLE: Duration = Duration::from_secs(5 * 60);
        let now = Instant::now();
        let mut removed = {
            let mut map = self.sessions.write().await;
            let stale: Vec<String> = map
                .iter()
                .filter(|(_, s)| {
                    now.duration_since(s.last_used) > PROXY_MAX_AGE
                        && !s.transcode_slot.is_running()
                })
                .map(|(k, _)| k.clone())
                .collect();
            for k in &stale {
                map.remove(k);
            }
            stale.len()
        };
        #[cfg(target_os = "linux")]
        {
            let mut map = self.local_files.write().await;
            let before = map.len();
            map.retain(|_, file| now.duration_since(file.created_at) <= PROXY_MAX_AGE);
            removed += before - map.len();
        }
        removed += self.hls.evict_idle(HLS_IDLE).await;
        removed += self.audio.gc().await;
        removed
    }
}

pub(crate) fn shutdown(app: &tauri::AppHandle) {
    use tauri::Manager;

    let state = app.state::<ProxyState>().inner().clone();
    crate::block_on_bounded(
        "stream proxy",
        std::time::Duration::from_secs(4),
        async move {
            state.stop_all_hls().await;
        },
    );
}

pub(crate) fn lan_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    let ip = addr.ip();
    if ip.is_unspecified() || ip.is_loopback() {
        return None;
    }
    Some(ip.to_string())
}

/// Find the local interface IP that the OS would use to reach `target_host`.
/// Used so the URL we hand a cast device is on the same subnet as the device,
/// not the Tailscale/VPN interface that `lan_ip()` might pick up.
pub(crate) fn reachable_ip_for(target_host: &str) -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    // Cast passes the renderer as "ip:port"; read as a host name it fails to resolve and the VPN address wins.
    match target_host.parse::<std::net::SocketAddr>() {
        Ok(addr) => socket.connect(addr).ok()?,
        Err(_) => socket.connect((target_host, 1u16)).ok()?,
    }
    let addr = socket.local_addr().ok()?;
    let ip = addr.ip();
    if ip.is_unspecified() || ip.is_loopback() {
        return None;
    }
    Some(ip.to_string())
}

async fn handle_health() -> &'static str {
    "ok"
}

#[cfg(target_os = "linux")]
async fn handle_local_file(
    State(state): State<ProxyState>,
    Path(id_with_ext): Path<String>,
    method: Method,
    headers: HeaderMap,
) -> Response {
    let id = id_with_ext.trim_end_matches(".mp4");
    let path = {
        let files = state.local_files.read().await;
        match files.get(id) {
            Some(file) => file.path.clone(),
            None => return (StatusCode::NOT_FOUND, "trailer not found").into_response(),
        }
    };
    let mut file = match tokio::fs::File::open(&path).await {
        Ok(file) => file,
        Err(_) => return (StatusCode::NOT_FOUND, "trailer file missing").into_response(),
    };
    let len = match file.metadata().await {
        Ok(metadata) => metadata.len(),
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("trailer metadata: {error}"),
            )
                .into_response();
        }
    };
    let requested_range = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok());
    let (status, start, end) = match requested_range {
        Some(raw) => match parse_file_range(raw, len) {
            Some((start, end)) => (StatusCode::PARTIAL_CONTENT, start, end),
            None => {
                let mut response =
                    (StatusCode::RANGE_NOT_SATISFIABLE, Body::empty()).into_response();
                response.headers_mut().insert(
                    header::CONTENT_RANGE,
                    HeaderValue::from_str(&format!("bytes */{len}")).unwrap(),
                );
                return response;
            }
        },
        None => (StatusCode::OK, 0, len),
    };
    if start > 0 && file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "trailer seek failed").into_response();
    }
    let content_len = end - start;
    let mut response_headers = HeaderMap::new();
    response_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    response_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("video/mp4"));
    response_headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&content_len.to_string()).unwrap(),
    );
    response_headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    response_headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Content-Length, Content-Range, Accept-Ranges"),
    );
    if status == StatusCode::PARTIAL_CONTENT {
        response_headers.insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {}-{}/{len}", start, end - 1)).unwrap(),
        );
    }
    if method == Method::HEAD {
        return (status, response_headers, Body::empty()).into_response();
    }
    let stream = tokio_util::io::ReaderStream::with_capacity(file.take(content_len), 64 * 1024);
    (status, response_headers, Body::from_stream(stream)).into_response()
}

#[cfg(any(target_os = "linux", test))]
fn parse_file_range(raw: &str, len: u64) -> Option<(u64, u64)> {
    if len == 0 {
        return None;
    }
    let spec = raw.trim().strip_prefix("bytes=")?;
    if spec.contains(',') {
        return None;
    }
    let (start, end) = spec.split_once('-')?;
    if start.trim().is_empty() {
        let suffix = end.trim().parse::<u64>().ok()?.min(len);
        if suffix == 0 {
            return None;
        }
        return Some((len - suffix, len));
    }
    let start = start.trim().parse::<u64>().ok()?;
    if start >= len {
        return None;
    }
    let end = if end.trim().is_empty() {
        len
    } else {
        end.trim().parse::<u64>().ok()?.saturating_add(1).min(len)
    };
    (end > start).then_some((start, end))
}

fn split_playlist_url(url: &str) -> Option<(String, String, Option<String>)> {
    let (path_part, query) = match url.split_once('?') {
        Some((p, q)) => (p, Some(q.to_string())),
        None => (url, None),
    };
    let scheme_end = path_part.find("://")? + 3;
    let host_end = scheme_end + path_part[scheme_end..].find('/')?;
    let last_slash = path_part[host_end..].rfind('/').map(|i| i + host_end)?;
    let last_seg = &path_part[last_slash + 1..];
    if !last_seg.to_lowercase().ends_with(".m3u8") {
        return None;
    }
    let base = path_part[..last_slash].to_string();
    Some((base, last_seg.to_string(), query))
}

/** A manifest is a few kB, and only a text answer is ever buffered. */
const MANIFEST_PROBE_MAX: usize = 4 * 1024 * 1024;

/** Where a url's references are relative to, and the segment it names. Unlike [split_playlist_url]
 * this asks nothing of that segment: it is only used on an answer already known to be a manifest. */
fn playlist_parts(url: &str) -> Option<(String, String, Option<String>)> {
    let (path_part, query) = match url.split_once('?') {
        Some((p, q)) => (p, Some(q.to_string())),
        None => (url, None),
    };
    let scheme_end = path_part.find("://")? + 3;
    let host_end = scheme_end + path_part[scheme_end..].find('/')?;
    let last_slash = path_part[host_end..].rfind('/').map(|i| i + host_end)?;
    let last_seg = &path_part[last_slash + 1..];
    if last_seg.is_empty() {
        return None;
    }
    Some((
        path_part[..last_slash].to_string(),
        last_seg.to_string(),
        query,
    ))
}

/** True when a request names the manifest itself rather than something it refers to.
 *
 * A manifest whose url does not end in `.m3u8` is still served through the playlist route, and a
 * playlist is only read as HLS when its url or its content type says so. Everything else the
 * manifest names is left alone: segments are not manifests. */
fn names_the_manifest(session_url: &str, rest: &str) -> bool {
    playlist_parts(session_url)
        .map(|(_, last, _)| last == rest)
        .unwrap_or(false)
}

/** Serves a manifest from the playlist route when its url did not say it was one.
 *
 * Such a session was registered as a plain stream, and served as it stands its references resolve
 * against this proxy rather than the upstream, so playback stops at the first entry. */
async fn manifest_route(
    state: &ProxyState,
    session: &Session,
    id: &str,
    response: Response,
) -> Response {
    let Some((base, last, query)) = playlist_parts(&session.url) else {
        return response;
    };
    let qs = query.map(|q| format!("?{}", q)).unwrap_or_default();
    let route = || Redirect::temporary(&format!("/p/{}/{}{}", id, last, qs)).into_response();

    // Known to be a manifest already, so send it on rather than hand back the raw body.
    if session.base_url.is_some() {
        return route();
    }
    if response.status() != StatusCode::OK {
        return response;
    }
    let kind = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    let declared = kind.contains("mpegurl");
    if !declared && !kind.starts_with("text/plain") {
        return response;
    }

    let (mut parts, body) = response.into_parts();
    let stated = parts
        .headers
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok());
    if stated.map(|n| n > MANIFEST_PROBE_MAX).unwrap_or(false) {
        return Response::from_parts(parts, body);
    }
    let bytes = match to_bytes(body, MANIFEST_PROBE_MAX).await {
        Ok(bytes) => bytes,
        Err(_) => return (StatusCode::BAD_GATEWAY, "answer could not be read").into_response(),
    };
    // A manifest and an ordinary text answer both arrive as `text/plain`; the first line tells.
    if !declared {
        let head = String::from_utf8_lossy(&bytes[..bytes.len().min(1024)]);
        if !head.trim_start().starts_with("#EXTM3U") {
            // The read bytes are the body, so the stated length is replaced: it came from an
            // upstream that may have been compressed, and this is the decoded length.
            if let Ok(len) = HeaderValue::from_str(&bytes.len().to_string()) {
                parts.headers.insert("content-length", len);
            }
            return Response::from_parts(parts, Body::from(bytes));
        }
    }

    // Give the session the base its references are relative to, then send the client there.
    if let Some(held) = state.sessions.write().await.get_mut(id) {
        held.base_url = Some(base);
    }
    route()
}

fn guess_ct_from_url(url: &str) -> &'static str {
    let lower = url.split('?').next().unwrap_or(url).to_lowercase();
    if lower.ends_with(".mp4") || lower.ends_with(".m4v") {
        return "video/mp4";
    }
    if lower.ends_with(".mkv") {
        return "video/x-matroska";
    }
    if lower.ends_with(".webm") {
        return "video/webm";
    }
    if lower.ends_with(".m3u8") {
        return "application/vnd.apple.mpegurl";
    }
    if lower.ends_with(".mpd") {
        return "application/dash+xml";
    }
    if lower.ends_with(".ts") {
        return "video/mp2t";
    }
    "video/mp4"
}

/// The title time a renderer's `TimeSeekRange.dlna.org` asks for, kept inside a time-seekable session's title.
fn time_seek_start(headers: &HeaderMap, session: &Session) -> Option<f64> {
    let duration = session.duration_sec?;
    let asked = headers
        .get("timeseekrange.dlna.org")
        .and_then(|v| v.to_str().ok())
        .and_then(crate::transcode::requested_npt_start)?;
    // A renderer seeks on its own clock, which counts from 0 where the session's stream starts.
    let at = session.start_sec + asked;
    (at < duration).then_some(at)
}

/// DLNA renderers take one progressive stream; HLS is for Chromecast, Roku and AirPlay.
fn casts_through_hls(args: &RegisterArgs) -> bool {
    args.transcode && !args.dlna
}

/// MPEG-TS is video/mpeg to DLNA renderers; a 2014 Samsung answers video/mp2t with "Illegal MIME-type".
fn relabel_ts_for_dlna(headers: &mut HeaderMap) {
    let is_ts = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|ct| {
            let ct = ct
                .split(';')
                .next()
                .unwrap_or("")
                .trim()
                .to_ascii_lowercase();
            ct == "video/mp2t" || ct == "video/mp2ts" || ct == "video/vnd.dlna.mpeg-tts"
        })
        .unwrap_or(false);
    if is_ts {
        headers.insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static(crate::transcode::DLNA_TS_CONTENT_TYPE),
        );
    }
}

const PREBUFFER_MIN_BYTES: usize = 256 * 1024;
const PREBUFFER_MAX_BYTES: usize = 2 * 1024 * 1024;
const PREBUFFER_TIMEOUT: Duration = Duration::from_millis(2500);

fn start_prebuffer(
    client: reqwest::Client,
    url: String,
    headers: HashMap<String, String>,
    requested_bytes: usize,
) -> watch::Receiver<PrebufferState> {
    let (tx, rx) = watch::channel(PrebufferState::Loading);
    let byte_limit = requested_bytes.clamp(PREBUFFER_MIN_BYTES, PREBUFFER_MAX_BYTES);
    tokio::spawn(async move {
        let state = match fetch_prebuffer_prefix(client, &url, &headers, byte_limit).await {
            Ok(prefix) => {
                eprintln!(
                    "[harbor::proxy] playback prefix ready bytes={} total={}",
                    prefix.bytes.len(),
                    prefix.total_size
                );
                PrebufferState::Ready(Arc::new(prefix))
            }
            Err(reason) => {
                eprintln!("[harbor::proxy] playback prefix unavailable reason={reason}");
                PrebufferState::Failed
            }
        };
        tx.send_replace(state);
    });
    rx
}

async fn fetch_prebuffer_prefix(
    client: reqwest::Client,
    url: &str,
    headers: &HashMap<String, String>,
    byte_limit: usize,
) -> Result<PreparedPrefix, &'static str> {
    let mut req = client
        .get(url)
        .timeout(PREBUFFER_TIMEOUT)
        .header("range", format!("bytes=0-{}", byte_limit - 1));
    for (key, value) in headers {
        if key.eq_ignore_ascii_case("accept-encoding") || key.eq_ignore_ascii_case("range") {
            continue;
        }
        req = req.header(key, value);
    }
    let upstream = crate::http_redirect::send_get(&client, req, url).await?;
    let status = upstream.status();
    if status != StatusCode::PARTIAL_CONTENT {
        return Err("range");
    }
    let total_size = upstream
        .headers()
        .get("content-range")
        .and_then(|value| value.to_str().ok())
        .and_then(content_range_total)
        .ok_or("size")?;
    if total_size == 0 {
        return Err("empty");
    }

    let mut response_headers = HeaderMap::new();
    for name in ["content-type", "etag", "last-modified", "cache-control"] {
        if let Some(value) = upstream.headers().get(name) {
            if let (Ok(name), Ok(value)) = (
                HeaderName::try_from(name),
                HeaderValue::from_bytes(value.as_bytes()),
            ) {
                response_headers.insert(name, value);
            }
        }
    }

    let total_capacity = usize::try_from(total_size).unwrap_or(usize::MAX);
    let mut bytes = Vec::with_capacity(byte_limit.min(total_capacity));
    let mut stream = upstream.bytes_stream();
    while bytes.len() < byte_limit {
        let Some(chunk) = stream.next().await else {
            break;
        };
        let chunk = chunk.map_err(|_| "body")?;
        let remaining = byte_limit - bytes.len();
        bytes.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
    }
    if bytes.is_empty() {
        return Err("empty");
    }
    Ok(PreparedPrefix {
        bytes,
        total_size,
        response_headers,
    })
}

fn content_range_total(value: &str) -> Option<u64> {
    let range = value.trim().strip_prefix("bytes ")?;
    let (bounds, total) = range.split_once('/')?;
    let (start, _) = bounds.split_once('-')?;
    if start != "0" {
        return None;
    }
    total.parse::<u64>().ok()
}

fn requested_prefix_len(headers: &HeaderMap, available: usize, total_size: u64) -> Option<usize> {
    let value = headers.get("range")?.to_str().ok()?.trim();
    let value = value.strip_prefix("bytes=")?;
    if value.contains(',') {
        return None;
    }
    let (start, end) = value.split_once('-')?;
    if start != "0" {
        return None;
    }
    let requested = if end.is_empty() {
        available
    } else {
        end.parse::<usize>().ok()?.saturating_add(1)
    };
    let representation_len = usize::try_from(total_size).unwrap_or(usize::MAX);
    let requested = requested.min(representation_len);
    (requested > 0 && requested <= available).then_some(requested)
}

fn prepared_prefix_response(session: &Session, headers: &HeaderMap) -> Option<Response> {
    let receiver = session.prebuffer.as_ref()?;
    // Prebuffering is an opportunistic fast path. The real player request must
    // never wait for it: if the prefix is not already complete, immediately
    // forward upstream below and let mpv own startup.
    let prepared = match receiver.borrow().clone() {
        PrebufferState::Ready(prefix) => prefix,
        PrebufferState::Loading | PrebufferState::Failed => return None,
    };
    let len = requested_prefix_len(headers, prepared.bytes.len(), prepared.total_size)?;
    let mut response_headers = prepared.response_headers.clone();
    response_headers.insert(
        HeaderName::from_static("content-length"),
        HeaderValue::from_str(&len.to_string()).ok()?,
    );
    response_headers.insert(
        HeaderName::from_static("content-range"),
        HeaderValue::from_str(&format!("bytes 0-{}/{}", len - 1, prepared.total_size)).ok()?,
    );
    response_headers.insert(
        HeaderName::from_static("accept-ranges"),
        HeaderValue::from_static("bytes"),
    );
    response_headers.insert(
        HeaderName::from_static("access-control-allow-origin"),
        HeaderValue::from_static("*"),
    );
    response_headers.insert(
        HeaderName::from_static("access-control-expose-headers"),
        HeaderValue::from_static("Content-Length, Content-Range"),
    );
    let mut response = Response::builder().status(StatusCode::PARTIAL_CONTENT);
    if let Some(out_headers) = response.headers_mut() {
        out_headers.extend(response_headers);
    }
    response
        .body(Body::from(prepared.bytes[..len].to_vec()))
        .ok()
}

/// A receiver given several audio tracks plays whichever it likes, so a cast transcode keeps the first when the player named none.
fn transcode_audio_ordinal(session: &Session) -> Option<u32> {
    if session.cast {
        Some(session.audio_ordinal.unwrap_or(0))
    } else {
        session.audio_ordinal
    }
}

async fn handle_stream(
    State(state): State<ProxyState>,
    Path(id_with_ext): Path<String>,
    method: axum::http::Method,
    headers: HeaderMap,
) -> Response {
    let id = id_with_ext.trim_end_matches(".ts").to_string();
    let ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("(no-ua)");
    let range = headers
        .get("range")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("(no-range)");
    eprintln!("[harbor::proxy] req id={id} ua={ua} range={range}");
    let Some(session) = state.touch_session(&id).await else {
        return (StatusCode::NOT_FOUND, "session not found").into_response();
    };

    if session.transcode {
        let ts_type = crate::transcode::ts_content_type(session.dlna);
        let seek = time_seek_start(&headers, &session);
        // DLNA renderers send HEAD before GET; answering it must not spawn a second transcode.
        let mut response = if method == axum::http::Method::HEAD {
            crate::transcode::transcode_response(
                crate::transcode::unknown_length_body(),
                ts_type,
                session.duration_sec,
            )
        } else {
            let (start, sub_offset) = match seek {
                Some(at) => (at, at - session.start_sec),
                None => (session.start_sec, 0.0),
            };
            handle_transcode(
                &session.url,
                &session.headers,
                &session.profile,
                session.burn_sub.as_ref(),
                transcode_audio_ordinal(&session),
                start,
                sub_offset,
                ts_type,
                session.duration_sec,
                Some(&session.transcode_slot),
            )
            .await
        };
        if let (Some(at), Some(duration)) = (seek, session.duration_sec) {
            if response.status().is_success() {
                // The renderer's clock counts from the session's start, so the range does too.
                let range = crate::transcode::npt_range(
                    at - session.start_sec,
                    duration - session.start_sec,
                );
                if let Ok(value) = HeaderValue::from_str(&range) {
                    response
                        .headers_mut()
                        .insert("TimeSeekRange.dlna.org", value);
                }
            }
        }
        return response;
    }

    if let Some(response) = prepared_prefix_response(&session, &headers) {
        eprintln!("[harbor::proxy] served playback prefix id={id}");
        return response;
    }

    let response = forward_upstream(&state, &session, &session.url, &headers, false).await;
    manifest_route(&state, &session, &id, response).await
}

async fn handle_playlist(
    State(state): State<ProxyState>,
    Path((id, rest)): Path<(String, String)>,
    headers: HeaderMap,
    uri: axum::http::Uri,
) -> Response {
    let ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("(no-ua)");
    let range = headers
        .get("range")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("(no-range)");
    eprintln!("[harbor::proxy] playlist req id={id} path={rest} ua={ua} range={range}");
    let Some(session) = state.touch_session(&id).await else {
        return (StatusCode::NOT_FOUND, "session not found").into_response();
    };
    let base = match session.base_url.as_deref() {
        Some(b) => b,
        None => return (StatusCode::NOT_FOUND, "not a playlist session").into_response(),
    };
    let qs = uri.query().map(|q| format!("?{}", q)).unwrap_or_default();
    let upstream_url = format!("{}/{}{}", base, rest, qs);
    let is_manifest = names_the_manifest(&session.url, &rest);
    forward_upstream(&state, &session, &upstream_url, &headers, is_manifest).await
}

async fn forward_upstream(
    state: &ProxyState,
    session: &Session,
    upstream_url: &str,
    headers: &HeaderMap,
    is_manifest: bool,
) -> Response {
    let mut req = state.client.get(upstream_url);
    let session_keys: std::collections::HashSet<String> =
        session.headers.keys().map(|k| k.to_lowercase()).collect();
    // NOTE: do NOT forward `accept-encoding` — reqwest manages compression
    // itself and rejects manual setting of this header (the noisy warning we
    // were seeing). The client gets the upstream encoding handled.
    for forward in [
        "range",
        "accept",
        "user-agent",
        "referer",
        "origin",
        "if-range",
        "if-none-match",
        "if-modified-since",
    ] {
        if session_keys.contains(forward) {
            continue;
        }
        if let Some(val) = headers.get(forward) {
            req = req.header(forward, val);
        }
    }
    for (k, v) in &session.headers {
        if k.to_lowercase() == "accept-encoding" {
            continue;
        }
        req = req.header(k, v);
    }

    let upstream = match crate::http_redirect::send_get(&state.client, req, &session.url).await {
        Ok(r) => r,
        Err(e) => {
            return (StatusCode::BAD_GATEWAY, format!("upstream error: {}", e)).into_response();
        }
    };

    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let upstream_ct = upstream
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("(none)")
        .to_string();
    let upstream_cr = upstream
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("(none)")
        .to_string();
    let upstream_cl = upstream
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("(none)")
        .to_string();
    eprintln!(
        "[harbor::proxy] upstream status={} ct={} content-range={} content-length={}",
        status, upstream_ct, upstream_cr, upstream_cl
    );
    let mut response_headers = HeaderMap::new();
    for forward in [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
        "cache-control",
    ] {
        if let Some(val) = upstream.headers().get(forward) {
            if let (Ok(name), Ok(value)) = (
                HeaderName::try_from(forward),
                HeaderValue::from_bytes(val.as_bytes()),
            ) {
                response_headers.insert(name, value);
            }
        }
    }
    // Cast receivers reject `application/octet-stream` for video — force-set
    // a reasonable video MIME if the upstream is unhelpful. The URL extension
    // is the best hint we have.
    let needs_ct_override = response_headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.starts_with("application/octet-stream") || ct.starts_with("binary/"))
        .unwrap_or(true);
    if needs_ct_override {
        let ct = guess_ct_from_url(upstream_url);
        if let Ok(value) = HeaderValue::from_str(ct) {
            response_headers.insert(HeaderName::from_static("content-type"), value);
            eprintln!("[harbor::proxy] forced content-type={ct} (upstream was {upstream_ct})");
        }
    }
    if session.dlna {
        relabel_ts_for_dlna(&mut response_headers);
    }
    if response_headers.get("accept-ranges").is_none() {
        response_headers.insert(
            HeaderName::from_static("accept-ranges"),
            HeaderValue::from_static("bytes"),
        );
    }
    response_headers.insert(
        HeaderName::from_static("access-control-allow-origin"),
        HeaderValue::from_static("*"),
    );
    response_headers.insert(
        HeaderName::from_static("access-control-allow-headers"),
        HeaderValue::from_static("Content-Type, Accept-Encoding, Range"),
    );
    response_headers.insert(
        HeaderName::from_static("access-control-expose-headers"),
        HeaderValue::from_static("Content-Length, Content-Range"),
    );

    let body_ct = response_headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    let is_m3u8 = is_manifest
        || body_ct.contains("mpegurl")
        || upstream_url
            .split('?')
            .next()
            .unwrap_or("")
            .to_lowercase()
            .ends_with(".m3u8");

    if is_m3u8 {
        response_headers.insert(
            HeaderName::from_static("cache-control"),
            HeaderValue::from_static("no-cache"),
        );
        response_headers.insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static("application/x-mpegURL"),
        );
        let original = match upstream.bytes().await {
            Ok(b) => b,
            Err(e) => {
                return (StatusCode::BAD_GATEWAY, format!("body read: {}", e)).into_response();
            }
        };
        let rewritten = inject_hls_codecs(std::str::from_utf8(&original).unwrap_or(""));
        let bytes = rewritten.into_bytes();
        response_headers.remove("content-length");
        response_headers.insert(
            HeaderName::from_static("content-length"),
            HeaderValue::from_str(&bytes.len().to_string()).unwrap(),
        );
        let mut resp = Response::builder().status(status);
        if let Some(h) = resp.headers_mut() {
            h.extend(response_headers);
        }
        return resp.body(Body::from(bytes)).unwrap_or_else(|_| {
            (StatusCode::INTERNAL_SERVER_ERROR, "response build failed").into_response()
        });
    }

    let stream = upstream.bytes_stream();
    let body = Body::from_stream(stream);
    let mut resp = Response::builder().status(status);
    if let Some(h) = resp.headers_mut() {
        h.extend(response_headers);
    }
    resp.body(body).unwrap_or_else(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "response build failed").into_response()
    })
}

fn inject_hls_codecs(body: &str) -> String {
    const CODECS: &str = "avc1.640029,mp4a.40.2";
    let mut out = String::with_capacity(body.len() + 64);
    for line in body.split_inclusive('\n') {
        if line.starts_with("#EXT-X-STREAM-INF:") && !line.contains("CODECS=") {
            let (tag, rest) = line.split_at("#EXT-X-STREAM-INF:".len());
            out.push_str(tag);
            out.push_str("CODECS=\"");
            out.push_str(CODECS);
            out.push_str("\",");
            out.push_str(rest);
        } else {
            out.push_str(line);
        }
    }
    out
}

#[tauri::command]
pub async fn proxy_register(
    args: RegisterArgs,
    state: tauri::State<'_, ProxyState>,
) -> Result<RegisterResult, String> {
    Ok(state.register(args).await)
}

#[tauri::command]
pub async fn proxy_unregister(
    session_id: String,
    state: tauri::State<'_, ProxyState>,
) -> Result<(), String> {
    state.unregister(&session_id).await;
    Ok(())
}

#[tauri::command]
pub async fn proxy_gc_idle(state: tauri::State<'_, ProxyState>) -> Result<usize, String> {
    Ok(state.gc_idle().await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_media_byte_ranges() {
        assert_eq!(parse_file_range("bytes=0-", 100), Some((0, 100)));
        assert_eq!(parse_file_range("bytes=10-19", 100), Some((10, 20)));
        assert_eq!(parse_file_range("bytes=-10", 100), Some((90, 100)));
        assert_eq!(parse_file_range("bytes=99-200", 100), Some((99, 100)));
    }

    #[test]
    fn rejects_invalid_media_byte_ranges() {
        assert_eq!(parse_file_range("bytes=100-", 100), None);
        assert_eq!(parse_file_range("bytes=20-10", 100), None);
        assert_eq!(parse_file_range("bytes=0-1,4-5", 100), None);
        assert_eq!(parse_file_range("items=0-1", 100), None);
    }

    #[test]
    fn parses_only_zero_based_content_ranges() {
        assert_eq!(content_range_total("bytes 0-1023/4096"), Some(4096));
        assert_eq!(content_range_total("bytes 1-1023/4096"), None);
        assert_eq!(content_range_total("bytes */4096"), None);
    }

    #[test]
    fn serves_only_ranges_fully_covered_by_the_prefix() {
        let mut headers = HeaderMap::new();
        headers.insert("range", HeaderValue::from_static("bytes=0-1"));
        assert_eq!(requested_prefix_len(&headers, 1024, 4096), Some(2));
        headers.insert("range", HeaderValue::from_static("bytes=0-2047"));
        assert_eq!(requested_prefix_len(&headers, 1024, 4096), None);
        headers.insert("range", HeaderValue::from_static("bytes=20-40"));
        assert_eq!(requested_prefix_len(&headers, 1024, 4096), None);
    }

    #[test]
    fn only_a_cast_transcode_falls_back_to_the_first_audio_track() {
        let session = |cast, audio_ordinal| Session {
            url: "https://example.test/movie.mkv".into(),
            base_url: None,
            headers: HashMap::new(),
            transcode: true,
            profile: TranscodeProfile::default(),
            burn_sub: None,
            audio_ordinal,
            prebuffer: None,
            start_sec: 0.0,
            dlna: false,
            duration_sec: None,
            transcode_slot: crate::transcode::TranscodeSlot::default(),
            cast,
            last_used: Instant::now(),
        };
        assert_eq!(transcode_audio_ordinal(&session(true, None)), Some(0));
        assert_eq!(transcode_audio_ordinal(&session(true, Some(2))), Some(2));
        assert_eq!(
            transcode_audio_ordinal(&session(false, None)),
            None,
            "the player keeps every track"
        );
    }

    #[tokio::test]
    async fn a_chromecast_falling_back_from_hls_still_casts_one_audio_track() {
        let state = ProxyState::placeholder();
        let result = state
            .register_cast(RegisterArgs {
                url: "https://example.test/movie.mkv".into(),
                headers: HashMap::new(),
                transcode: true,
                prebuffer_bytes: None,
                profile: None,
                target_host: Some("127.0.0.1".into()),
                start_time_sec: None,
                burn_sub_path: None,
                burn_sub_style: None,
                audio_ordinal: None,
                dlna: false,
            })
            .await;
        assert!(result.url.ends_with(".ts"), "{}", result.url);
        let session = state.sessions.read().await[&result.session_id].clone();
        assert_eq!(transcode_audio_ordinal(&session), Some(0));
    }

    #[tokio::test]
    async fn cleanup_keeps_a_session_that_is_still_fetched_or_streaming() {
        let state = ProxyState::placeholder();
        let long_ago = Instant::now() - Duration::from_secs(4 * 60 * 60);
        let session = |last_used| Session {
            url: "https://example.test/movie.mkv".into(),
            base_url: None,
            headers: HashMap::new(),
            transcode: true,
            profile: TranscodeProfile::default(),
            burn_sub: None,
            audio_ordinal: None,
            prebuffer: None,
            start_sec: 0.0,
            dlna: true,
            duration_sec: None,
            transcode_slot: crate::transcode::TranscodeSlot::default(),
            cast: true,
            last_used,
        };
        let streaming = session(long_ago);
        let _ffmpeg = streaming.transcode_slot.take_turn_for_test();
        {
            let mut map = state.sessions.write().await;
            map.insert("idle".into(), session(long_ago));
            map.insert("recent".into(), session(Instant::now()));
            map.insert("streaming".into(), streaming);
        }
        state.gc_idle().await;
        let map = state.sessions.read().await;
        assert!(!map.contains_key("idle"), "an abandoned session is dropped");
        assert!(map.contains_key("recent"), "a session fetched lately stays");
        assert!(
            map.contains_key("streaming"),
            "a running transcode keeps its session"
        );

        drop(map);
        state
            .sessions
            .write()
            .await
            .insert("fetched".into(), session(long_ago));
        assert!(state.touch_session("fetched").await.is_some());
        state.gc_idle().await;
        assert!(
            state.sessions.read().await.contains_key("fetched"),
            "a request marks the session as used"
        );
    }

    #[test]
    fn a_remote_seek_lands_on_the_title_time_and_never_past_the_end() {
        let session = |duration_sec| Session {
            url: "https://example.test/movie.mkv".into(),
            base_url: None,
            headers: HashMap::new(),
            transcode: true,
            profile: TranscodeProfile::default(),
            burn_sub: None,
            audio_ordinal: None,
            prebuffer: None,
            start_sec: 600.0,
            dlna: true,
            duration_sec,
            transcode_slot: crate::transcode::TranscodeSlot::default(),
            cast: false,
            last_used: Instant::now(),
        };
        let asking = |value: &str| {
            let mut headers = HeaderMap::new();
            headers.insert(
                "TimeSeekRange.dlna.org",
                HeaderValue::from_str(value).unwrap(),
            );
            headers
        };
        let seekable = session(Some(5400.0));
        assert_eq!(time_seek_start(&asking("npt=120-"), &seekable), Some(720.0));
        assert_eq!(
            time_seek_start(&asking("npt=0:10:00.000-"), &seekable),
            Some(1200.0)
        );
        assert_eq!(
            time_seek_start(&asking("npt=4800-"), &seekable),
            None,
            "past the end"
        );
        assert_eq!(time_seek_start(&HeaderMap::new(), &seekable), None);
        assert_eq!(time_seek_start(&asking("npt=120-"), &session(None)), None);
    }

    #[tokio::test]
    async fn a_dlna_transcode_is_time_seekable_only_with_a_known_length() {
        let state = ProxyState::placeholder();
        let args = RegisterArgs {
            url: "not-a-real-source".into(),
            headers: HashMap::new(),
            transcode: true,
            prebuffer_bytes: None,
            profile: None,
            target_host: Some("127.0.0.1".into()),
            start_time_sec: Some(10.0),
            burn_sub_path: None,
            burn_sub_style: None,
            audio_ordinal: None,
            dlna: true,
        };
        let result = state.register_cast(args).await;
        assert_eq!(
            result.seekable_sec, None,
            "an unprobeable source stays a plain live stream"
        );
        assert_eq!(
            state.sessions.read().await[&result.session_id].duration_sec,
            None
        );
    }

    #[tokio::test]
    async fn a_tv_remote_seek_restarts_the_transcode_at_the_asked_time() {
        let Ok(path) = std::env::var("HARBOR_TEST_CAST_CLIP") else {
            eprintln!("HARBOR_TEST_CAST_CLIP unset; skipping the ffmpeg time-seek check");
            return;
        };
        // Sources arrive over HTTP, and the transcode's -reconnect options reject a plain file input.
        let bytes = std::fs::read(&path).expect("clip");
        let source = Router::new().route(
            "/clip.mkv",
            get(move || {
                let bytes = bytes.clone();
                async move { bytes }
            }),
        );
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let clip = format!("http://{}/clip.mkv", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, source).await.unwrap() });
        let state = ProxyState::start().await.expect("proxy");
        let result = state
            .register_cast(RegisterArgs {
                url: clip,
                headers: HashMap::new(),
                transcode: true,
                prebuffer_bytes: None,
                profile: None,
                target_host: Some("127.0.0.1".into()),
                start_time_sec: Some(30.0),
                burn_sub_path: None,
                burn_sub_style: None,
                audio_ordinal: None,
                dlna: true,
            })
            .await;
        let left = result.seekable_sec.expect("a probed clip is time-seekable");
        assert!((left - 90.0).abs() < 1.0, "{left}");
        let url = format!("http://127.0.0.1:{}/s/{}.ts", state.port, result.session_id);
        let client = reqwest::Client::new();
        let head = client.head(&url).send().await.unwrap();
        assert!(head.headers()["contentfeatures.dlna.org"]
            .to_str()
            .unwrap()
            .contains("OP=10;"));
        let get = client
            .get(&url)
            .header("TimeSeekRange.dlna.org", "npt=60-")
            .send()
            .await
            .unwrap();
        assert_eq!(get.status(), 200);
        let range = get.headers()["timeseekrange.dlna.org"]
            .to_str()
            .unwrap()
            .to_string();
        assert!(range.starts_with("npt=60.000-90.0"), "{range}");
        let body = get.bytes().await.unwrap();
        assert_eq!(body[0], 0x47, "MPEG-TS sync byte");
        // Seeking to title second 90 of a 120 s clip leaves 30 s; serving from the session start would leave 90 s.
        let span = pts_span_sec(&body).expect("PES timestamps in the stream");
        assert!(
            (25.0..40.0).contains(&span),
            "the stream lasts {span}s, not the 30 s left after the seek"
        );
        server.abort();
    }

    /// Seconds between the first and last PES presentation timestamps in an MPEG-TS buffer.
    fn pts_span_sec(ts: &[u8]) -> Option<f64> {
        let mut first: Option<u64> = None;
        let mut last = 0u64;
        for packet in ts.chunks_exact(188) {
            if packet[0] != 0x47 || packet[1] & 0x40 == 0 {
                continue;
            }
            let mut i = 4;
            if packet[3] & 0x20 != 0 {
                i += 1 + packet[4] as usize;
            }
            let Some(pes) = packet.get(i..) else { continue };
            if pes.len() < 14 || pes[..3] != [0, 0, 1] || pes[7] & 0x80 == 0 {
                continue;
            }
            let p = &pes[9..14];
            let ticks = ((p[0] as u64 >> 1) & 0x07) << 30
                | (p[1] as u64) << 22
                | ((p[2] as u64) >> 1) << 15
                | (p[3] as u64) << 7
                | (p[4] as u64) >> 1;
            first.get_or_insert(ticks);
            last = last.max(ticks);
        }
        first.map(|f| last.saturating_sub(f) as f64 / 90_000.0)
    }

    #[test]
    fn a_renderer_given_as_ip_and_port_still_picks_the_route_to_it() {
        let Some(lan) = local_lan_ip_for_test() else {
            return;
        };
        assert_eq!(
            reachable_ip_for(&format!("{lan}:7676")).as_deref(),
            Some(lan.as_str())
        );
        assert_eq!(reachable_ip_for(&lan).as_deref(), Some(lan.as_str()));
        assert_eq!(reachable_ip_for("not a host:7676"), None);
    }

    fn local_lan_ip_for_test() -> Option<String> {
        harbor_shared::lan::local_ipv4_interfaces()
            .into_iter()
            .find(|ip| ip.is_private())
            .map(|ip| ip.to_string())
    }

    #[test]
    fn dlna_sessions_relabel_only_mpeg_ts() {
        let relabel = |ct: &str| {
            let mut headers = HeaderMap::new();
            headers.insert("content-type", HeaderValue::from_str(ct).unwrap());
            relabel_ts_for_dlna(&mut headers);
            headers["content-type"].to_str().unwrap().to_string()
        };
        assert_eq!(relabel("video/mp2t"), "video/mpeg");
        assert_eq!(relabel("video/MP2T; charset=binary"), "video/mpeg");
        assert_eq!(relabel("video/mp4"), "video/mp4");
        assert_eq!(
            relabel("application/vnd.apple.mpegurl"),
            "application/vnd.apple.mpegurl"
        );
    }

    #[tokio::test]
    async fn dlna_transcodes_skip_hls_and_resume_in_one_stream() {
        let state = ProxyState::placeholder();
        let args = |dlna: bool| RegisterArgs {
            url: "https://example.test/movie.mkv".into(),
            headers: HashMap::new(),
            transcode: true,
            prebuffer_bytes: None,
            profile: None,
            target_host: Some("127.0.0.1".into()),
            start_time_sec: Some(754.0),
            burn_sub_path: Some("C:/subs.ass".into()),
            burn_sub_style: None,
            audio_ordinal: Some(1),
            dlna,
        };
        assert!(
            casts_through_hls(&args(false)),
            "other receivers keep the HLS emitter"
        );
        assert!(
            !casts_through_hls(&args(true)),
            "DLNA never gets an HLS playlist"
        );
        let result = state.register_cast(args(true)).await;
        assert!(
            result.url.contains("/s/") && result.url.ends_with(".ts"),
            "{}",
            result.url
        );
        assert!(!result.url.contains("/cast/hls/"));
        let session = state.sessions.read().await[&result.session_id].clone();
        assert!(session.transcode && session.dlna);
        assert_eq!(session.start_sec, 754.0);
        assert!(
            session.burn_sub.is_some(),
            "burn-in survives the switch away from HLS"
        );
        assert_eq!(
            session.audio_ordinal,
            Some(1),
            "the chosen audio track reaches the transcode"
        );
    }

    #[test]
    fn serves_the_manifest_itself_as_a_manifest() {
        let hidden = "https://pervl9.xtremestream.xyz/cdn/xs1.php?token=abc";
        assert!(names_the_manifest(hidden, "xs1.php"));
        assert!(!names_the_manifest(hidden, "1080243.html"));
        assert!(!names_the_manifest(hidden, "other.php"));

        let declared = "https://host.tld/a/master.m3u8";
        assert!(names_the_manifest(declared, "master.m3u8"));
        assert!(!names_the_manifest(declared, "seg1.ts"));

        assert!(!names_the_manifest("https://host.tld", "anything"));
    }
}

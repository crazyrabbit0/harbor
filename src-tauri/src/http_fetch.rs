use std::collections::HashMap;
use std::future::Future;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::{Duration, Instant};

use crate::http_redirect::same_origin;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, Semaphore, SemaphorePermit};

const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const MAX_CONCURRENT_FETCHES: usize = 48;
const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_REDIRECTS: usize = 10;

fn fetch_semaphore() -> &'static Semaphore {
    static SEM: OnceLock<Semaphore> = OnceLock::new();
    SEM.get_or_init(|| Semaphore::new(MAX_CONCURRENT_FETCHES))
}

async fn acquire_fetch_permit() -> Result<SemaphorePermit<'static>, String> {
    fetch_semaphore()
        .acquire()
        .await
        .map_err(|error| format!("semaphore: {error}"))
}

async fn run_with_deadline<T>(
    duration: Duration,
    work: impl Future<Output = Result<T, String>>,
) -> Result<T, String> {
    tokio::time::timeout(duration, work)
        .await
        .unwrap_or_else(|_| Err(format!("timeout after {} ms", duration.as_millis())))
}

const THUMB_CACHE_MAX_BYTES: usize = 32 * 1024 * 1024;
const THUMB_CACHE_MAX_ENTRIES: usize = 256;

struct ThumbEntry {
    body: Arc<[u8]>,
    bytes: usize,
    last_used: u64,
}

struct ThumbCache {
    entries: HashMap<String, ThumbEntry>,
    total_bytes: usize,
    clock: u64,
}

impl ThumbCache {
    fn get(&mut self, key: &str) -> Option<Arc<[u8]>> {
        self.clock = self.clock.wrapping_add(1);
        let tick = self.clock;
        self.entries.get_mut(key).map(|entry| {
            entry.last_used = tick;
            entry.body.clone()
        })
    }

    fn insert(&mut self, key: String, body: Arc<[u8]>) {
        let bytes = body.len();
        if bytes > THUMB_CACHE_MAX_BYTES {
            return;
        }
        if let Some(previous) = self.entries.remove(&key) {
            self.total_bytes = self.total_bytes.saturating_sub(previous.bytes);
        }
        while self.entries.len() >= THUMB_CACHE_MAX_ENTRIES
            || self.total_bytes.saturating_add(bytes) > THUMB_CACHE_MAX_BYTES
        {
            let oldest = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(k, _)| k.clone());
            match oldest {
                Some(k) => {
                    if let Some(removed) = self.entries.remove(&k) {
                        self.total_bytes = self.total_bytes.saturating_sub(removed.bytes);
                    }
                }
                None => break,
            }
        }
        self.clock = self.clock.wrapping_add(1);
        let tick = self.clock;
        self.total_bytes = self.total_bytes.saturating_add(bytes);
        self.entries.insert(key, ThumbEntry { body, bytes, last_used: tick });
    }

    fn clear(&mut self) {
        self.entries.clear();
        self.total_bytes = 0;
    }
}

fn thumb_cache() -> &'static Mutex<ThumbCache> {
    static CACHE: OnceLock<Mutex<ThumbCache>> = OnceLock::new();
    CACHE.get_or_init(|| {
        Mutex::new(ThumbCache {
            entries: HashMap::new(),
            total_bytes: 0,
            clock: 0,
        })
    })
}

fn make_thumb(bytes: &[u8], width: u32) -> Option<Vec<u8>> {
    if width == 0 {
        return None;
    }
    let format = image::guess_format(bytes).ok()?;
    match format {
        image::ImageFormat::Jpeg | image::ImageFormat::Png | image::ImageFormat::WebP => {}
        _ => return None,
    }
    let img = image::load_from_memory(bytes).ok()?;
    if img.width() <= width {
        return None;
    }
    let height = ((img.height() as u64 * width as u64) / img.width() as u64).max(1) as u32;
    let small = img.resize(width, height, image::imageops::FilterType::Triangle);
    let mut buf = Vec::new();
    match format {
        image::ImageFormat::Jpeg => {
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 82)
                .encode_image(&small)
                .ok()?;
        }
        image::ImageFormat::Png => {
            use image::ImageEncoder;
            let rgb = small.to_rgb8();
            let (w, h) = (rgb.width(), rgb.height());
            image::codecs::png::PngEncoder::new(&mut buf)
                .write_image(rgb.as_raw(), w, h, image::ExtendedColorType::Rgb8)
                .ok()?;
        }
        _ => {
            let rgb = small.to_rgb8();
            let (w, h) = (rgb.width(), rgb.height());
            image::codecs::webp::WebPEncoder::new_lossless(&mut buf)
                .encode(rgb.as_raw(), w, h, image::ExtendedColorType::Rgb8)
                .ok()?;
        }
    }
    if buf.is_empty() {
        return None;
    }
    Some(buf)
}

async fn thumb_or_original(
    app: &tauri::AppHandle,
    url: &str,
    width: Option<u32>,
    bytes: Vec<u8>,
) -> Arc<[u8]> {
    let Some(w) = width.filter(|w| *w > 0) else {
        return bytes.into();
    };
    let key = format!("{w}\n{url}");
    if let Some(hit) = thumb_cache().lock().await.get(&key) {
        return hit;
    }
    let disk_app = app.clone();
    let disk_url = url.to_string();
    if let Some(disk) = tokio::task::spawn_blocking(move || {
        crate::thumb_cache::read_thumb(&disk_app, &disk_url, w)
    })
    .await
    .ok()
    .flatten()
    {
        let body: Arc<[u8]> = disk.into();
        thumb_cache().lock().await.insert(key, body.clone());
        return body;
    }
    let original: Arc<[u8]> = bytes.into();
    let source = original.clone();
    let made = tokio::task::spawn_blocking(move || make_thumb(&source, w))
        .await
        .ok()
        .flatten();
    let Some(buf) = made else {
        return original;
    };
    let body: Arc<[u8]> = buf.into();
    let write_app = app.clone();
    let write_url = url.to_string();
    let write_body = body.clone();
    tokio::task::spawn_blocking(move || {
        crate::thumb_cache::write_thumb(&write_app, &write_url, w, &write_body);
    })
    .await
    .ok();
    thumb_cache().lock().await.insert(key, body.clone());
    body
}

// Frame: one byte of mime length, the ASCII mime, then the image bytes.
fn image_frame(mime: &str, body: &[u8]) -> Vec<u8> {
    let mime = &mime.as_bytes()[..mime.len().min(u8::MAX as usize)];
    let mut frame = Vec::with_capacity(1 + mime.len() + body.len());
    frame.push(mime.len() as u8);
    frame.extend_from_slice(mime);
    frame.extend_from_slice(body);
    frame
}

#[tauri::command]
pub async fn harbor_fetch_image(
    app: tauri::AppHandle,
    args: HarborFetchArgs,
) -> Result<tauri::ipc::Response, String> {
    let timeout = Duration::from_millis(args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
    let _permit = acquire_fetch_permit().await?;
    run_with_deadline(timeout, harbor_fetch_image_inner(app, args)).await
}

async fn harbor_fetch_image_inner(
    app: tauri::AppHandle,
    mut args: HarborFetchArgs,
) -> Result<tauri::ipc::Response, String> {
    let (mut res, original_host) = send_fetch(&mut args).await?;
    let status = res.status().as_u16();
    let cf_mitigated = res
        .headers()
        .get("cf-mitigated")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_lowercase());
    if is_cloudflare_challenge(status, cf_mitigated.as_deref(), "") {
        if let Some(h) = original_host.as_deref() {
            crate::cf_solver::cf_invalidate(h);
        }
    }
    if !res.status().is_success() {
        return Err(format!("status {status}"));
    }
    let mime = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .filter(|v| !v.is_empty())
        .unwrap_or("image/jpeg")
        .to_string();
    if !mime.starts_with("image/") {
        return Err(format!("type {mime}"));
    }
    let final_url = res.url().to_string();
    let bytes = match args.max_response_bytes {
        Some(max_bytes) => read_capped(&mut res, max_bytes).await?,
        None => res
            .bytes()
            .await
            .map_err(|error| format!("read: {error}"))?
            .to_vec(),
    };
    let body = thumb_or_original(&app, &final_url, args.thumb_width_px, bytes).await;
    Ok(tauri::ipc::Response::new(image_frame(&mime, &body)))
}

#[tauri::command]
pub async fn clear_thumb_cache(app: tauri::AppHandle) -> Result<(), String> {
    thumb_cache().lock().await.clear();
    let app = app.clone();
    tokio::task::spawn_blocking(move || crate::thumb_cache::clear_thumb_dir(&app))
        .await
        .map_err(|error| format!("clear: {error}"))?;
    Ok(())
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbCacheSize {
    pub bytes: u64,
    pub files: usize,
}

#[tauri::command]
pub async fn thumb_cache_size(app: tauri::AppHandle) -> Result<ThumbCacheSize, String> {
    let app = app.clone();
    let (bytes, files) =
        tokio::task::spawn_blocking(move || crate::thumb_cache::thumb_cache_size(&app))
            .await
            .map_err(|error| format!("size: {error}"))?;
    Ok(ThumbCacheSize { bytes, files })
}

fn is_blocked_ip(ip: IpAddr) -> bool {
    let ip = match ip {
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => IpAddr::V4(v4),
            None => IpAddr::V6(v6),
        },
        other => other,
    };
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_link_local() || v4.is_unspecified() || v4.is_broadcast()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback() || v6.is_unspecified() || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

fn is_public_network_ip(ip: IpAddr) -> bool {
    let ip = match ip {
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => IpAddr::V4(v4),
            None => IpAddr::V6(v6),
        },
        other => other,
    };
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, c, _] = v4.octets();
            !(a == 0
                || a == 10
                || a == 127
                || a >= 224
                || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b))
                || (a == 192 && b == 168)
                || (a == 192 && b == 0)
                || (a == 192 && b == 88 && c == 99)
                || (a == 198 && (b == 18 || b == 19))
                || (a == 198 && b == 51 && c == 100)
                || (a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(v6) => {
            let segments = v6.segments();
            (segments[0] & 0xe000) == 0x2000
                && segments[0] != 0x2002
                && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
                && !(segments[0] == 0x2001 && segments[1] < 0x0200)
        }
    }
}

async fn resolve_public_target(url: &reqwest::Url) -> Result<Vec<SocketAddr>, String> {
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(format!("public target bad scheme: {}", url.scheme()));
    }
    let addresses = validate_target(url, false).await?;
    if addresses
        .iter()
        .any(|address| !is_public_network_ip(address.ip()))
    {
        let host = url.host_str().unwrap_or_default();
        return Err(format!("blocked non-public target: {host}"));
    }
    Ok(addresses)
}

const DNS_TIMEOUT: Duration = Duration::from_secs(10);

async fn lookup_host(host: &str, port: u16) -> Result<Vec<SocketAddr>, String> {
    let lookup = (host.to_string(), port);
    let task = tokio::task::spawn_blocking(move || {
        use std::net::ToSocketAddrs;
        lookup
            .to_socket_addrs()
            .map(|items| items.collect::<Vec<_>>())
    });
    let mut addresses = match tokio::time::timeout(DNS_TIMEOUT, task).await {
        Ok(Ok(Ok(addresses))) => addresses,
        _ => return Err(format!("target DNS failed: {host}")),
    };
    if addresses.is_empty() {
        return Err(format!("target DNS failed: {host}"));
    }
    addresses.sort_unstable();
    addresses.dedup();
    Ok(addresses)
}

fn host_is_blocked_literal(url: &reqwest::Url) -> bool {
    match url.host_str() {
        Some(h) => match h
            .trim_start_matches('[')
            .trim_end_matches(']')
            .parse::<IpAddr>()
        {
            Ok(ip) => is_blocked_ip(ip),
            Err(_) => false,
        },
        None => false,
    }
}

// `allow_local` opts the target out of the SSRF guard for loopback, link-local,
// and private network addresses. It is only set by callers that have explicitly
// received a URL from the user (e.g. wiring up their own self-hosted Suwayomi
// server), never for implicitly-discovered URLs.
// Returns the addresses the request must connect to; callers pin them so the send cannot re-resolve.
pub(crate) async fn validate_target(
    url: &reqwest::Url,
    allow_local: bool,
) -> Result<Vec<SocketAddr>, String> {
    let host = url
        .host_str()
        .map(|h| h.trim_start_matches('[').trim_end_matches(']').to_string())
        .filter(|h| !h.is_empty())
        .ok_or_else(|| "target has no host".to_string())?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "target has no port".to_string())?;
    if let Ok(ip) = host.parse::<IpAddr>() {
        if host_is_blocked_literal(url) && !allow_local {
            return Err(format!("blocked internal target: {}", host));
        }
        return Ok(vec![SocketAddr::new(ip, port)]);
    }
    let addresses = lookup_host(&host, port).await?;
    if !allow_local && addresses.iter().any(|a| is_blocked_ip(a.ip())) {
        return Err(format!("blocked internal target: {}", host));
    }
    Ok(addresses)
}

pub(crate) fn pinned_client(
    builder: reqwest::ClientBuilder,
    url: &reqwest::Url,
    addresses: &[SocketAddr],
) -> Result<reqwest::Client, String> {
    let builder = match url.host_str() {
        Some(host) if url.domain().is_some() => builder.resolve_to_addrs(host, addresses),
        _ => builder,
    };
    builder.build().map_err(|error| format!("client: {error}"))
}

const CLIENT_CACHE_TTL: Duration = Duration::from_secs(60);
const CLIENT_CACHE_MAX_ENTRIES: usize = 64;

// A client is reused only for the exact origin and validated address set it was pinned to.
#[derive(Clone, PartialEq, Eq, Hash)]
struct ClientKey {
    scheme: String,
    host: String,
    port: u16,
    addresses: Vec<SocketAddr>,
}

impl ClientKey {
    fn new(url: &reqwest::Url, addresses: &[SocketAddr]) -> Self {
        let mut addresses = addresses.to_vec();
        addresses.sort_unstable();
        addresses.dedup();
        Self {
            scheme: url.scheme().to_string(),
            host: url.host_str().unwrap_or_default().to_ascii_lowercase(),
            port: url.port_or_known_default().unwrap_or(0),
            addresses,
        }
    }
}

struct CachedClient<T> {
    client: T,
    created: Instant,
    last_used: Instant,
}

struct ClientCache<T> {
    entries: HashMap<ClientKey, CachedClient<T>>,
}

impl<T: Clone> ClientCache<T> {
    fn new() -> Self {
        Self { entries: HashMap::new() }
    }

    fn get(&mut self, key: &ClientKey, now: Instant) -> Option<T> {
        self.entries
            .retain(|_, entry| now.duration_since(entry.created) < CLIENT_CACHE_TTL);
        let entry = self.entries.get_mut(key)?;
        entry.last_used = now;
        Some(entry.client.clone())
    }

    // Keeps a fresh entry another caller inserted meanwhile, so concurrent misses share one client.
    fn insert(&mut self, key: ClientKey, client: T, now: Instant) -> T {
        if let Some(existing) = self.get(&key, now) {
            return existing;
        }
        while self.entries.len() >= CLIENT_CACHE_MAX_ENTRIES {
            let oldest = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(key, _)| key.clone());
            match oldest {
                Some(oldest) => self.entries.remove(&oldest),
                None => break,
            };
        }
        let entry = CachedClient { client: client.clone(), created: now, last_used: now };
        self.entries.insert(key, entry);
        client
    }
}

fn client_cache() -> &'static StdMutex<ClientCache<reqwest::Client>> {
    static CACHE: OnceLock<StdMutex<ClientCache<reqwest::Client>>> = OnceLock::new();
    CACHE.get_or_init(|| StdMutex::new(ClientCache::new()))
}

fn cached_pinned_client(
    url: &reqwest::Url,
    addresses: &[SocketAddr],
) -> Result<reqwest::Client, String> {
    let key = ClientKey::new(url, addresses);
    let lock = || client_cache().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(client) = lock().get(&key, Instant::now()) {
        return Ok(client);
    }
    let client = pinned_client(http_client_builder(), url, addresses)?;
    Ok(lock().insert(key, client, Instant::now()))
}

// Validates every hop; only the client pinned to an identical validated address set is reused.
async fn hop_client(
    url: &reqwest::Url,
    allow_local: bool,
    public_network_only: bool,
) -> Result<reqwest::Client, String> {
    let addresses = if public_network_only {
        resolve_public_target(url).await?
    } else {
        validate_target(url, allow_local).await?
    };
    cached_pinned_client(url, &addresses)
}

fn is_https_downgrade(a: &reqwest::Url, b: &reqwest::Url) -> bool {
    a.scheme() == "https" && b.scheme() == "http"
}

fn strip_headers(headers: &mut Vec<(String, String)>, drop: &[&str]) {
    headers.retain(|(k, _)| {
        let low = k.to_ascii_lowercase();
        !drop.contains(&low.as_str())
    });
}

fn collect_headers(headers: &reqwest::header::HeaderMap) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for (name, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            out.insert(name.as_str().to_ascii_lowercase(), v.to_string());
        }
    }
    out
}

fn is_followable_redirect(status: reqwest::StatusCode) -> bool {
    use reqwest::StatusCode;
    matches!(
        status,
        StatusCode::MOVED_PERMANENTLY
            | StatusCode::FOUND
            | StatusCode::SEE_OTHER
            | StatusCode::TEMPORARY_REDIRECT
            | StatusCode::PERMANENT_REDIRECT
    )
}

fn apply_redirect_method(
    method: &mut reqwest::Method,
    body: &mut Option<Vec<u8>>,
    status: reqwest::StatusCode,
) {
    use reqwest::{Method, StatusCode};
    match status {
        StatusCode::SEE_OTHER => {
            if *method != Method::HEAD {
                *method = Method::GET;
            }
            *body = None;
        }
        StatusCode::MOVED_PERMANENTLY | StatusCode::FOUND if *method == Method::POST => {
            *method = Method::GET;
            *body = None;
        }
        _ => {}
    }
}

pub(crate) fn http_client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(8)
}

pub(crate) async fn public_http_client(url: &reqwest::Url) -> Result<reqwest::Client, String> {
    hop_client(url, false, true).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborFetchArgs {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub body_base64: Option<String>,
    pub timeout_ms: Option<u64>,
    pub response_type: Option<String>,
    pub max_response_bytes: Option<u64>,
    pub credential_handle: Option<String>,
    pub public_network_only: Option<bool>,
    pub allow_local_network: Option<bool>,
    pub follow_redirects: Option<bool>,
    pub thumb_width_px: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborFetchResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
    pub content_type: Option<String>,
    pub headers: HashMap<String, String>,
    pub url: Option<String>,
}

#[tauri::command]
pub async fn harbor_fetch(
    app: tauri::AppHandle,
    args: HarborFetchArgs,
) -> Result<HarborFetchResponse, String> {
    let timeout = Duration::from_millis(args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
    let _permit = acquire_fetch_permit().await?;
    run_with_deadline(timeout, harbor_fetch_inner(app, args)).await
}

async fn send_fetch(
    args: &mut HarborFetchArgs,
) -> Result<(reqwest::Response, Option<String>), String> {
    let timeout = Duration::from_millis(args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
    let public_network_only = args.public_network_only.unwrap_or(false);
    let allow_local_network = args.allow_local_network.unwrap_or(false);
    let follow_redirects = args.follow_redirects.unwrap_or(true);

    let method = args.method.as_deref().unwrap_or("GET").to_uppercase();
    let mut current_method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| format!("method: {}", e))?;

    let mut current_url = reqwest::Url::parse(&args.url).map_err(|e| format!("url: {}", e))?;

    let mut subtitle_credential = args
        .credential_handle
        .as_deref()
        .map(crate::subtitle_credentials::resolve)
        .transpose()?;

    let original_host = current_url.host_str().map(|s| s.to_string());
    let cf = current_url.host_str().and_then(crate::cf_solver::cf_cached);

    let mut headers: Vec<(String, String)> = Vec::new();
    let mut has_user_agent = false;
    let mut has_accept = false;
    let mut has_accept_language = false;
    if let Some(caller_headers) = args.headers.take() {
        for (k, v) in caller_headers {
            let low = k.to_ascii_lowercase();
            if low == "x-harbor-subtitle-credential" {
                continue;
            }
            if subtitle_credential.is_some() && low == "x-api-key" {
                continue;
            }
            if low == "user-agent" {
                if cf.is_some() {
                    continue;
                }
                has_user_agent = true;
            }
            if low == "cookie" && cf.is_some() {
                continue;
            }
            if low == "accept" {
                has_accept = true;
            }
            if low == "accept-language" {
                has_accept_language = true;
            }
            headers.push((k, v));
        }
    }
    if let Some((cookie, ua)) = cf {
        headers.push(("Cookie".to_string(), cookie));
        headers.push(("User-Agent".to_string(), ua));
        has_user_agent = true;
    }
    if !has_user_agent {
        headers.push(("User-Agent".to_string(), BROWSER_UA.to_string()));
    }
    if !has_accept {
        headers.push((
            "Accept".to_string(),
            "application/json, text/plain, */*".to_string(),
        ));
    }
    if !has_accept_language {
        headers.push(("Accept-Language".to_string(), "en-US,en;q=0.9".to_string()));
    }

    let mut body = match args.body_base64.take() {
        Some(value) => Some(
            base64::engine::general_purpose::STANDARD
                .decode(value)
                .map_err(|error| format!("request base64: {error}"))?,
        ),
        None => args.body.take().map(String::into_bytes),
    };
    let mut redirect_count = 0usize;

    let res = loop {
        let client = hop_client(&current_url, allow_local_network, public_network_only).await?;
        let (request_url, credential_header) = match subtitle_credential.as_ref() {
            Some(credential) => {
                crate::subtitle_credentials::apply_to_request(&current_url, credential)?
            }
            None => (current_url.clone(), None),
        };
        let mut req = client
            .request(current_method.clone(), request_url)
            .timeout(timeout);
        for (k, v) in &headers {
            req = req.header(k.as_str(), v.as_str());
        }
        if let Some((name, value)) = credential_header {
            req = req.header(name.as_str(), value.as_str());
        }
        if let Some(b) = &body {
            req = req.body(b.clone());
        }

        let resp = req.send().await.map_err(|error| {
            if subtitle_credential.is_some() {
                "send: subtitle provider request failed".to_string()
            } else {
                format!("send: {error}")
            }
        })?;
        let status = resp.status();
        if !follow_redirects || !is_followable_redirect(status) {
            break resp;
        }
        let location = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let Some(location) = location else {
            break resp;
        };

        redirect_count += 1;
        if redirect_count > MAX_REDIRECTS {
            return Err("too many redirects".to_string());
        }
        let next_url = current_url
            .join(&location)
            .map_err(|e| format!("redirect url: {}", e))?;
        if next_url.scheme() != "http" && next_url.scheme() != "https" {
            return Err(format!("redirect bad scheme: {}", next_url.scheme()));
        }
        if is_https_downgrade(&current_url, &next_url) {
            return Err("redirect from HTTPS to HTTP is not allowed".to_string());
        }
        let cross_origin = !same_origin(&current_url, &next_url);
        let had_body = body.is_some();
        apply_redirect_method(&mut current_method, &mut body, status);
        if cross_origin_redirect_forwards_body(cross_origin, &body) {
            return Err("cross-origin redirect cannot forward request body".to_string());
        }
        if cross_origin {
            subtitle_credential = None;
            headers.retain(|(name, _)| crate::http_redirect::safe_cross_origin_header(name));
        }
        if had_body && body.is_none() {
            strip_headers(
                &mut headers,
                &[
                    "content-type",
                    "content-length",
                    "content-encoding",
                    "transfer-encoding",
                ],
            );
        }
        current_url = next_url;
    };
    Ok((res, original_host))
}

async fn read_capped(res: &mut reqwest::Response, max_bytes: u64) -> Result<Vec<u8>, String> {
    if res.content_length().is_some_and(|size| size > max_bytes) {
        return Err("response size limit exceeded".to_string());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = res
        .chunk()
        .await
        .map_err(|error| format!("read: {error}"))?
    {
        if (bytes.len() as u64).saturating_add(chunk.len() as u64) > max_bytes {
            return Err("response size limit exceeded".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

async fn harbor_fetch_inner(
    app: tauri::AppHandle,
    mut args: HarborFetchArgs,
) -> Result<HarborFetchResponse, String> {
    let (mut res, original_host) = send_fetch(&mut args).await?;
    let status = res.status().as_u16();
    let ok = res.status().is_success();
    let cf_mitigated = res
        .headers()
        .get("cf-mitigated")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_lowercase());
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let response_headers = collect_headers(res.headers());
    let final_url = res.url().to_string();
    let base64 = args.response_type.as_deref() == Some("base64");
    let body = if let Some(max_bytes) = args.max_response_bytes {
        let bytes = read_capped(&mut res, max_bytes).await?;
        if base64 {
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        }
    } else if base64 {
        match res.bytes().await {
            Ok(bytes) => base64::engine::general_purpose::STANDARD.encode(&bytes),
            Err(_) => String::new(),
        }
    } else {
        res.text().await.unwrap_or_default()
    };

    if is_cloudflare_challenge(status, cf_mitigated.as_deref(), &body) {
        if let Some(h) = original_host.as_deref() {
            crate::cf_solver::cf_invalidate(h);
        }
        let solver_ok = original_host
            .as_deref()
            .map(solver_host_allowed)
            .unwrap_or(false);
        // The solver returns text, not a byte-preserving/base64 response, and does not
        // participate in the caller's response-size contract. Binary/capped callers
        // must receive the original bounded response instead of bypassing those rules.
        if solver_ok
            && args.response_type.as_deref() != Some("base64")
            && args.max_response_bytes.is_none()
        {
            eprintln!("[cf] challenge detected ({}) for {}", status, args.url);
            if let Ok(solved) = crate::cf_solver::cf_fetch(app, args.url.clone()).await {
                return Ok(HarborFetchResponse {
                    status: 200,
                    ok: true,
                    body: solved,
                    content_type: None,
                    headers: HashMap::new(),
                    url: None,
                });
            }
        }
    }

    Ok(HarborFetchResponse {
        status,
        ok,
        body,
        content_type,
        headers: response_headers,
        url: Some(final_url),
    })
}

const BACKGROUND_PROVIDER_HOSTS: &[&str] =
    &["api.theintrodb.org", "api.introdb.app", "api.skipdb.tv"];

fn solver_host_allowed(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    !BACKGROUND_PROVIDER_HOSTS.contains(&host.as_str())
}

fn is_cloudflare_hard_block(body: &str) -> bool {
    body.contains("Sorry, you have been blocked")
        || body.contains("error code: 1020")
        || body.contains("Error 1015")
        || body.contains("You are being rate limited")
}

fn is_cloudflare_challenge(status: u16, cf_mitigated: Option<&str>, body: &str) -> bool {
    if is_cloudflare_hard_block(body) {
        return false;
    }
    if cf_mitigated == Some("challenge") {
        return true;
    }
    if !matches!(status, 403 | 503) {
        return false;
    }
    body.contains("Just a moment")
        || body.contains("cf_chl_opt")
        || body.contains("challenge-form")
        || body.contains("cf-please-wait")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborUploadArgs {
    pub url: String,
    pub field: String,
    pub filename: String,
    pub content_type: Option<String>,
    pub data_base64: String,
    pub headers: Option<HashMap<String, String>>,
    pub timeout_ms: Option<u64>,
}

#[tauri::command]
pub async fn harbor_upload(args: HarborUploadArgs) -> Result<HarborFetchResponse, String> {
    let timeout = Duration::from_millis(args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
    run_with_deadline(timeout, harbor_upload_inner(args)).await
}

async fn harbor_upload_inner(args: HarborUploadArgs) -> Result<HarborFetchResponse, String> {
    let _permit = acquire_fetch_permit().await?;
    let url = reqwest::Url::parse(&args.url).map_err(|e| format!("url: {}", e))?;
    let client = hop_client(&url, false, false).await?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(args.data_base64.as_bytes())
        .map_err(|e| format!("base64: {}", e))?;

    let mut part = reqwest::multipart::Part::bytes(bytes).file_name(args.filename);
    if let Some(ct) = args.content_type.as_deref() {
        part = part.mime_str(ct).map_err(|e| format!("mime: {}", e))?;
    }
    let form = reqwest::multipart::Form::new().part(args.field, part);

    let mut req = client
        .post(url)
        .timeout(Duration::from_millis(
            args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS),
        ))
        .multipart(form);
    let mut has_ua = false;
    if let Some(caller_headers) = args.headers {
        for (k, v) in caller_headers {
            if k.eq_ignore_ascii_case("user-agent") {
                has_ua = true;
            }
            req = req.header(k.as_str(), v.as_str());
        }
    }
    if !has_ua {
        req = req.header("User-Agent", BROWSER_UA);
    }

    let resp = req.send().await.map_err(|e| format!("send: {}", e))?;
    let status = resp.status().as_u16();
    let ok = resp.status().is_success();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let headers = collect_headers(resp.headers());
    let url = Some(resp.url().to_string());
    let body = resp.text().await.unwrap_or_default();
    Ok(HarborFetchResponse {
        status,
        ok,
        body,
        content_type,
        headers,
        url,
    })
}

fn cross_origin_redirect_forwards_body(cross_origin: bool, body: &Option<Vec<u8>>) -> bool {
    cross_origin && body.is_some()
}

#[cfg(test)]
mod tests {
    use super::{
        apply_redirect_method, cross_origin_redirect_forwards_body, hop_client,
        host_is_blocked_literal, is_https_downgrade, is_public_network_ip, same_origin,
        validate_target, ClientCache, ClientKey, CLIENT_CACHE_MAX_ENTRIES, CLIENT_CACHE_TTL,
    };
    use std::net::SocketAddr;
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    fn key(url: &str, addresses: &[&str]) -> ClientKey {
        let url: reqwest::Url = url.parse().unwrap();
        let addresses: Vec<SocketAddr> = addresses.iter().map(|a| a.parse().unwrap()).collect();
        ClientKey::new(&url, &addresses)
    }

    #[test]
    fn client_cache_reuses_client_for_same_host_and_addresses() {
        let mut cache = ClientCache::new();
        let now = Instant::now();
        let first = cache.insert(key("https://a.test/x", &["1.1.1.1:443", "1.0.0.1:443"]), Arc::new(1), now);
        let reordered = key("https://a.test/y", &["1.0.0.1:443", "1.1.1.1:443"]);
        let hit = cache.get(&reordered, now).expect("same address set hits");
        assert!(Arc::ptr_eq(&first, &hit));
        let raced = cache.insert(reordered, Arc::new(2), now);
        assert!(Arc::ptr_eq(&first, &raced));
    }

    #[test]
    fn client_cache_misses_when_addresses_or_origin_differ() {
        let mut cache = ClientCache::new();
        let now = Instant::now();
        cache.insert(key("https://a.test/", &["1.1.1.1:443"]), Arc::new(1), now);
        assert!(cache.get(&key("https://a.test/", &["8.8.8.8:443"]), now).is_none());
        assert!(cache.get(&key("https://a.test/", &["1.1.1.1:443", "8.8.8.8:443"]), now).is_none());
        assert!(cache.get(&key("http://a.test:443/", &["1.1.1.1:443"]), now).is_none());
        assert!(cache.get(&key("https://b.test/", &["1.1.1.1:443"]), now).is_none());
    }

    #[test]
    fn client_cache_expires_entries_after_ttl() {
        let mut cache = ClientCache::new();
        let now = Instant::now();
        let k = key("https://a.test/", &["1.1.1.1:443"]);
        cache.insert(k.clone(), Arc::new(1), now);
        assert!(cache.get(&k, now + CLIENT_CACHE_TTL - Duration::from_secs(1)).is_some());
        assert!(cache.get(&k, now + CLIENT_CACHE_TTL).is_none());
        assert!(cache.entries.is_empty());
    }

    #[test]
    fn client_cache_evicts_least_recently_used_beyond_bound() {
        let mut cache = ClientCache::new();
        let now = Instant::now();
        let first = key("https://h0.test/", &["1.1.1.1:443"]);
        cache.insert(first.clone(), Arc::new(0), now);
        for i in 1..CLIENT_CACHE_MAX_ENTRIES {
            let at = now + Duration::from_millis(i as u64);
            cache.insert(key(&format!("https://h{i}.test/"), &["1.1.1.1:443"]), Arc::new(i), at);
        }
        let touched = now + Duration::from_millis(500);
        assert!(cache.get(&first, touched).is_some());
        let extra = key("https://extra.test/", &["1.1.1.1:443"]);
        cache.insert(extra.clone(), Arc::new(99), touched + Duration::from_millis(1));
        assert_eq!(cache.entries.len(), CLIENT_CACHE_MAX_ENTRIES);
        assert!(cache.entries.contains_key(&first));
        assert!(cache.entries.contains_key(&extra));
        assert!(!cache.entries.contains_key(&key("https://h1.test/", &["1.1.1.1:443"])));
    }

    #[tokio::test]
    async fn hop_client_reuses_pinned_client_after_revalidation() {
        let url: reqwest::Url = "http://127.0.0.1:4568/".parse().unwrap();
        let first = hop_client(&url, true, false).await.unwrap();
        let second = hop_client(&url, true, false).await.unwrap();
        let addresses = validate_target(&url, true).await.unwrap();
        let cached = super::client_cache().lock().unwrap().get(&ClientKey::new(&url, &addresses), Instant::now());
        assert!(cached.is_some());
        drop((first, second));
        assert!(hop_client(&url, false, false).await.is_err(), "validation still runs on a cached host");
    }

    #[test]
    fn cross_host_redirects_strip_credentials() {
        let mut headers = vec![
            ("X-API-Key".to_string(), "secret".to_string()),
            ("Authorization".to_string(), "Bearer secret".to_string()),
            ("Cookie".to_string(), "session=secret".to_string()),
            ("X-Unknown-Token".to_string(), "synthetic-only".to_string()),
            ("Accept".to_string(), "application/zip".to_string()),
        ];
        headers.retain(|(name, _)| crate::http_redirect::safe_cross_origin_header(name));
        assert_eq!(
            headers,
            vec![("Accept".to_string(), "application/zip".to_string())]
        );
    }

    #[test]
    fn redirect_origin_includes_scheme_and_effective_port() {
        let https = reqwest::Url::parse("https://example.test/path").unwrap();
        let same = reqwest::Url::parse("https://example.test/next").unwrap();
        let downgrade = reqwest::Url::parse("http://example.test:443/next").unwrap();

        assert!(same_origin(&https, &same));
        assert!(!same_origin(&https, &downgrade));
        assert!(is_https_downgrade(&https, &downgrade));
    }

    #[test]
    fn cross_origin_redirects_never_forward_request_bodies() {
        use reqwest::{Method, StatusCode};

        for (status, method) in [
            (StatusCode::TEMPORARY_REDIRECT, Method::POST),
            (StatusCode::PERMANENT_REDIRECT, Method::POST),
            (StatusCode::MOVED_PERMANENTLY, Method::PUT),
            (StatusCode::FOUND, Method::PATCH),
        ] {
            let mut redirected_method = method;
            let mut body = Some(b"secret".to_vec());
            apply_redirect_method(&mut redirected_method, &mut body, status);
            assert!(cross_origin_redirect_forwards_body(true, &body));
            assert!(!cross_origin_redirect_forwards_body(false, &body));
        }

        let mut method = Method::POST;
        let mut body = Some(b"safe-to-drop".to_vec());
        apply_redirect_method(&mut method, &mut body, StatusCode::SEE_OTHER);
        assert!(!cross_origin_redirect_forwards_body(true, &body));
    }

    #[test]
    fn provider_public_network_policy_rejects_local_and_reserved_ranges() {
        for value in [
            "127.0.0.1",
            "10.0.0.1",
            "172.16.0.1",
            "192.168.1.1",
            "100.64.0.1",
            "169.254.1.1",
            "198.18.0.1",
            "203.0.113.1",
            "::1",
            "fe80::1",
            "fc00::1",
            "fec0::1",
            "2001:db8::1",
            "2002:0a00:0001::1",
            "::ffff:127.0.0.1",
        ] {
            let ip: std::net::IpAddr = value.parse().unwrap();
            assert!(!is_public_network_ip(ip), "{value}");
        }
        for value in ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"] {
            let ip: std::net::IpAddr = value.parse().unwrap();
            assert!(is_public_network_ip(ip), "{value}");
        }
    }

    #[test]
    fn guarded_fetch_blocks_loopback_literals() {
        for value in [
            "http://127.0.0.1:4567/api",
            "http://[::1]:4567/api",
            "http://[::ffff:127.0.0.1]:4567/api",
            "http://0.0.0.0:4567/api",
            "http://169.254.169.254/latest/meta-data/",
        ] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(host_is_blocked_literal(&url), "{value}");
        }
        for value in [
            "http://sonicbit.example.com:4567/api",
            "http://192.168.1.10:4567/api",
            "http://8.8.8.8:4567/api",
        ] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(!host_is_blocked_literal(&url), "{value}");
        }
    }

    #[tokio::test]
    async fn validate_target_respects_allow_local() {
        for value in [
            "http://127.0.0.1:4567/api",
            "http://[::1]:4567/api",
            "http://[::ffff:127.0.0.1]:4567/api",
            "http://0.0.0.0:4567/api",
            "http://169.254.169.254/latest/meta-data/",
        ] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(
                validate_target(&url, false).await.is_err(),
                "{value} blocked"
            );
            assert!(
                validate_target(&url, true).await.is_ok(),
                "{value} allowed with allow_local"
            );
        }
        for value in ["http://192.168.1.10:4567/api", "http://8.8.8.8:4567/api"] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(
                validate_target(&url, false).await.is_ok(),
                "{value} public ok"
            );
        }
    }

    #[tokio::test]
    async fn validate_target_fails_closed_when_dns_lookup_fails() {
        let url: reqwest::Url = "http://nonexistent-host.invalid/".parse().unwrap();
        assert!(validate_target(&url, false).await.is_err());
        assert!(validate_target(&url, true).await.is_err());
    }

    #[tokio::test]
    async fn validate_target_returns_only_allowed_pinned_addresses() {
        for value in ["http://localhost:4567/api", "http://127.0.0.1:4567/api"] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(validate_target(&url, false).await.is_err(), "{value} blocked");
            let addresses = validate_target(&url, true).await.unwrap();
            assert!(!addresses.is_empty(), "{value} resolves");
            assert!(
                addresses.iter().all(|a| a.ip().is_loopback() && a.port() == 4567),
                "{value} pinned to loopback:4567"
            );
        }
        let url: reqwest::Url = "http://192.168.1.10/api".parse().unwrap();
        let addresses = validate_target(&url, false).await.unwrap();
        assert_eq!(addresses, vec!["192.168.1.10:80".parse().unwrap()]);
    }

    #[tokio::test]
    async fn every_hop_client_goes_through_target_validation() {
        for value in ["http://127.0.0.1/", "http://localhost/", "http://nonexistent-host.invalid/"] {
            let url: reqwest::Url = value.parse().unwrap();
            assert!(hop_client(&url, false, false).await.is_err(), "{value} blocked");
            assert!(hop_client(&url, false, true).await.is_err(), "{value} public-only blocked");
        }
        let url: reqwest::Url = "http://127.0.0.1:4567/".parse().unwrap();
        assert!(hop_client(&url, true, false).await.is_ok());
        let url: reqwest::Url = "http://nonexistent-host.invalid/".parse().unwrap();
        assert!(hop_client(&url, true, false).await.is_err());
    }
}

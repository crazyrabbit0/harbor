use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{RawQuery, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, Response, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use futures_util::{SinkExt, StreamExt};
use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, oneshot, Mutex as AsyncMutex};

pub const WEB_PORT: u16 = 11471;
const DEV_FRONTEND: &str = "http://127.0.0.1:1420";

/// True when built/run via `tauri dev` (CLI sets `--cfg dev`).
fn is_tauri_dev() -> bool {
    tauri::is_dev()
}

static RUNNING: AtomicBool = AtomicBool::new(false);
static NEXT_CLIENT_ID: AtomicU64 = AtomicU64::new(1);
static SERVE_GENERATION: AtomicU64 = AtomicU64::new(0);

#[derive(Clone)]
struct ServeState {
    app: AppHandle,
    outbound: broadcast::Sender<String>,
    clients: Arc<AsyncMutex<HashSet<u64>>>,
}

fn shutdown_slot() -> &'static Mutex<Option<oneshot::Sender<()>>> {
    static S: OnceLock<Mutex<Option<oneshot::Sender<()>>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn serve_state_slot() -> &'static Mutex<Option<ServeState>> {
    static S: OnceLock<Mutex<Option<ServeState>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn is_spa_path(raw_path: &str) -> bool {
    raw_path == "/"
        || raw_path.is_empty()
        || raw_path == "/remote"
        || raw_path.starts_with("/remote/")
        || raw_path == "/setup"
        || raw_path.starts_with("/setup/")
        || raw_path == "/reader"
        || raw_path.starts_with("/reader/")
}

fn serve_bundled_asset(app: &AppHandle, raw_path: &str) -> Response<Body> {
    let resolver = app.asset_resolver();
    let path = if is_spa_path(raw_path) {
        "/index.html".to_string()
    } else {
        raw_path.to_string()
    };
    let asset = resolver
        .get(path.clone())
        .or_else(|| resolver.get("/index.html".to_string()));
    match asset {
        Some(a) => {
            let cache = if path.ends_with(".html") || path == "/index.html" {
                "no-cache"
            } else {
                "public, max-age=31536000, immutable"
            };
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, a.mime_type)
                .header(header::CACHE_CONTROL, cache)
                .body(Body::from(a.bytes))
                .unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(
                "Harbor web assets are not available in this build.",
            ))
            .unwrap(),
    }
}

/// In `tauri dev`, the desktop window loads Vite live assets, but `:11471`
/// previously only served Tauri's asset resolver (often stale). Proxy those
/// requests to the Vite dev server so phone `/remote` tracks HMR.
async fn proxy_dev_frontend(path_and_query: &str) -> Option<Response<Body>> {
    if !is_tauri_dev() {
        return None;
    }
    let url = format!("{DEV_FRONTEND}{path_and_query}");
    let client = reqwest::Client::new();
    let upstream = client.get(&url).send().await.ok()?;
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let headers = upstream.headers().clone();
    let bytes = upstream.bytes().await.ok()?;
    let mut builder = Response::builder().status(status);
    let mut out_headers = HeaderMap::new();
    for (name, value) in headers.iter() {
        let skip = matches!(
            name.as_str(),
            "transfer-encoding" | "content-length" | "connection" | "content-encoding"
        );
        if skip {
            continue;
        }
        if let Ok(n) = HeaderName::from_bytes(name.as_str().as_bytes()) {
            if let Ok(v) = HeaderValue::from_bytes(value.as_bytes()) {
                out_headers.insert(n, v);
            }
        }
    }
    out_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    *builder.headers_mut().unwrap() = out_headers;
    builder.body(Body::from(bytes)).ok()
}

fn pct_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn pct_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (pct_hex(bytes[i + 1]), pct_hex(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn blocked_host(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let after = lower.split("://").nth(1).unwrap_or("");
    let host = after.split(['/', '?', '#', ':']).next().unwrap_or("");
    host == "localhost"
        || host.starts_with("127.")
        || host.starts_with("0.")
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.starts_with("169.254.")
        || host.starts_with("[::1]")
        || (host.starts_with("172.")
            && host
                .split('.')
                .nth(1)
                .and_then(|o| o.parse::<u8>().ok())
                .map(|o| (16..=31).contains(&o))
                .unwrap_or(false))
}

// LAN clients reach this route, so every hop is resolved and checked as a public address, redirects included.
async fn fetch_public_image(url: &str) -> Option<reqwest::Response> {
    let mut current = reqwest::Url::parse(url).ok()?;
    for _ in 0..5 {
        let client = crate::http_fetch::public_http_client(&current).await.ok()?;
        let resp = client
            .get(current.clone())
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            )
            .send()
            .await
            .ok()?;
        if !resp.status().is_redirection() {
            return Some(resp);
        }
        let location = resp.headers().get(header::LOCATION)?.to_str().ok()?;
        current = current.join(location).ok()?;
    }
    None
}

async fn manga_img_proxy(uri: axum::http::Uri) -> Response<Body> {
    let query = uri.query().unwrap_or("");
    let target = query
        .split('&')
        .find_map(|pair| pair.strip_prefix("u=").map(pct_decode));
    let url = match target {
        Some(u) if (u.starts_with("http://") || u.starts_with("https://")) && !blocked_host(&u) => {
            u
        }
        _ => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Body::empty())
                .unwrap()
        }
    };
    let upstream = match fetch_public_image(&url).await {
        Some(r) => r,
        None => {
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::empty())
                .unwrap()
        }
    };
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let ctype = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = match upstream.bytes().await {
        Ok(b) => b,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::empty())
                .unwrap()
        }
    };
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, ctype)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(bytes))
        .unwrap()
}

async fn serve_http(State(state): State<ServeState>, uri: axum::http::Uri) -> Response<Body> {
    let path_and_query = uri
        .path_and_query()
        .map(|pq| pq.as_str().to_string())
        .unwrap_or_else(|| "/".to_string());
    if let Some(proxied) = proxy_dev_frontend(&path_and_query).await {
        return proxied;
    }
    serve_bundled_asset(&state.app, uri.path())
}

const TOKEN_FILE: &str = "web-remote-token.txt";
const TOKEN_HEX_LEN: usize = 64;
// Frames a socket without the pairing key may still receive: probes, Play-on acks and the TV hand-off.
const UNAUTHED_OUTBOUND: [&str; 5] = ["hello", "pong", "error", "ack", "harborSetup"];
const UNAUTHORIZED_FRAME: &str = r#"{"t":"error","code":"unauthorized","message":"Scan the QR code in Harbor again to pair this remote."}"#;

fn token_slot() -> &'static Mutex<Option<String>> {
    static S: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

// Two v4 UUIDs give 244 random bits from the OS generator without another dependency.
fn generate_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn is_valid_token(token: &str) -> bool {
    token.len() == TOKEN_HEX_LEN
        && token
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn token_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join(TOKEN_FILE))
}

// Flushed before the rename, so a crash leaves the old token or the new one, never a torn file.
fn write_token_file(path: &std::path::Path, token: &str) -> std::io::Result<()> {
    use std::io::Write;
    let tmp = path.with_extension("txt.tmp");
    let mut file = std::fs::File::create(&tmp)?;
    file.write_all(token.as_bytes())?;
    file.sync_all()?;
    drop(file);
    std::fs::rename(&tmp, path)
}

/// The pairing token, loaded from disk once, created on first use; an unwritable disk keeps it in memory.
fn remote_token(app: &AppHandle) -> String {
    let mut slot = token_slot().lock().unwrap();
    if let Some(token) = slot.as_ref() {
        return token.clone();
    }
    let path = token_path(app);
    let stored = path
        .as_ref()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| is_valid_token(s));
    let token = match stored {
        Some(token) => token,
        None => {
            let token = generate_token();
            if let Some(p) = path.as_ref() {
                if let Err(e) = write_token_file(p, &token) {
                    eprintln!("[web-serve] could not save the remote pairing token: {e}");
                }
            }
            token
        }
    };
    *slot = Some(token.clone());
    token
}

fn query_key(query: Option<&str>) -> Option<String> {
    query?
        .split('&')
        .find_map(|pair| pair.strip_prefix("k=").map(pct_decode))
        .filter(|k| !k.is_empty())
}

fn key_matches(provided: Option<&str>, expected: &str) -> bool {
    let Some(provided) = provided else {
        return false;
    };
    if expected.is_empty() || provided.len() != expected.len() {
        return false;
    }
    provided
        .bytes()
        .zip(expected.bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

fn outbound_allowed_unauthed(frame: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(frame)
        .ok()
        .and_then(|v| v.get("t").and_then(|t| t.as_str()).map(str::to_string))
        .is_some_and(|t| UNAUTHED_OUTBOUND.contains(&t.as_str()))
}

#[tauri::command]
pub fn web_remote_token(app: AppHandle) -> String {
    remote_token(&app)
}

async fn remote_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<ServeState>,
    RawQuery(query): RawQuery,
) -> impl IntoResponse {
    let expected = remote_token(&state.app);
    let authed = key_matches(query_key(query.as_deref()).as_deref(), &expected);
    ws.on_upgrade(move |socket| handle_remote_socket(socket, state, authed))
}

async fn handle_remote_socket(socket: WebSocket, state: ServeState, authed: bool) {
    let client_id = NEXT_CLIENT_ID.fetch_add(1, Ordering::SeqCst);
    {
        let mut clients = state.clients.lock().await;
        clients.insert(client_id);
    }

    let (mut sender, mut receiver) = socket.split();
    if !authed {
        let _ = sender
            .send(Message::Text(UNAUTHORIZED_FRAME.to_string().into()))
            .await;
    }
    let mut outbound_rx = state.outbound.subscribe();
    let _ = state.app.emit(
        "remote://client",
        serde_json::json!({ "action": "join", "clientId": client_id, "authed": authed }),
    );

    let send_task = tauri::async_runtime::spawn(async move {
        loop {
            match outbound_rx.recv().await {
                Ok(msg) => {
                    if !authed && !outbound_allowed_unauthed(&msg) {
                        continue;
                    }
                    if sender.send(Message::Text(msg.into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                let _ = state.app.emit(
                    "remote://cmd",
                    serde_json::json!({
                        "clientId": client_id,
                        "raw": text.to_string(),
                        "authed": authed,
                    }),
                );
            }
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) | Message::Binary(_) => {}
        }
    }

    send_task.abort();
    {
        let mut clients = state.clients.lock().await;
        clients.remove(&client_id);
    }
    let _ = state.app.emit(
        "remote://client",
        serde_json::json!({ "action": "leave", "clientId": client_id, "authed": authed }),
    );
}

#[tauri::command]
pub async fn web_serve_start(app: AppHandle) -> Result<u16, String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(WEB_PORT);
    }
    let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], WEB_PORT)))
        .await
        .map_err(|e| format!("port {} unavailable: {}", WEB_PORT, e))?;
    let (tx, rx) = oneshot::channel::<()>();
    *shutdown_slot().lock().unwrap() = Some(tx);

    let (outbound, _) = broadcast::channel::<String>(256);
    let state = ServeState {
        app: app.clone(),
        outbound,
        clients: Arc::new(AsyncMutex::new(HashSet::new())),
    };
    *serve_state_slot().lock().unwrap() = Some(state.clone());
    RUNNING.store(true, Ordering::SeqCst);

    let router = axum::Router::new()
        .route("/api/remote", get(remote_ws_handler))
        .route("/manga-img", get(manga_img_proxy))
        .fallback(serve_http)
        .with_state(state);

    let generation = SERVE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
        // A server started after this one stopped owns the shared state now; leave it alone.
        if SERVE_GENERATION.load(Ordering::SeqCst) == generation {
            RUNNING.store(false, Ordering::SeqCst);
            *serve_state_slot().lock().unwrap() = None;
        }
    });
    if is_tauri_dev() {
        eprintln!(
            "[web-serve] Harbor remote WS on 0.0.0.0:{} (UI proxied from {})",
            WEB_PORT, DEV_FRONTEND
        );
    } else {
        eprintln!(
            "[web-serve] Harbor web UI + remote WS listening on 0.0.0.0:{}",
            WEB_PORT
        );
    }
    Ok(WEB_PORT)
}

#[tauri::command]
pub fn web_serve_stop() {
    if let Some(tx) = shutdown_slot().lock().unwrap().take() {
        let _ = tx.send(());
    }
    *serve_state_slot().lock().unwrap() = None;
    RUNNING.store(false, Ordering::SeqCst);
}

#[tauri::command]
pub fn web_serve_status() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// Push a JSON text frame to every connected remote client.
#[tauri::command]
pub fn remote_ws_broadcast(payload: String) -> Result<(), String> {
    let guard = serve_state_slot().lock().unwrap();
    let Some(state) = guard.as_ref() else {
        return Ok(());
    };
    let _ = state.outbound.send(payload);
    Ok(())
}

#[tauri::command]
pub async fn remote_ws_client_count() -> Result<usize, String> {
    let state = {
        let guard = serve_state_slot().lock().unwrap();
        guard.clone()
    };
    let Some(state) = state else {
        return Ok(0);
    };
    let count = state.clients.lock().await.len();
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::{generate_token, is_valid_token, key_matches, outbound_allowed_unauthed, query_key};

    const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn query_key_reads_k_among_other_params() {
        assert_eq!(query_key(Some("k=abc")), Some("abc".to_string()));
        assert_eq!(query_key(Some("x=1&k=a%62c&y=2")), Some("abc".to_string()));
        assert_eq!(query_key(Some("kk=abc&key=1")), None);
        assert_eq!(query_key(Some("")), None);
        assert_eq!(query_key(None), None);
    }

    #[test]
    fn key_matches_only_the_exact_token() {
        assert!(key_matches(Some(TOKEN), TOKEN));
        assert!(!key_matches(None, TOKEN));
        assert!(!key_matches(Some(""), TOKEN));
        assert!(!key_matches(Some(&TOKEN[..63]), TOKEN));
        let mut wrong = TOKEN.to_string();
        wrong.replace_range(63..64, "0");
        assert!(!key_matches(Some(&wrong), TOKEN));
        assert!(!key_matches(Some(TOKEN), ""));
    }

    #[test]
    fn missing_or_wrong_k_in_the_upgrade_query_is_unauthed() {
        let authed = |q: Option<&str>| key_matches(query_key(q).as_deref(), TOKEN);
        assert!(authed(Some(&format!("k={TOKEN}"))));
        assert!(!authed(None));
        assert!(!authed(Some("k=")));
        assert!(!authed(Some("k=deadbeef")));
        assert!(!authed(Some(&format!("key={TOKEN}"))));
    }

    #[test]
    fn generated_tokens_are_64_hex_and_distinct() {
        let a = generate_token();
        let b = generate_token();
        assert!(is_valid_token(&a));
        assert!(is_valid_token(&b));
        assert_ne!(a, b);
        assert!(!is_valid_token("xyz"));
        assert!(!is_valid_token(&TOKEN.to_uppercase()));
    }

    #[test]
    fn unauthed_sockets_get_no_snapshots() {
        assert!(!outbound_allowed_unauthed(r#"{"t":"snapshot","snapshot":{"tmdbKey":"x"}}"#));
        assert!(outbound_allowed_unauthed(r#"{"t":"hello","proto":1,"server":"harbor-remote"}"#));
        assert!(outbound_allowed_unauthed(r#"{"t":"pong","at":1}"#));
        assert!(outbound_allowed_unauthed(r#"{"t":"harborSetup","proto":1,"offer":null}"#));
        assert!(outbound_allowed_unauthed(r#"{"t":"ack","id":"c1","ok":true}"#));
        assert!(!outbound_allowed_unauthed("not json"));
    }
}

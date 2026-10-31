use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::{oneshot, Mutex as AsyncMutex};

const SOLVER_LABEL: &str = "harbor-cf-solver";
const CF_TTL: Duration = Duration::from_secs(20 * 60);
const CF_RETRY_COOLDOWN: Duration = Duration::from_secs(30 * 60);

fn request_lock() -> &'static AsyncMutex<()> {
    static LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| AsyncMutex::new(()))
}

struct CfEntry {
    cookie: String,
    ua: String,
    at: Instant,
}

fn cf_cache() -> &'static Mutex<HashMap<String, CfEntry>> {
    static C: OnceLock<Mutex<HashMap<String, CfEntry>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn last_ua() -> &'static Mutex<String> {
    static U: OnceLock<Mutex<String>> = OnceLock::new();
    U.get_or_init(|| Mutex::new(String::new()))
}

// Cached (Cookie header, User-Agent) for a host that already cleared a Cloudflare
// challenge in the solver webview. cf_clearance is UA-bound, so both must be replayed
// together, and only for the exact host that solved.
pub fn cf_cached(host: &str) -> Option<(String, String)> {
    let cache = cf_cache().lock().unwrap();
    let e = cache.get(host)?;
    if e.at.elapsed() > CF_TTL {
        return None;
    }
    Some((e.cookie.clone(), e.ua.clone()))
}

pub fn cf_invalidate(host: &str) {
    cf_cache().lock().unwrap().remove(host);
}

fn cf_failures() -> &'static Mutex<HashMap<String, Instant>> {
    static F: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    F.get_or_init(|| Mutex::new(HashMap::new()))
}

fn host_of(url: &str) -> Option<String> {
    Url::parse(url).ok()?.host_str().map(|s| s.to_string())
}

fn cf_in_cooldown(host: &str) -> bool {
    let mut map = cf_failures().lock().unwrap();
    let fresh = map.get(host).map(|at| at.elapsed() < CF_RETRY_COOLDOWN);
    match fresh {
        Some(true) => true,
        Some(false) => {
            map.remove(host);
            false
        }
        None => false,
    }
}

fn cf_note_failure(host: &str) {
    cf_failures()
        .lock()
        .unwrap()
        .insert(host.to_string(), Instant::now());
}

fn cf_clear_failure(host: &str) {
    cf_failures().lock().unwrap().remove(host);
}

/// Must already be on the main thread. Topmost is set before the window is shown
/// because Windows refuses SetForegroundWindow to a process that does not own the
/// current foreground window, which left the check sitting behind Harbor.
fn raise_window(w: &tauri::WebviewWindow) {
    let _ = w.unminimize();
    let _ = w.set_always_on_top(true);
    let _ = w.show();
    let _ = w.set_focus();
}

struct SolverDismiss(AppHandle);

impl Drop for SolverDismiss {
    fn drop(&mut self) {
        if let Some(w) = self.0.get_webview_window(SOLVER_LABEL) {
            let _ = w.set_always_on_top(false);
            let _ = w.hide();
        }
    }
}

fn harvest(app: &AppHandle, url: &str) -> bool {
    let Some(win) = app.get_webview_window(SOLVER_LABEL) else {
        return false;
    };
    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    let Some(host) = parsed.host_str().map(|s| s.to_string()) else {
        return false;
    };
    let ua = last_ua().lock().unwrap().clone();
    if ua.is_empty() {
        return false;
    }
    let cookies = match win.cookies_for_url(parsed) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[cf] cookie read failed: {e}");
            return false;
        }
    };
    let mut parts: Vec<String> = Vec::new();
    for c in cookies {
        let name = c.name();
        if name == "cf_clearance" || name == "__cf_bm" || name.starts_with("cf_chl") {
            parts.push(format!("{}={}", name, c.value()));
        }
    }
    if parts.is_empty() {
        return false;
    }
    let cookie = parts.join("; ");
    cf_cache().lock().unwrap().insert(
        host.clone(),
        CfEntry {
            cookie,
            ua,
            at: Instant::now(),
        },
    );
    eprintln!("[cf] harvested clearance for {}", host);
    true
}

const MAX_RESULT_CHARS: usize = 8 * 1024 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(500);
const SOLVE_TIMEOUT: Duration = Duration::from_secs(90);
const READ_RESULT_EXPR: &str = "window.__harborCfResult || null";

// Remote pages get no IPC, so the script parks its result in a window variable that Rust polls with eval_with_callback.
const INIT_SCRIPT: &str = r#"
(function () {
  if (window.__harborCfBooted) return;
  window.__harborCfBooted = true;
  var MAX = __HARBOR_CF_MAX_CHARS__;
  var done = false;
  function challenged() {
    var t = (document.title || '').toLowerCase();
    if (t.indexOf('just a moment') >= 0 || t.indexOf('attention required') >= 0) return true;
    if (document.getElementById('challenge-running') || document.getElementById('cf-please-wait')) return true;
    if (document.querySelector('#challenge-form, #cf-challenge-running, .cf-turnstile')) return true;
    return false;
  }
  function store(body) {
    var ua = navigator.userAgent || '';
    window.__harborCfResult = body.length > MAX ? { tooLarge: true, ua: ua } : { body: body, ua: ua };
  }
  function report() {
    if (done || challenged()) return;
    done = true;
    fetch(location.href, { credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' } })
      .then(function (r) { return r.text(); })
      .then(function (t) { store(t); })
      .catch(function () { store(document.body ? document.body.innerText || '' : ''); });
  }
  var tries = 0;
  var iv = setInterval(function () {
    tries += 1;
    report();
    if (done || tries > 220) clearInterval(iv);
  }, 400);
  document.addEventListener('DOMContentLoaded', report);
  window.addEventListener('load', report);
})();
"#;

fn init_script() -> String {
    INIT_SCRIPT.replace("__HARBOR_CF_MAX_CHARS__", &MAX_RESULT_CHARS.to_string())
}

#[derive(Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfResult {
    #[serde(default)]
    body: String,
    #[serde(default)]
    ua: String,
    #[serde(default)]
    too_large: bool,
}

// The callback payload is the JSON serialization of READ_RESULT_EXPR; "null" means the page is still challenged.
fn parse_result(payload: &str) -> Result<Option<CfResult>, String> {
    let payload = payload.trim();
    if payload.is_empty() || payload == "null" {
        return Ok(None);
    }
    if payload.len() > MAX_RESULT_CHARS.saturating_mul(6).saturating_add(1024) {
        return Err("cloudflare solver result too large".into());
    }
    let result: Option<CfResult> =
        serde_json::from_str(payload).map_err(|e| format!("cloudflare solver result: {e}"))?;
    match result {
        Some(result) if result.too_large || result.body.len() > MAX_RESULT_CHARS * 4 => {
            Err("cloudflare solver result too large".into())
        }
        other => Ok(other),
    }
}

async fn read_result(win: &tauri::WebviewWindow) -> Result<Option<CfResult>, String> {
    let (tx, rx) = oneshot::channel::<String>();
    let tx = Mutex::new(Some(tx));
    win.eval_with_callback(READ_RESULT_EXPR, move |value| {
        if let Some(tx) = tx.lock().ok().and_then(|mut tx| tx.take()) {
            let _ = tx.send(value);
        }
    })
    .map_err(|e| format!("cloudflare solver eval: {e}"))?;
    match tokio::time::timeout(Duration::from_secs(5), rx).await {
        Ok(Ok(payload)) => parse_result(&payload),
        _ => Ok(None),
    }
}

async fn wait_for_result(app: &AppHandle) -> Result<CfResult, String> {
    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        let win = app
            .get_webview_window(SOLVER_LABEL)
            .ok_or_else(|| "cloudflare solver window closed".to_string())?;
        if let Some(result) = read_result(&win).await? {
            return Ok(result);
        }
    }
}

fn open_solver(app: &AppHandle, url: &str) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(SOLVER_LABEL) {
        eprintln!("[cf] reusing solver window");
        // Clears the previous page's result so a poll before the new page commits cannot return it.
        let _ = existing.eval(format!(
            "window.__harborCfResult = null; window.location.href = {};",
            serde_json::to_string(url).unwrap_or_else(|_| "''".into())
        ));
        let w = existing.clone();
        let _ = app.run_on_main_thread(move || raise_window(&w));
        return Ok(());
    }

    let parsed = Url::parse(url).map_err(|e| format!("url: {e}"))?;
    let app_main = app.clone();
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    app.run_on_main_thread(move || {
        let builder =
            WebviewWindowBuilder::new(&app_main, SOLVER_LABEL, WebviewUrl::External(parsed))
                .title("Harbor · checking source")
                .inner_size(480.0, 640.0)
                .center()
                .resizable(true)
                .decorations(true)
                .shadow(true)
                .focused(true)
                .initialization_script(init_script());
        let built = crate::browser_args::match_main(&app_main, builder).build();
        match built {
            Ok(window) => {
                raise_window(&window);
                eprintln!("[cf] solver window built + shown");
                let _ = tx.send(Ok(()));
            }
            Err(e) => {
                eprintln!("[cf] build FAILED: {e}");
                let _ = tx.send(Err(format!("build: {e}")));
            }
        }
    })
    .map_err(|e| format!("main thread: {e}"))?;
    rx.recv_timeout(Duration::from_secs(8))
        .map_err(|e| format!("build wait: {e}"))?
}

pub async fn cf_fetch(app: AppHandle, url: String) -> Result<String, String> {
    let _guard = request_lock().lock().await;
    let host = host_of(&url);
    if let Some(h) = host.as_deref() {
        if cf_in_cooldown(h) {
            eprintln!("[cf] skipping {}, a recent solve failed", h);
            return Err(format!("cloudflare challenge for {} recently failed", h));
        }
        cf_note_failure(h);
    }
    eprintln!("[cf] solving {}", url);
    open_solver(&app, &url)?;
    let _dismiss = SolverDismiss(app.clone());
    if let Some(w) = app.get_webview_window(SOLVER_LABEL) {
        // Raising a window re-enters the platform event loop. Driving that inline from
        // this async task overflowed the main thread's stack and took the app down, so
        // the raise is handed to the main thread and never blocks the solve.
        let raise = app.run_on_main_thread(move || raise_window(&w));
        if let Err(error) = raise {
            eprintln!("[cf] could not raise solver window: {error}");
        } else {
            eprintln!("[cf] raised solver window to front");
        }
    }

    match tokio::time::timeout(SOLVE_TIMEOUT, wait_for_result(&app)).await {
        Ok(Ok(result)) => {
            eprintln!("[cf] got {} bytes", result.body.len());
            if !result.ua.is_empty() {
                *last_ua().lock().unwrap() = result.ua;
            }
            let cleared = harvest(&app, &url);
            if cleared {
                if let Some(h) = host.as_deref() {
                    cf_clear_failure(h);
                }
            }
            Ok(result.body)
        }
        Ok(Err(error)) => {
            eprintln!("[cf] solve failed for {}: {}", url, error);
            Err(error)
        }
        Err(_) => {
            eprintln!("[cf] TIMEOUT {}", url);
            Err("cloudflare challenge timed out".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{init_script, parse_result, CfResult, MAX_RESULT_CHARS, READ_RESULT_EXPR};

    #[test]
    fn cf_solver_script_stores_result_without_ipc() {
        let script = init_script();
        assert!(!script.contains("__TAURI_INTERNALS__"));
        assert!(!script.contains("__HARBOR_CF_MAX_CHARS__"));
        assert!(script.contains(&format!("var MAX = {MAX_RESULT_CHARS};")));
        assert!(script.contains("window.__harborCfResult ="));
        assert!(READ_RESULT_EXPR.contains("window.__harborCfResult"));
    }

    #[test]
    fn cf_solver_result_pending_until_page_stores_one() {
        assert_eq!(parse_result("null"), Ok(None));
        assert_eq!(parse_result(" "), Ok(None));
    }

    #[test]
    fn cf_solver_result_carries_body_and_user_agent() {
        let parsed = parse_result(r#"{"body":"{\"ok\":true}","ua":"Mozilla/5.0"}"#).unwrap();
        let expected = CfResult { body: r#"{"ok":true}"#.into(), ua: "Mozilla/5.0".into(), too_large: false };
        assert_eq!(parsed, Some(expected));
    }

    #[test]
    fn cf_solver_result_rejects_oversized_or_malformed_payloads() {
        assert!(parse_result(r#"{"tooLarge":true,"ua":"x"}"#).is_err());
        assert!(parse_result("{not json").is_err());
        let huge = format!("\"{}\"", "a".repeat(MAX_RESULT_CHARS * 6 + 2048));
        assert!(parse_result(&huge).is_err());
    }
}

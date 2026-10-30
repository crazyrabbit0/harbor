#[cfg(target_os = "linux")]
use tauri::Emitter;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const BROWSER_LABEL: &str = "harbor-browser";
const CLOSE_SCHEME: &str = "harbor-close";

// Remote pages get no IPC, so Escape navigates to a sentinel URL that on_navigation cancels and turns into a close.
const CHROME_INIT_SCRIPT: &str = r#"
(function () {
  if (window.__harborBrowserBooted) return;
  window.__harborBrowserBooted = true;

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      try { window.location.href = 'harbor-close://now'; } catch (_) {}
    }
  }, true);
})();
"#;

// WebKitGTK can't open stremio:// or a raw manifest.json, so install intents become top-level navigations on_navigation captures.
#[cfg(target_os = "linux")]
const STREMIO_CAPTURE_SCRIPT: &str = r#"
(function () {
  if (window.__harborCaptureBooted) return;
  window.__harborCaptureBooted = true;
  const isInstall = (u) => {
    try {
      const s = String(u);
      return s.indexOf('stremio://') === 0 || /\/manifest\.json(\?|$)/i.test(s);
    } catch (_) { return false; }
  };
  const origOpen = window.open;
  window.open = function (u) {
    if (isInstall(u)) { try { window.location.href = String(u); } catch (_) {} return null; }
    return origOpen ? origOpen.apply(window, arguments) : null;
  };
  document.addEventListener('click', function (e) {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && isInstall(a.getAttribute('href'))) {
      e.preventDefault();
      e.stopPropagation();
      try { window.location.href = a.href || a.getAttribute('href'); } catch (_) {}
    }
  }, true);
})();
"#;

fn is_close_request(url: &Url) -> bool {
    url.scheme() == CLOSE_SCHEME
}

// Runs inside the webview's navigation callback, so the close is dispatched instead of destroying the webview inline.
fn close_browser_later(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(window) = app.get_webview_window(BROWSER_LABEL) {
            let _ = window.close();
        }
    });
}

#[cfg(target_os = "linux")]
fn is_stremio_install(url: &Url) -> bool {
    url.scheme() == "stremio" || url.as_str().contains("/manifest.json")
}

fn allow_navigation(app: &AppHandle, url: &Url) -> bool {
    if is_close_request(url) {
        close_browser_later(app);
        return false;
    }
    #[cfg(target_os = "linux")]
    if is_stremio_install(url) {
        eprintln!("[browser] captured install link: {}", url.as_str());
        let _ = app.emit("harbor://browser-stremio-capture", url.as_str().to_string());
        return false;
    }
    true
}

#[tauri::command]
pub async fn browser_open(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|e| format!("parse url: {}", e))?;

    if let Some(existing) = app.get_webview_window(BROWSER_LABEL) {
        let _ = existing.eval(format!(
            "window.location.href = {};",
            serde_json::to_string(&url).unwrap_or_else(|_| "''".to_string())
        ));
        let _ = existing.set_focus();
        return Ok(());
    }

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;
    let scale = main.scale_factor().unwrap_or(1.0);
    let main_size = main
        .outer_size()
        .map_err(|e| format!("outer_size: {}", e))?
        .to_logical::<f64>(scale);
    let main_pos = main
        .outer_position()
        .map_err(|e| format!("outer_position: {}", e))?
        .to_logical::<f64>(scale);

    let target_w = (main_size.width * 0.82).clamp(820.0, 1280.0);
    let target_h = (main_size.height * 0.88).clamp(560.0, 880.0);
    let target_x = main_pos.x + (main_size.width - target_w) / 2.0;
    let target_y = main_pos.y + (main_size.height - target_h) / 2.0;

    let app_for_window = app.clone();
    #[cfg(target_os = "linux")]
    let init_script = format!("{}\n{}", CHROME_INIT_SCRIPT, STREMIO_CAPTURE_SCRIPT);
    #[cfg(not(target_os = "linux"))]
    let init_script = CHROME_INIT_SCRIPT.to_string();
    // Creating WebView2 inside the UI event loop can deadlock all Harbor windows.
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        eprintln!(
            "[browser] building {} at ({:.0}, {:.0}) size {:.0}x{:.0}",
            BROWSER_LABEL, target_x, target_y, target_w, target_h
        );
        let nav_app = app_for_window.clone();
        let builder =
            WebviewWindowBuilder::new(&app_for_window, BROWSER_LABEL, WebviewUrl::External(parsed))
                .title("Harbor Browser")
                .inner_size(target_w, target_h)
                .position(target_x, target_y)
                .resizable(true)
                .decorations(true)
                .shadow(true)
                .focused(true)
                .initialization_script(&init_script)
                .on_navigation(move |url| allow_navigation(&nav_app, url));

        let result = crate::browser_args::match_main(&app_for_window, builder).build();
        match result {
            Ok(window) => {
                eprintln!("[browser] window built, label={}", window.label());
                let label_owned = BROWSER_LABEL.to_string();
                window.on_window_event(move |event| {
                    eprintln!("[browser/{}] event: {:?}", label_owned, event);
                });
                let _ = window.show();
                let _ = window.set_focus();
                Ok(())
            }
            Err(e) => {
                eprintln!("[browser] BUILD FAILED: {}", e);
                Err(format!("build: {}", e))
            }
        }
    })
    .await
    .map_err(|e| format!("browser window worker: {e}"))?
}

#[tauri::command]
pub async fn browser_close(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(BROWSER_LABEL) {
        let _ = w.close();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_close_request, CHROME_INIT_SCRIPT};
    use tauri::Url;

    #[test]
    fn browser_escape_sentinel_is_a_close_request() {
        let sentinel = CHROME_INIT_SCRIPT
            .split('\'')
            .find(|part| part.contains("://"))
            .expect("init script navigates to a sentinel URL");
        assert!(is_close_request(&Url::parse(sentinel).unwrap()));
        assert!(!CHROME_INIT_SCRIPT.contains("__TAURI_INTERNALS__"));
    }

    #[test]
    fn browser_ordinary_navigation_is_not_a_close_request() {
        for value in ["https://example.com/", "http://harbor-close.example/", "stremio://x/manifest.json"] {
            assert!(!is_close_request(&Url::parse(value).unwrap()), "{value}");
        }
    }
}

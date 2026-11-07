use axum::body::Body;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use std::collections::HashMap;

pub use harbor_shared::cast_types::TranscodeProfile;

// Only a found path is cached, so an ffmpeg installed after launch is still picked up.
static FFMPEG_PATH: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
static FFPROBE_PATH: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

pub fn locate_ffmpeg() -> Option<std::path::PathBuf> {
    if let Some(p) = FFMPEG_PATH.get() {
        return Some(p.clone());
    }
    let found = probe_ffmpeg()?;
    Some(FFMPEG_PATH.get_or_init(|| found).clone())
}

fn probe_ffmpeg() -> Option<std::path::PathBuf> {
    let mut owned: Vec<String> = Vec::new();
    if cfg!(windows) {
        owned.push("ffmpeg.exe".into());
        owned.push("ffmpeg".into());
        // Bundled / dev tree relative to harbor.exe
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                owned.push(dir.join("ffmpeg.exe").to_string_lossy().to_string());
                owned.push(
                    dir.join(r"..\binaries\ffmpeg.exe")
                        .to_string_lossy()
                        .to_string(),
                );
                owned.push(
                    dir.join(r"..\..\binaries\ffmpeg.exe")
                        .to_string_lossy()
                        .to_string(),
                );
                owned.push(
                    dir.join(r"..\..\..\binaries\ffmpeg.exe")
                        .to_string_lossy()
                        .to_string(),
                );
            }
        }
        // Dev tree relative to cwd
        owned.push(r"src-tauri\binaries\ffmpeg.exe".into());
        owned.push(r"binaries\ffmpeg.exe".into());
        // Common manual installs
        for base in [
            r"C:\ffmpeg\bin",
            r"C:\Program Files\ffmpeg\bin",
            r"C:\Program Files (x86)\ffmpeg\bin",
        ] {
            owned.push(format!(r"{base}\ffmpeg.exe"));
        }
        // Chocolatey
        owned.push(r"C:\ProgramData\chocolatey\bin\ffmpeg.exe".into());
        // Scoop (per-user)
        if let Some(home) = std::env::var_os("USERPROFILE") {
            let h = std::path::PathBuf::from(home);
            owned.push(
                h.join(r"scoop\shims\ffmpeg.exe")
                    .to_string_lossy()
                    .to_string(),
            );
            owned.push(
                h.join(r"scoop\apps\ffmpeg\current\bin\ffmpeg.exe")
                    .to_string_lossy()
                    .to_string(),
            );
        }
        // WinGet — installs under %LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*-essentials_build\bin
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let winget = std::path::PathBuf::from(&local).join(r"Microsoft\WinGet\Packages");
            if let Ok(entries) = std::fs::read_dir(&winget) {
                for e in entries.flatten() {
                    if e.file_name()
                        .to_string_lossy()
                        .to_lowercase()
                        .contains("ffmpeg")
                    {
                        if let Ok(subs) = std::fs::read_dir(e.path()) {
                            for s in subs.flatten() {
                                let candidate = s.path().join(r"bin\ffmpeg.exe");
                                if candidate.is_file() {
                                    owned.push(candidate.to_string_lossy().to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    } else if cfg!(target_os = "macos") {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                owned.push(dir.join("ffmpeg").to_string_lossy().to_string());
                owned.push(
                    dir.join("ffmpeg-aarch64-apple-darwin")
                        .to_string_lossy()
                        .to_string(),
                );
                owned.push(
                    dir.join("ffmpeg-x86_64-apple-darwin")
                        .to_string_lossy()
                        .to_string(),
                );
            }
        }
        for p in [
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/opt/local/bin/ffmpeg",
            "ffmpeg",
        ] {
            owned.push(p.into());
        }
    } else {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                owned.push(dir.join("ffmpeg").to_string_lossy().to_string());
                owned.push(
                    dir.join("ffmpeg-x86_64-unknown-linux-gnu")
                        .to_string_lossy()
                        .to_string(),
                );
            }
        }
        for path in crate::binary_lookup::linux_binary_candidates("ffmpeg") {
            owned.push(path.to_string_lossy().into_owned());
        }
    }
    let candidates: Vec<&str> = owned.iter().map(|s| s.as_str()).collect();
    // First pass: try to execute and parse `-version`. Works when PATH+exec
    // permissions are normal.
    for c in &candidates {
        let p = std::path::PathBuf::from(*c);
        let mut cmd = std::process::Command::new(&p);
        cmd.arg("-version");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                return Some(p);
            }
        }
    }
    // Fallback: if the binary exists at a known absolute path and is executable,
    // trust it. Mac apps launched via `open` don't inherit a shell PATH and
    // sometimes can't exec arbitrary binaries to probe them, but ffmpeg will
    // still run fine when actually invoked by the proxy.
    for c in &candidates {
        if !c.starts_with('/') {
            continue;
        }
        let p = std::path::PathBuf::from(*c);
        if !p.exists() {
            continue;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = std::fs::metadata(&p) {
                if meta.permissions().mode() & 0o111 != 0 {
                    eprintln!("[harbor::transcode] ffmpeg execution probe failed but file exists at {p:?} — trusting it");
                    return Some(p);
                }
            }
        }
        #[cfg(not(unix))]
        {
            return Some(p);
        }
    }
    None
}

pub fn ffmpeg_present() -> bool {
    locate_ffmpeg().is_some()
}

pub fn locate_ffprobe() -> Option<std::path::PathBuf> {
    if let Some(p) = FFPROBE_PATH.get() {
        return Some(p.clone());
    }
    let found = probe_ffprobe()?;
    Some(FFPROBE_PATH.get_or_init(|| found).clone())
}

fn probe_ffprobe() -> Option<std::path::PathBuf> {
    let name = if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    };
    if let Some(ffmpeg) = locate_ffmpeg() {
        if let Some(parent) = ffmpeg.parent() {
            let candidate = parent.join(name);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    let mut cmd = std::process::Command::new(name);
    cmd.arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    if matches!(cmd.status(), Ok(s) if s.success()) {
        return Some(std::path::PathBuf::from(name));
    }
    None
}

#[derive(Default, Debug, Clone)]
pub struct ProbedCodecs {
    pub video: Option<String>,
    /// Codec of each audio stream in file order, so `0:a:N` can be judged on its own.
    pub audio: Vec<String>,
}

/// Successful probes by source URL, so the burst of requests a TV makes for one seek skips the 12 s ffprobe.
static PROBE_CACHE: std::sync::Mutex<Option<HashMap<String, ProbedCodecs>>> =
    std::sync::Mutex::new(None);

async fn probe_codecs_cached(url: &str, headers: &HashMap<String, String>) -> ProbedCodecs {
    if let Some(hit) = PROBE_CACHE
        .lock()
        .ok()
        .and_then(|cache| cache.as_ref()?.get(url).cloned())
    {
        return hit;
    }
    let probed = probe_codecs(url, headers).await;
    if probed.video.is_some() {
        if let Ok(mut cache) = PROBE_CACHE.lock() {
            let map = cache.get_or_insert_with(HashMap::new);
            if map.len() >= 32 {
                map.clear();
            }
            map.insert(url.to_string(), probed.clone());
        }
    }
    probed
}

/// The ffmpeg serving one cast session; starting another ends it, so repeated TV requests never stack transcodes.
#[derive(Clone, Default)]
pub struct TranscodeSlot(
    std::sync::Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
);

impl TranscodeSlot {
    /// Whether an ffmpeg started through this slot is still serving; its task holds the receiver until it ends.
    pub fn is_running(&self) -> bool {
        self.0
            .lock()
            .is_ok_and(|current| current.as_ref().is_some_and(|tx| !tx.is_closed()))
    }

    #[cfg(test)]
    pub(crate) fn take_turn_for_test(&self) -> tokio::sync::oneshot::Receiver<()> {
        self.take_turn()
    }

    /// Ends the previous transcode and returns the signal that ends this one.
    fn take_turn(&self) -> tokio::sync::oneshot::Receiver<()> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        if let Ok(mut current) = self.0.lock() {
            if let Some(previous) = current.replace(tx) {
                let _ = previous.send(());
            }
        }
        rx
    }
}

/// Resolves only when a newer request takes the slot; a slot dropped with its session leaves the stream running.
async fn wait_for_newer_request(rx: tokio::sync::oneshot::Receiver<()>) {
    if rx.await.is_err() {
        std::future::pending::<()>().await;
    }
}

pub async fn probe_codecs(url: &str, headers: &HashMap<String, String>) -> ProbedCodecs {
    let Some(ffprobe) = locate_ffprobe() else {
        eprintln!("[harbor::transcode] ffprobe not found, skipping codec probe");
        return ProbedCodecs::default();
    };
    let mut cmd = tokio::process::Command::new(&ffprobe);
    cmd.kill_on_drop(true);
    cmd.arg("-v").arg("error");
    let mut has_ua = false;
    if let Some((_, ua)) = headers
        .iter()
        .find(|(k, _)| k.to_lowercase() == "user-agent")
    {
        cmd.arg("-user_agent").arg(ua);
        has_ua = true;
    }
    if !has_ua {
        cmd.arg("-user_agent").arg(default_ua());
    }
    let mut header_blob = String::new();
    for (k, v) in headers {
        if k.to_lowercase() == "user-agent" {
            continue;
        }
        header_blob.push_str(&format!("{}: {}\r\n", k, v));
    }
    if !header_blob.is_empty() {
        cmd.arg("-headers").arg(header_blob);
    }
    cmd.arg("-analyzeduration")
        .arg("8M")
        .arg("-probesize")
        .arg("8M")
        .arg("-show_entries")
        .arg("stream=codec_name,codec_type")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=0")
        .arg("-i")
        .arg(url);
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let fut = async {
        let output = crate::child_pipe::output(&mut cmd).await.ok()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.trim().is_empty() {
            eprintln!("[harbor::transcode][ffprobe] {}", stderr.trim());
        }
        let mut result = ProbedCodecs::default();
        let mut cur_type: Option<String> = None;
        let mut cur_codec: Option<String> = None;
        for line in stdout.lines() {
            if let Some(v) = line.strip_prefix("codec_name=") {
                cur_codec = Some(v.trim().to_lowercase());
            } else if let Some(t) = line.strip_prefix("codec_type=") {
                cur_type = Some(t.trim().to_lowercase());
            }
            if let (Some(t), Some(c)) = (&cur_type, &cur_codec) {
                match t.as_str() {
                    "video" if result.video.is_none() => result.video = Some(c.clone()),
                    "audio" => result.audio.push(c.clone()),
                    _ => {}
                }
                cur_type = None;
                cur_codec = None;
            }
        }
        Some(result)
    };

    match tokio::time::timeout(std::time::Duration::from_secs(12), fut).await {
        Ok(Some(r)) => r,
        Ok(None) => ProbedCodecs::default(),
        Err(_) => {
            eprintln!("[harbor::transcode] ffprobe timed out");
            ProbedCodecs::default()
        }
    }
}

fn default_ua() -> &'static str {
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

fn scale_filter(max_height: u32) -> String {
    let target_w = match max_height {
        720 => 1280,
        2160 => 3840,
        _ => 1920,
    };
    let target_h = max_height;
    format!(
        "scale='if(gt(ih,{h}),min({w},iw),iw)':'if(gt(ih,{h}),{h},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
        w = target_w,
        h = target_h,
    )
}

/// MPEG-TS as DLNA renderers name it; older Samsung TVs reject video/mp2t.
pub const DLNA_TS_CONTENT_TYPE: &str = "video/mpeg";

pub fn ts_content_type(dlna: bool) -> &'static str {
    if dlna {
        DLNA_TS_CONTENT_TYPE
    } else {
        "video/mp2t"
    }
}

/// The player's chosen audio stream, or every audio stream when none was chosen.
pub fn audio_map(audio_ordinal: Option<u32>) -> String {
    audio_ordinal.map_or_else(|| "0:a?".to_string(), |n| format!("0:a:{n}?"))
}

/// ffmpeg arguments that start the input at `start_sec`; empty for the beginning.
fn input_seek_args(start_sec: f64) -> Vec<String> {
    if start_sec > 0.5 {
        vec!["-ss".to_string(), format!("{start_sec:.3}")]
    } else {
        Vec::new()
    }
}

pub async fn handle_transcode(
    url: &str,
    headers: &HashMap<String, String>,
    profile: &TranscodeProfile,
    burn_sub: Option<&(String, String)>,
    audio_ordinal: Option<u32>,
    start_sec: f64,
    sub_offset: f64,
    content_type: &'static str,
    duration: Option<f64>,
    slot: Option<&TranscodeSlot>,
) -> Response {
    let ffmpeg = match locate_ffmpeg() {
        Some(p) => p,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "ffmpeg not found. Install ffmpeg to transcode for this device.",
            )
                .into_response();
        }
    };

    let superseded = slot.map(TranscodeSlot::take_turn);
    let probed = probe_codecs_cached(url, headers).await;
    eprintln!(
        "[harbor::transcode] probed: video={:?} audio={:?}",
        probed.video, probed.audio
    );

    let video_is_h264 = probed.video.as_deref() == Some("h264");
    let audio_is_aac = probed
        .audio
        .get(audio_ordinal.unwrap_or(0) as usize)
        .map(String::as_str)
        == Some("aac");
    let reencode_video = profile.force_h264 || !video_is_h264 || burn_sub.is_some();
    let reencode_audio = profile.force_aac || !audio_is_aac;
    eprintln!(
        "[harbor::transcode] plan: reencode_video={} reencode_audio={}",
        reencode_video, reencode_audio
    );

    let mut cmd = tokio::process::Command::new(&ffmpeg);
    cmd.arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-fflags")
        .arg("+genpts+nobuffer+discardcorrupt")
        .arg("-flags")
        .arg("low_delay")
        .arg("-reconnect")
        .arg("1")
        .arg("-reconnect_streamed")
        .arg("1")
        .arg("-reconnect_on_network_error")
        .arg("1")
        .arg("-reconnect_on_http_error")
        .arg("5xx,4xx")
        .arg("-reconnect_delay_max")
        .arg("8");

    let mut has_ua = false;
    if let Some((_, ua)) = headers
        .iter()
        .find(|(k, _)| k.to_lowercase() == "user-agent")
    {
        cmd.arg("-user_agent").arg(ua);
        has_ua = true;
    }
    if !has_ua {
        cmd.arg("-user_agent").arg(default_ua());
    }
    let mut header_blob = String::new();
    for (k, v) in headers {
        if k.to_lowercase() == "user-agent" {
            continue;
        }
        header_blob.push_str(&format!("{}: {}\r\n", k, v));
    }
    if !header_blob.is_empty() {
        cmd.arg("-headers").arg(header_blob);
    }

    cmd.arg("-analyzeduration")
        .arg("8M")
        .arg("-probesize")
        .arg("8M")
        .args(input_seek_args(start_sec))
        .arg("-i")
        .arg(url)
        .arg("-map")
        .arg("0:v?")
        .arg("-map")
        .arg(audio_map(audio_ordinal));

    if reencode_video {
        let mut vf = scale_filter(profile.max_height);
        if let Some((path, force_style)) = burn_sub {
            vf.push(',');
            vf.push_str(&subtitle_filter(path, force_style, sub_offset));
            eprintln!("[harbor::transcode] subtitle burn-in filter: {}", vf);
        }
        cmd.arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("veryfast")
            .arg("-crf")
            .arg("22")
            .arg("-profile:v")
            .arg("high")
            .arg("-level")
            .arg("4.1")
            .arg("-pix_fmt")
            .arg("yuv420p")
            .arg("-g")
            .arg("60")
            .arg("-sc_threshold")
            .arg("0")
            .arg("-vf")
            .arg(&vf);
        if let Some(kbps) = profile.max_video_kbps {
            cmd.arg("-maxrate")
                .arg(format!("{}k", kbps))
                .arg("-bufsize")
                .arg(format!("{}k", kbps * 2));
        }
    } else {
        cmd.arg("-c:v")
            .arg("copy")
            .arg("-bsf:v")
            .arg("h264_mp4toannexb");
    }

    if reencode_audio {
        cmd.arg("-c:a").arg("aac").arg("-b:a").arg("192k");
        if profile.force_stereo {
            cmd.arg("-ac").arg("2");
        }
    } else {
        cmd.arg("-c:a").arg("copy");
    }

    cmd.arg("-f")
        .arg("mpegts")
        .arg("-mpegts_flags")
        .arg("+resend_headers+initial_discontinuity")
        .arg("-mpegts_copyts")
        .arg("1")
        .arg("pipe:1");

    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    // Log the full command so we can debug what ffmpeg is being asked to do.
    let args_dbg: Vec<String> = cmd
        .as_std()
        .get_args()
        .map(|a| a.to_string_lossy().to_string())
        .collect();
    eprintln!(
        "[harbor::transcode] spawning: {:?} {}",
        ffmpeg,
        args_dbg.join(" ")
    );

    crate::proc_guard::configure_command(&mut cmd);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[harbor::transcode] spawn failed: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("ffmpeg spawn failed: {}", e),
            )
                .into_response();
        }
    };
    crate::proc_guard::adopt(&child);

    let stdout = match crate::child_pipe::take_stdout(&mut child) {
        Some(s) => s,
        None => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "ffmpeg stdout missing").into_response();
        }
    };

    // Drain ffmpeg's stderr line-by-line so users see what's happening / what
    // went wrong. Crucial for diagnosing "video doesn't appear" on the cast device.
    if let Some(stderr) = crate::child_pipe::take_stderr(&mut child) {
        tokio::spawn(async move {
            use tokio::io::AsyncBufReadExt;
            let mut reader = tokio::io::BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                eprintln!("[harbor::transcode][ffmpeg] {line}");
            }
        });
    }

    tokio::spawn(async move {
        let superseded = async {
            match superseded {
                Some(rx) => wait_for_newer_request(rx).await,
                None => std::future::pending::<()>().await,
            }
        };
        tokio::select! {
            status = child.wait() => match status {
                Ok(status) => eprintln!("[harbor::transcode] ffmpeg exited: {status}"),
                Err(e) => eprintln!("[harbor::transcode] ffmpeg wait err: {e}"),
            },
            _ = superseded => {
                eprintln!("[harbor::transcode] a newer request replaced this transcode; stopping ffmpeg");
                let _ = child.kill().await;
            }
        }
    });

    let reader = tokio_util::io::ReaderStream::with_capacity(stdout, 64 * 1024);
    transcode_response(Body::from_stream(reader), content_type, duration)
}

/// The burn-in filter; `sub_offset` lines an unshifted subtitle file up with an input that starts that far in.
fn subtitle_filter(path: &str, force_style: &str, sub_offset: f64) -> String {
    let burn = crate::cast_subs::burn_filter(path, force_style);
    if sub_offset > 0.0 {
        format!("setpts=PTS+{sub_offset:.3}/TB,{burn},setpts=PTS-STARTPTS")
    } else {
        burn
    }
}

/// A HEAD answer for a transcode: no data and no length, like the live GET, since `Content-Length: 0` reads as an empty file.
pub fn unknown_length_body() -> Body {
    Body::from_stream(futures_util::stream::empty::<
        Result<axum::body::Bytes, std::io::Error>,
    >())
}

/// The start a DLNA `TimeSeekRange.dlna.org` request asks for: `npt=123.4-` or `npt=0:02:03.4-...`.
pub fn requested_npt_start(value: &str) -> Option<f64> {
    let range = value.trim().strip_prefix("npt=")?;
    let start = range.split('-').next()?.trim();
    if start.contains(':') {
        let mut total = 0.0;
        for part in start.split(':') {
            total = total * 60.0 + part.parse::<f64>().ok()?;
        }
        Some(total)
    } else {
        start.parse::<f64>().ok()
    }
    .filter(|s| s.is_finite() && *s >= 0.0)
}

/// `TimeSeekRange.dlna.org` answer for a stream served from `start` of a `duration`-long title.
pub fn npt_range(start: f64, duration: f64) -> String {
    format!("npt={start:.3}-{duration:.3}/{duration:.3}")
}

/// MPEG-TS transcode headers; a known `duration` advertises time-seek (`DLNA.ORG_OP=10`), which a TV remote needs to seek.
pub fn transcode_response(
    body: Body,
    content_type: &'static str,
    duration: Option<f64>,
) -> Response {
    let mut hmap = HeaderMap::new();
    hmap.insert("Content-Type", HeaderValue::from_static(content_type));
    hmap.insert("Cache-Control", HeaderValue::from_static("no-cache"));
    hmap.insert("Connection", HeaderValue::from_static("close"));
    hmap.insert(
        "transferMode.dlna.org",
        HeaderValue::from_static("Streaming"),
    );
    hmap.insert(
        "contentFeatures.dlna.org",
        HeaderValue::from_static(if duration.is_some() {
            "DLNA.ORG_PN=MPEG_TS;DLNA.ORG_OP=10;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000"
        } else {
            "DLNA.ORG_PN=MPEG_TS;DLNA.ORG_OP=00;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000"
        }),
    );

    let mut resp = Response::builder().status(StatusCode::OK);
    if let Some(h) = resp.headers_mut() {
        h.extend(hmap);
    }
    resp.body(body).unwrap_or_else(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "response build failed").into_response()
    })
}

#[tauri::command]
pub async fn cast_ffmpeg_present() -> bool {
    tauri::async_runtime::spawn_blocking(ffmpeg_present)
        .await
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dlna_streams_are_labelled_video_mpeg() {
        assert_eq!(ts_content_type(true), "video/mpeg");
        assert_eq!(ts_content_type(false), "video/mp2t");
        let response = transcode_response(Body::empty(), ts_content_type(true), None);
        assert_eq!(response.headers()["content-type"], "video/mpeg");
        assert_eq!(response.headers()["transferMode.dlna.org"], "Streaming");
    }

    #[test]
    fn a_head_answer_declares_no_length() {
        use axum::body::HttpBody;
        assert_eq!(unknown_length_body().size_hint().exact(), None);
        let response = transcode_response(unknown_length_body(), ts_content_type(true), None);
        assert!(response.headers().get("content-length").is_none());
    }

    #[test]
    fn only_a_stream_of_known_length_offers_time_seek() {
        let features = |d| {
            transcode_response(Body::empty(), ts_content_type(true), d).headers()
                ["contentFeatures.dlna.org"]
                .to_str()
                .unwrap()
                .to_string()
        };
        assert!(features(Some(5400.0)).contains("DLNA.ORG_OP=10;"));
        assert!(features(None).contains("DLNA.ORG_OP=00;"));
    }

    #[test]
    fn reads_the_start_of_a_time_seek_request() {
        assert_eq!(requested_npt_start("npt=754.5-"), Some(754.5));
        assert_eq!(requested_npt_start("npt=0:12:34.500-1:30:00"), Some(754.5));
        assert_eq!(requested_npt_start(" npt=01:00:00- "), Some(3600.0));
        assert_eq!(requested_npt_start("npt=now-"), None);
        assert_eq!(requested_npt_start("bytes=0-"), None);
        assert_eq!(npt_range(754.5, 5400.0), "npt=754.500-5400.000/5400.000");
    }

    #[test]
    fn an_unshifted_subtitle_follows_a_seeked_input() {
        let shifted = subtitle_filter("C:/s.srt", "Fontsize=11", 754.5);
        assert!(
            shifted.starts_with("setpts=PTS+754.500/TB,subtitles="),
            "{shifted}"
        );
        assert!(shifted.ends_with(",setpts=PTS-STARTPTS"), "{shifted}");
        assert!(subtitle_filter("C:/s.srt", "Fontsize=11", 0.0).starts_with("subtitles="));
    }

    #[test]
    fn the_chosen_audio_track_is_the_only_one_mapped() {
        assert_eq!(audio_map(Some(2)), "0:a:2?");
        assert_eq!(audio_map(None), "0:a?");
    }

    #[test]
    fn a_slot_counts_as_running_only_while_its_ffmpeg_task_lives() {
        let slot = TranscodeSlot::default();
        assert!(!slot.is_running(), "nothing started yet");
        let ffmpeg = slot.take_turn();
        assert!(slot.is_running());
        drop(ffmpeg);
        assert!(!slot.is_running(), "the task ended with ffmpeg");
    }

    #[tokio::test]
    async fn a_session_dropped_with_its_slot_leaves_the_stream_running() {
        let slot = TranscodeSlot::default();
        let wait = wait_for_newer_request(slot.take_turn());
        drop(slot);
        let outcome = tokio::time::timeout(std::time::Duration::from_millis(50), wait).await;
        assert!(outcome.is_err(), "a dropped slot must not stop ffmpeg");
    }

    #[test]
    fn a_new_transcode_request_ends_the_previous_one() {
        let slot = TranscodeSlot::default();
        let mut first = slot.take_turn();
        assert!(first.try_recv().is_err());
        let mut second = slot.take_turn();
        assert_eq!(first.try_recv(), Ok(()));
        assert!(second.try_recv().is_err());
    }

    #[test]
    fn a_transcode_starts_at_the_resume_point() {
        assert_eq!(input_seek_args(754.25), vec!["-ss", "754.250"]);
        assert!(input_seek_args(0.0).is_empty());
        assert!(
            input_seek_args(0.3).is_empty(),
            "a near-zero resume plays from the start"
        );
    }
}

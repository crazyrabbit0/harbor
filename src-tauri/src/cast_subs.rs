use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

pub use harbor_shared::cast_types::{CastSub, CastSubStyle, PreparedSub};

fn hex_to_ass_bgr(hex: &str) -> String {
    let clean = hex.trim().trim_start_matches('#');
    let parsed = if clean.len() == 6 {
        u32::from_str_radix(clean, 16).ok()
    } else if clean.len() == 3 {
        let r = &clean[0..1];
        let g = &clean[1..2];
        let b = &clean[2..3];
        u32::from_str_radix(&format!("{r}{r}{g}{g}{b}{b}"), 16).ok()
    } else {
        None
    };
    match parsed {
        Some(rgb) => {
            let r = (rgb >> 16) & 0xFF;
            let g = (rgb >> 8) & 0xFF;
            let b = rgb & 0xFF;
            format!("&H00{:02X}{:02X}{:02X}", b, g, r)
        }
        None => "&H00FFFFFF".to_string(),
    }
}

fn ass_alignment(align_x: &str) -> u32 {
    match align_x.to_lowercase().as_str() {
        "left" => 1,
        "right" => 3,
        _ => 2,
    }
}

/// libass lays out an SRT on a 288-line script, while the player's sizes are on mpv's 720-line scale.
const SRT_PLAY_RES_Y: u32 = 288;
const MPV_SUB_RES_Y: u32 = 720;

/// `on_srt_canvas` scales sizes to libass's SRT canvas; an ASS file keeps its own script resolution.
pub fn build_force_style(style: &CastSubStyle, on_srt_canvas: bool) -> String {
    let scale = |v: u32| {
        if on_srt_canvas {
            v * SRT_PLAY_RES_Y / MPV_SUB_RES_Y
        } else {
            v
        }
    };
    let primary = hex_to_ass_bgr(&style.font_color);
    let outline_color = hex_to_ass_bgr(&style.border_color);
    let outline = if style.border_size == 0 {
        2
    } else {
        scale(style.border_size).max(1)
    };
    let alignment = ass_alignment(&style.align_x);
    format!(
        "Fontsize={},PrimaryColour={},OutlineColour={},BorderStyle=1,Outline={},Shadow=0,Alignment={},MarginV={}",
        scale(style.font_size).max(8),
        primary,
        outline_color,
        outline,
        alignment,
        scale(style.margin_y),
    )
}

fn is_ass_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("ass") || e.eq_ignore_ascii_case("ssa"))
}

pub fn burn_filter(path: &str, force_style: &str) -> String {
    let escaped = escape_subtitles_path(Path::new(path));
    format!("subtitles={}:force_style='{}'", escaped, force_style)
}

pub fn escape_subtitles_path(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let drive_fixed = if raw.len() >= 2 && raw.as_bytes()[1] == b':' {
        let (drive, rest) = raw.split_at(1);
        format!("{}\\:{}", drive, &rest[1..])
    } else {
        raw
    };
    drive_fixed.replace('\'', "\\'")
}

fn castsubs_dir() -> PathBuf {
    let dir = std::env::temp_dir().join("harbor-castsubs");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn sniff_format(url: &str, content_type: Option<&str>, declared: Option<&str>) -> String {
    if let Some(fmt) = declared {
        let f = fmt.to_lowercase();
        if f == "srt" || f == "ass" || f == "ssa" || f == "vtt" {
            return f;
        }
    }
    let lower = url.to_lowercase();
    if lower.ends_with(".vtt") || content_type.is_some_and(|c| c.contains("vtt")) {
        return "vtt".to_string();
    }
    if lower.ends_with(".ass") || lower.ends_with(".ssa") {
        return "ass".to_string();
    }
    "srt".to_string()
}

async fn download_remote(url: &str, declared_format: Option<&str>, dir: &Path) -> Option<PathBuf> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .gzip(true)
        .build()
        .ok()?;
    let res = client
        .get(url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        )
        .header("Accept", "*/*")
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let ct = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_lowercase());
    let fmt = sniff_format(url, ct.as_deref(), declared_format);
    let raw = res.bytes().await.ok()?;
    let bytes: Vec<u8> = if raw.len() >= 2 && raw[0] == 0x1f && raw[1] == 0x8b {
        let mut decoder = flate2::read::GzDecoder::new(&raw[..]);
        let mut decoded = Vec::with_capacity(raw.len() * 4);
        decoder.read_to_end(&mut decoded).ok()?;
        decoded
    } else {
        raw.to_vec()
    };
    let raw_path = dir.join(format!("{}.{}", Uuid::new_v4(), fmt));
    std::fs::write(&raw_path, &bytes).ok()?;
    if fmt == "vtt" {
        convert_to_srt(&raw_path, dir).await
    } else {
        Some(raw_path)
    }
}

fn is_http_url(s: &str) -> bool {
    let lower = s.to_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

async fn prepare_local(path: &str, declared_format: Option<&str>, dir: &Path) -> Option<PathBuf> {
    let src = PathBuf::from(path);
    if !src.is_file() {
        return None;
    }
    let fmt = sniff_format(path, None, declared_format);
    if fmt == "vtt" {
        convert_to_srt(&src, dir).await
    } else {
        Some(src)
    }
}

async fn convert_to_srt(input: &Path, dir: &Path) -> Option<PathBuf> {
    let ffmpeg = crate::transcode::locate_ffmpeg()?;
    let out = dir.join(format!("{}.srt", Uuid::new_v4()));
    let mut cmd = tokio::process::Command::new(&ffmpeg);
    cmd.kill_on_drop(true);
    cmd.arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-i")
        .arg(input)
        .arg(&out);
    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000);
    }
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let status = cmd.status().await.ok()?;
    if status.success() && out.is_file() {
        Some(out)
    } else {
        None
    }
}

async fn extract_embedded(
    source_url: &str,
    src_index: u32,
    headers: &HashMap<String, String>,
    dir: &Path,
) -> Option<PathBuf> {
    let ffmpeg = crate::transcode::locate_ffmpeg()?;
    let out = dir.join(format!("{}.srt", Uuid::new_v4()));
    let mut cmd = tokio::process::Command::new(&ffmpeg);
    cmd.kill_on_drop(true);
    cmd.arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y");
    apply_ffmpeg_headers(&mut cmd, headers);
    cmd.arg("-i")
        .arg(source_url)
        .arg("-map")
        .arg(format!("0:s:{}", src_index))
        .arg("-c:s")
        .arg("srt")
        .arg(&out);
    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000);
    }
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let status = cmd.status().await.ok()?;
    if status.success() && out.is_file() {
        Some(out)
    } else {
        None
    }
}

fn apply_ffmpeg_headers(cmd: &mut tokio::process::Command, headers: &HashMap<String, String>) {
    for (k, v) in headers {
        if k.to_lowercase() == "user-agent" {
            cmd.arg("-user_agent").arg(v);
        }
    }
    let mut blob = String::new();
    for (k, v) in headers {
        if k.to_lowercase() == "user-agent" {
            continue;
        }
        blob.push_str(&format!("{}: {}\r\n", k, v));
    }
    if !blob.is_empty() {
        cmd.arg("-headers").arg(blob);
    }
}

pub async fn prepare(
    sub: &CastSub,
    style: &CastSubStyle,
    source_url: &str,
    headers: &HashMap<String, String>,
    seek_start: f64,
) -> Option<PreparedSub> {
    if sub.off {
        return None;
    }
    let dir = castsubs_dir();
    let base = match sub.kind.as_str() {
        "external" => {
            let url = sub.url.as_deref()?;
            if is_http_url(url) {
                download_remote(url, sub.format.as_deref(), &dir).await?
            } else {
                prepare_local(url, sub.format.as_deref(), &dir).await?
            }
        }
        "embedded" => {
            let idx = sub.src_index?;
            extract_embedded(source_url, idx, headers, &dir).await?
        }
        _ => return None,
    };
    Some(prepare_from(base, style, seek_start).await)
}

/// Burn-in subtitle for a transcode starting at `seek_start`, from the unshifted file `prepare` produced.
pub async fn prepare_from(base: PathBuf, style: &CastSubStyle, seek_start: f64) -> PreparedSub {
    let path = if seek_start > 1.0 {
        shift_subtitle(&base, seek_start, &castsubs_dir())
            .await
            .unwrap_or_else(|| base.clone())
    } else {
        base.clone()
    };
    let force_style = build_force_style(style, !is_ass_file(&path));
    PreparedSub {
        path,
        base,
        force_style,
    }
}

async fn shift_subtitle(input: &Path, seek_start: f64, dir: &Path) -> Option<PathBuf> {
    let ffmpeg = crate::transcode::locate_ffmpeg()?;
    let out = dir.join(format!("{}.srt", Uuid::new_v4()));
    let mut cmd = tokio::process::Command::new(&ffmpeg);
    cmd.kill_on_drop(true);
    // An input -ss on a subtitle file snaps back to the cue before the target, delaying every line; seek the output instead.
    cmd.arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-i")
        .arg(input)
        .arg("-ss")
        .arg(format!("{:.3}", seek_start))
        .arg("-output_ts_offset")
        .arg(format!("-{:.3}", seek_start))
        .arg("-c:s")
        .arg("srt")
        .arg(&out);
    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000);
    }
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let status = cmd.status().await.ok()?;
    if status.success() && out.is_file() {
        Some(out)
    } else {
        None
    }
}

pub fn cleanup() {
    let _ = std::fs::remove_dir_all(castsubs_dir());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn srt_burn_in_matches_the_player_size() {
        let style = CastSubStyle {
            font_size: 40,
            margin_y: 50,
            border_size: 5,
            ..CastSubStyle::default()
        };
        let srt = build_force_style(&style, true);
        assert!(srt.starts_with("Fontsize=16,"), "{srt}");
        assert!(
            srt.contains(",Outline=2,") && srt.ends_with(",MarginV=20"),
            "{srt}"
        );
        let ass = build_force_style(&style, false);
        assert!(
            ass.starts_with("Fontsize=40,") && ass.ends_with(",MarginV=50"),
            "{ass}"
        );
        let tiny = CastSubStyle {
            font_size: 10,
            ..CastSubStyle::default()
        };
        assert!(build_force_style(&tiny, true).starts_with("Fontsize=8,"));
    }

    #[tokio::test]
    async fn a_shifted_subtitle_keeps_each_line_at_its_own_time() {
        if crate::transcode::locate_ffmpeg().is_none() {
            eprintln!("ffmpeg not found; skipping the subtitle shift check");
            return;
        }
        let dir = std::env::temp_dir().join(format!("harbor-shift-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.srt");
        // A gap before the target: the old input seek snapped back to the 37:40 cue and delayed this line by 18 s.
        std::fs::write(
            &input,
            "1\n00:37:40,969 --> 00:37:43,790\nEarlier\n\n2\n00:38:06,429 --> 00:38:08,668\nTarget\n",
        )
        .unwrap();
        let out = shift_subtitle(&input, 2279.36, &dir)
            .await
            .expect("shifted file");
        let text = std::fs::read_to_string(&out).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert!(
            text.contains("00:00:07,069 --> 00:00:09,308\nTarget"),
            "{text}"
        );
        assert!(!text.contains("Earlier"), "{text}");
    }

    #[test]
    fn only_ass_files_keep_their_own_canvas() {
        assert!(is_ass_file(Path::new("a/b.ASS")));
        assert!(is_ass_file(Path::new("x.ssa")));
        assert!(!is_ass_file(Path::new("x.srt")));
    }
}

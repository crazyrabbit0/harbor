//! Cast payloads shared by the app's stream proxy and the `harbor-cast` crate.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Clone, Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct TranscodeProfile {
    #[serde(default = "default_max_height")]
    pub max_height: u32,
    #[serde(default)]
    pub force_h264: bool,
    #[serde(default)]
    pub force_aac: bool,
    #[serde(default)]
    pub force_stereo: bool,
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub max_video_kbps: Option<u32>,
}

impl Default for TranscodeProfile {
    fn default() -> Self {
        TranscodeProfile {
            max_height: 1080,
            force_h264: true,
            force_aac: true,
            force_stereo: true,
            max_video_kbps: Some(6000),
        }
    }
}

fn default_max_height() -> u32 {
    1080
}

#[derive(Clone, Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct CastSub {
    #[cfg_attr(feature = "ts", ts(type = r#""external" | "embedded""#))]
    pub kind: String,
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub url: Option<String>,
    #[serde(default)]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub src_index: Option<u32>,
    #[serde(default)]
    #[cfg_attr(
        feature = "ts",
        ts(optional, type = r#""srt" | "ass" | "ssa" | "vtt""#)
    )]
    pub format: Option<String>,
    #[serde(default)]
    pub off: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct CastSubStyle {
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default = "default_white")]
    pub font_color: String,
    #[serde(default = "default_black")]
    pub border_color: String,
    #[serde(default)]
    pub border_size: u32,
    #[serde(default = "default_margin")]
    pub margin_y: u32,
    #[serde(default = "default_align")]
    #[cfg_attr(feature = "ts", ts(type = r#""left" | "center" | "right""#))]
    pub align_x: String,
}

fn default_font_size() -> u32 {
    28
}

fn default_white() -> String {
    "#FFFFFF".to_string()
}

fn default_black() -> String {
    "#000000".to_string()
}

fn default_margin() -> u32 {
    12
}

fn default_align() -> String {
    "center".to_string()
}

impl Default for CastSubStyle {
    fn default() -> Self {
        CastSubStyle {
            font_size: default_font_size(),
            font_color: default_white(),
            border_color: default_black(),
            border_size: 0,
            margin_y: default_margin(),
            align_x: default_align(),
        }
    }
}

pub struct PreparedSub {
    pub path: PathBuf,
    /// The file before any shift, so a seek can re-prepare it for a new start.
    pub base: PathBuf,
    pub force_style: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AudioCastFormat {
    Mp3,
}
impl AudioCastFormat {
    pub fn mime(self) -> &'static str {
        match self {
            Self::Mp3 => "audio/mpeg",
        }
    }
}

#[derive(Clone)]
pub struct AudioCastInput {
    pub url: String,
    pub headers: HashMap<String, String>,
    pub audio_ordinal: u32,
    pub start_seconds: f64,
    pub format: AudioCastFormat,
    pub title: Option<String>,
    pub target_host: String,
}

#[derive(Serialize)]
pub struct RegisterResult {
    pub session_id: String,
    pub url: String,
    /// Set for a DLNA transcode the proxy can time-seek: the length of the stream it serves, from its start.
    #[serde(skip)]
    pub seekable_sec: Option<f64>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterArgs {
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub transcode: bool,
    #[serde(default)]
    pub prebuffer_bytes: Option<usize>,
    #[serde(default)]
    pub profile: Option<TranscodeProfile>,
    #[serde(default)]
    pub target_host: Option<String>,
    #[serde(default)]
    pub start_time_sec: Option<f64>,
    #[serde(default)]
    pub burn_sub_path: Option<String>,
    #[serde(default)]
    pub burn_sub_style: Option<String>,
    /// The player's embedded audio stream (`0:a:N`); every stream when absent.
    #[serde(default)]
    pub audio_ordinal: Option<u32>,
    /// DLNA renderers get one MPEG-TS stream as video/mpeg; many (2014 Samsung) reject HLS and video/mp2t.
    #[serde(default)]
    pub dlna: bool,
}

/// The embedded audio stream a cast keeps: the player's track, or the first, since a receiver given several plays whichever it likes.
pub fn cast_audio_ordinal(chosen: Option<u32>) -> u32 {
    chosen.unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cast_keeps_the_players_audio_track_or_the_first() {
        assert_eq!(cast_audio_ordinal(Some(2)), 2);
        assert_eq!(cast_audio_ordinal(None), 0);
    }
}

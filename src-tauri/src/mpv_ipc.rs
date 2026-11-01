//! Wire types shared with the frontend, exported to src/lib/generated/mpv-ipc.ts by the `export_bindings` test.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

/// One `mpv://event` payload; the frontend reducer is `reduceMpvEvent` in src/lib/player/mpv-events.ts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "event", rename_all = "kebab-case")]
pub enum MpvEvent {
    PropertyChange {
        name: String,
        #[ts(type = "unknown")]
        data: Value,
    },
    EndFile {
        reason: EndFileReason,
    },
    FileLoaded,
    PlaybackRestart,
    Seek,
    Shutdown,
    Log {
        prefix: String,
        level: String,
        text: String,
    },
    PlayerFailure {
        reason: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum EndFileReason {
    Eof,
    Stop,
    Quit,
    Error,
    Redirect,
    Other,
}

impl EndFileReason {
    pub fn from_mpv(code: u32) -> Self {
        match code {
            0 => Self::Eof,
            2 => Self::Stop,
            3 => Self::Quit,
            4 => Self::Error,
            5 => Self::Redirect,
            _ => Self::Other,
        }
    }
}

impl MpvEvent {
    pub fn to_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;

    #[test]
    fn payloads_keep_the_wire_shape() {
        let cases = [
            (
                MpvEvent::PropertyChange {
                    name: "pause".into(),
                    data: json!(true),
                },
                json!({ "event": "property-change", "name": "pause", "data": true }),
            ),
            (
                MpvEvent::EndFile {
                    reason: EndFileReason::from_mpv(0),
                },
                json!({ "event": "end-file", "reason": "eof" }),
            ),
            (
                MpvEvent::EndFile {
                    reason: EndFileReason::from_mpv(1),
                },
                json!({ "event": "end-file", "reason": "other" }),
            ),
            (MpvEvent::FileLoaded, json!({ "event": "file-loaded" })),
            (
                MpvEvent::PlaybackRestart,
                json!({ "event": "playback-restart" }),
            ),
            (MpvEvent::Seek, json!({ "event": "seek" })),
            (MpvEvent::Shutdown, json!({ "event": "shutdown" })),
            (
                MpvEvent::Log {
                    prefix: "cplayer".into(),
                    level: "error".into(),
                    text: "x".into(),
                },
                json!({ "event": "log", "prefix": "cplayer", "level": "error", "text": "x" }),
            ),
            (
                MpvEvent::PlayerFailure {
                    reason: "persistent-event-errors".into(),
                },
                json!({ "event": "player-failure", "reason": "persistent-event-errors" }),
            ),
        ];
        for (event, expected) in cases {
            assert_eq!(event.to_value(), expected);
        }
    }

    fn bindings() -> String {
        let cfg = ts_rs::Config::default();
        let decls = [
            crate::mpv::MpvProbe::decl(&cfg),
            crate::mpv::AudioDevice::decl(&cfg),
            crate::mpv::MpvSub::decl(&cfg),
            crate::mpv::MpvGeometry::decl(&cfg),
            crate::monitors::MonitorInfo::decl(&cfg),
            crate::mpv::MpvStartArgs::decl(&cfg),
            EndFileReason::decl(&cfg),
            MpvEvent::decl(&cfg),
        ];
        let body: Vec<String> = decls
            .iter()
            .map(|d| format!("export {}", strip_doc_comments(d)))
            .collect();
        format!(
            "// Generated from src-tauri/src/mpv_ipc.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings\n\n{}\n",
            body.join("\n\n")
        )
    }

    // ts-rs copies Rust doc comments into JSDoc blocks; the TS side keeps its own notes.
    fn strip_doc_comments(decl: &str) -> String {
        let mut out = String::new();
        let mut rest = decl;
        while let Some(start) = rest.find("/**") {
            out.push_str(&rest[..start]);
            let end = rest[start..]
                .find("*/")
                .map(|e| start + e + 2)
                .unwrap_or(rest.len());
            rest = rest[end..].trim_start_matches(['\n', ' ']);
        }
        out.push_str(rest);
        out.replace(", \n", ", ")
    }

    fn bindings_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/lib/generated/mpv-ipc.ts")
    }

    #[test]
    fn export_bindings() {
        let expected = bindings();
        let path = bindings_path();
        if std::env::var_os("HARBOR_WRITE_BINDINGS").is_some() {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, &expected).unwrap();
            return;
        }
        let current = std::fs::read_to_string(&path)
            .unwrap_or_default()
            .replace("\r\n", "\n");
        assert_eq!(
            current, expected,
            "src/lib/generated/mpv-ipc.ts is stale; rerun this test with HARBOR_WRITE_BINDINGS=1"
        );
    }
}

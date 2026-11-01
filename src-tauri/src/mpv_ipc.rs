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

    #[test]
    fn export_bindings() {
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
        crate::ipc_bindings::check("mpv-ipc.ts", "mpv_ipc.rs", &decls);
    }
}

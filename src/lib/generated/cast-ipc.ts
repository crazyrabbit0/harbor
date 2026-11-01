// Generated from src-tauri/src/cast_ipc.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type CastKind = "chromecast" | "dlna" | "roku" | "airplay";

export type CastDeviceInfo = { id: string, name: string, host: string, port: number, model: string | null, kind: CastKind, control_url: string | null, audio_only: boolean, };

export type CastStatus = { position_sec: number, player_state: string, connected: boolean, transport_codec?: string, };

export type CastServerStatus = { bundled: boolean, running: boolean, ready: boolean, port: number | null, last_error: string | null, restart_count: number, };

export type CastSub = { kind: "external" | "embedded", url?: string, src_index?: number, format?: "srt" | "ass" | "ssa" | "vtt", off: boolean, };

export type CastSubStyle = { font_size: number, font_color: string, border_color: string, border_size: number, margin_y: number, align_x: "left" | "center" | "right", };

export type TranscodeProfile = { max_height: number, force_h264: boolean, force_aac: boolean, force_stereo: boolean, max_video_kbps?: number, };

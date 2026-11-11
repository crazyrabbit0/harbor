// Generated from src-tauri/src/stream_proxy.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type RegisterArgs = { url: string, headers?: { [key in string]: string }, transcode?: boolean, prebufferBytes?: number, profile?: TranscodeProfile, targetHost?: string, startTimeSec?: number, burnSubPath?: string, burnSubStyle?: string, audioOrdinal?: number, dlna?: boolean, };

export type RegisterResult = { session_id: string, url: string, };

export type TranscodeProfile = { max_height?: number, force_h264?: boolean, force_aac?: boolean, force_stereo?: boolean, max_video_kbps?: number, };

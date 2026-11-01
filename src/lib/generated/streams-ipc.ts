// Generated from src-tauri/src/streams_ipc.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type Resolution = "4K" | "1080p" | "720p" | "480p" | "SD";

export type HdrFormat = "HDR10" | "HDR10+" | "DV" | "DV+HDR10" | "HLG";

export type Codec = "HEVC" | "AVC" | "AV1" | "VP9" | "MPEG2" | "Other";

export type AudioCodec = "Atmos" | "TrueHD" | "DTS-HD MA" | "DTS" | "DD+" | "AC3" | "AAC" | "Opus" | "FLAC" | "Other";

export type Source = "BluRay" | "REMUX" | "WEB-DL" | "WEBRip" | "BDRip" | "HDRip" | "DVDRip" | "HDTV" | "CAM" | "TS" | "HDTS" | "TC" | "SCR" | "Other";

export type Tier = "4K_DV" | "4K_HDR" | "4K" | "1080p_HDR" | "1080p" | "720p" | "SD" | "ROUGH";

export type DebridSlug = "rd" | "tb" | "ad" | "pm" | "dl";

export type Container = "mkv" | "mp4" | "m4v" | "avi" | "webm" | "mov" | "ts" | "wmv";

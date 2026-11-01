// Generated from src-tauri/src/mpv_ipc.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type MpvProbe = { available: boolean, binary: string | null, version: string | null, error: string | null, };

export type AudioDevice = { name: string, description: string, };

export type MpvSub = { url: string, lang?: string | null, };

export type MpvGeometry = { cssLeft: number, cssTop: number, cssWidth: number, cssHeight: number, cssViewW: number, cssViewH: number, };

export type MonitorInfo = { id: string, deviceName: string, deviceId: string, name: string, isPrimary: boolean, x: number, y: number, width: number, height: number, scaleFactor: number, };

export type MpvStartArgs = { url: string, startAtSec?: number | null, subtitles?: Array<MpvSub> | null, anime4k?: boolean | null, hdrToSdr?: boolean | null, rtxHdr?: boolean | null, rtxVsr?: boolean | null, embed?: boolean | null, anime4kShaders?: Array<string> | null, d3d11Flip?: boolean | null, macEdr?: boolean | null, isLive?: boolean | null, fullDownload?: boolean | null, cacheDir?: string | null, startupProfile?: string | null, headers?: { [key in string]: string } | null, extraOptions?: string | null, renderer?: string | null, forceYuv420p?: boolean | null, separateDisplay?: MonitorInfo | null, separateCoverTaskbar?: boolean | null, };

export type EndFileReason = "eof" | "stop" | "quit" | "error" | "redirect" | "other";

export type MpvEvent = { "event": "property-change", name: string, data: unknown, } | { "event": "end-file", reason: EndFileReason, } | { "event": "file-loaded" } | { "event": "playback-restart" } | { "event": "seek" } | { "event": "shutdown" } | { "event": "log", prefix: string, level: string, text: string, } | { "event": "player-failure", reason: string, };

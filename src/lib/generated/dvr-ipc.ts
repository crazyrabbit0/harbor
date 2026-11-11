// Generated from src-tauri/livetv/src/dvr.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type DvrSession = { id: string, outputPath: string, channelName: string, programTitle: string | null, startedAtMs: number, plannedDurationSec: number, bytesWritten: number, elapsedSec: number, state: "recording" | "done" | "error", error: string | null, };

// Generated from src-tauri/src/crash_report.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type StartupCrashReport = { kind: "panic", version: string, platform: string, message: string | null, location: string | null, backtrace: string | null, };

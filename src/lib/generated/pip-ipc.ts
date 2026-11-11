// Generated from src-tauri/src/pip.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type PipSubtitle = { url: string, lang: string | null, label: string | null, };

export type PipSession = { url: string, startAtSec: number, playing: boolean, volume: number, muted: boolean, title: string | null, subtitle: string | null, subtitles: Array<PipSubtitle>, };

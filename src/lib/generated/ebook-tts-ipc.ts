// Generated from src-tauri/src/ebook_tts.rs; do not edit. Regenerate: HARBOR_WRITE_BINDINGS=1 cargo test export_bindings

export type EBookWordBoundary = { offsetMs: number, durationMs: number, text: string, };

export type EBookTtsResult = { audioBase64: string, boundaries: Array<EBookWordBoundary>, };

export type EBookTtsVoice = { id: string, locale: string, gender: string, name: string, };
